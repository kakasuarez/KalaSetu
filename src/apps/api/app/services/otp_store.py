"""
OTP issue/verify and PIN login throttling, in Postgres.

A deliberate mirror of apps/api/app/services/otp.py: same public function
names, same semantics, `db` where that module takes `redis`. Keeping them
aligned is what makes moving this service onto the shared Redis later a
dependency swap rather than a rewrite.

  issue_otp / verify_otp        <- otp:{phone}         -> otp_codes
  assert_not_locked             <- pin_attempts:{phone} -> login_attempts
  record_failure / clear_failures

No SMS provider, for the reason the original gives: the PRD is explicit that
wiring one costs a day and buys nothing for the demo. In dev the code comes
back in the response body.

Both throttles are load-bearing. A 4-digit secret is 10,000 combinations; the
original calls the lockout "not optional" and it is not optional here either.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.errors import AppError
from app.models.login_attempt import LoginAttempt
from app.models.otp_code import OtpCode
from app.security import hash_pin, verify_pin


def generate_otp() -> str:
    """Cryptographically random, zero-padded to the configured length."""
    upper = 10 ** settings.otp_length
    return str(secrets.randbelow(upper)).zfill(settings.otp_length)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------
# OTP  (Redis: otp:{phone})
# --------------------------------------------------------------------------


async def _latest_live_code(db: AsyncSession, phone: str) -> OtpCode | None:
    """The newest code for this phone that is neither used nor expired."""
    return await db.scalar(
        select(OtpCode)
        .where(
            OtpCode.phone == phone,
            OtpCode.consumed_at.is_(None),
            OtpCode.expires_at > _now(),
        )
        .order_by(OtpCode.created_at.desc())
        .limit(1)
    )


async def issue_otp(db: AsyncSession, phone: str) -> str:
    """
    Mint a code and retire any earlier one for this phone.

    Retiring matters: leaving the previous code live would let a caller reset
    its attempt counter just by asking for another one -- the whole lockout,
    defeated by a button the user can already press.
    """
    await db.execute(
        update(OtpCode)
        .where(OtpCode.phone == phone, OtpCode.consumed_at.is_(None))
        .values(consumed_at=_now())
    )

    code = generate_otp()
    db.add(
        OtpCode(
            phone=phone,
            code_hash=hash_pin(code),
            expires_at=_now() + timedelta(seconds=settings.otp_ttl_seconds),
        )
    )
    await db.flush()
    return code


async def verify_otp(db: AsyncSession, phone: str, code: str) -> bool:
    """
    Check a code, consuming it on success.

    Returns False rather than raising so the caller owns the message:
    distinguishing "wrong code" from "no such phone" would let anyone
    enumerate registered numbers. The one exception is the lockout, which
    raises -- the caller cannot usefully hide a 429.

    verify_pin is a bcrypt compare and so already constant-time; the plaintext
    equivalent in apps/api uses secrets.compare_digest for the same reason.
    """
    row = await _latest_live_code(db, phone)
    if row is None:
        return False

    if row.attempts >= settings.pin_max_attempts:
        remaining = int((row.expires_at - _now()).total_seconds())
        raise AppError(
            "TOO_MANY_ATTEMPTS",
            "Too many incorrect codes. Request a new one shortly.",
            429,
            {"retry_after_seconds": max(remaining, 0)},
        )

    if not verify_pin(code, row.code_hash):
        row.attempts += 1
        db.add(row)
        # COMMIT, not flush. The caller answers a bad code by raising AppError,
        # and get_db rolls the request back on any exception -- which would
        # discard the very count that makes this a lockout. Redis was outside
        # the transaction and did not have this problem; a table is inside it.
        await db.commit()
        return False

    # Single use -- a valid code must not be replayable.
    row.consumed_at = _now()
    db.add(row)
    await db.flush()
    return True


# --------------------------------------------------------------------------
# PIN throttle  (Redis: pin_attempts:{phone})
# --------------------------------------------------------------------------


async def assert_not_locked(db: AsyncSession, phone: str) -> None:
    row = await db.scalar(
        select(LoginAttempt).where(LoginAttempt.phone == phone)
    )
    if row is None or row.locked_until is None:
        return
    if row.locked_until > _now():
        raise AppError(
            "TOO_MANY_ATTEMPTS",
            "Too many incorrect PINs. Try again later.",
            429,
            {"retry_after_seconds": int((row.locked_until - _now()).total_seconds())},
        )
    # The window has passed. Reset here rather than leaving a stale lock that
    # the next failure would immediately re-trip.
    row.attempts = 0
    row.locked_until = None
    db.add(row)
    await db.flush()


async def record_failure(db: AsyncSession, phone: str) -> int:
    """Count a bad PIN. The window starts at the first failure."""
    row = await db.scalar(
        select(LoginAttempt).where(LoginAttempt.phone == phone)
    )
    if row is None:
        row = LoginAttempt(phone=phone, attempts=0)
        db.add(row)

    row.attempts += 1
    if row.attempts >= settings.pin_max_attempts:
        row.locked_until = _now() + timedelta(seconds=settings.pin_lockout_seconds)
    db.add(row)
    # COMMIT, not flush -- see the note in verify_otp. pin_login raises
    # immediately after calling this, and a rolled-back counter is no counter.
    await db.commit()
    return row.attempts


async def clear_failures(db: AsyncSession, phone: str) -> None:
    row = await db.scalar(
        select(LoginAttempt).where(LoginAttempt.phone == phone)
    )
    if row is not None:
        row.attempts = 0
        row.locked_until = None
        db.add(row)
        await db.flush()


# --------------------------------------------------------------------------
# Housekeeping
# --------------------------------------------------------------------------


async def purge_expired(db: AsyncSession) -> int:
    """
    Redis expiry was free; a table needs sweeping.

    Not on a scheduler -- the row count is trivial at demo scale -- but it
    lives here so the cleanup is not reinvented later.
    """
    result = await db.execute(
        OtpCode.__table__.delete().where(OtpCode.expires_at < _now())
    )
    return result.rowcount or 0
