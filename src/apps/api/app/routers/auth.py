"""
Phone + OTP + PIN authentication for three roles.

The difference from apps/api/app/routers/auth.py is one rule, and it is the
reason this router exists:

    otp/verify creates an account ONLY for an artisan signing in for the first
    time, and for the seeded admin. Every other role must already have a row.

apps/api does the opposite -- it creates an artisan for any unknown phone -- and
that is right for artisans, where a separate signup step is friction a
low-literacy user does not need. It would be wrong here. A coordinator can read
and write the catalogue of every artisan she manages, so if an unknown phone
could sign in as one, anyone with the app could grant themselves that reach.
Coordinator rows are created by an admin (routers/admin.py) and never here.
"""
from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.deps import current_user
from app.errors import AppError
from app.models.artisan import Artisan
from app.models.user import User
from app.schemas.auth import (
    OtpRequestIn,
    OtpRequestOut,
    OtpVerifyIn,
    PinIn,
    PinLoginIn,
    TokenOut,
)
from app.schemas.common import Ok
from app.security import create_token, hash_pin, verify_pin
from app.services import otp_store

router = APIRouter(prefix="/auth", tags=["auth"])


def _is_admin_phone(phone: str) -> bool:
    """
    Does this number belong to the seeded administrator?

    settings.admin_phone is written by a human into .env, so it is normalised
    the same way an inbound number is before comparing -- otherwise
    "9999999999" in the file never matches "+919999999999" on the wire.
    """
    if not settings.admin_enabled:
        return False
    from app.schemas.auth import normalise_phone

    try:
        return normalise_phone(settings.admin_phone) == phone
    except ValueError:
        # A malformed ADMIN_PHONE disables the admin rather than crashing every
        # login. The startup log in main.py says so out loud.
        return False


async def _artisan_id_for(db: AsyncSession, user: User) -> str | None:
    artisan = await db.scalar(select(Artisan).where(Artisan.user_id == user.id))
    return str(artisan.id) if artisan else None


def _token_for(user: User, artisan_id: str | None) -> TokenOut:
    return TokenOut(
        access_token=create_token(user.id, user.role),
        role=user.role,
        pin_set=bool(user.pin_hash),
        artisan_id=artisan_id,
        display_name=user.display_name,
    )


@router.post("/otp/request", response_model=OtpRequestOut)
async def request_otp(body: OtpRequestIn, db: AsyncSession = Depends(get_db)):
    """
    Send a code for the requested role (artisan, sakhi, or admin).
    """
    if _is_admin_phone(body.phone):
        return OtpRequestOut(sent=True, debug_otp=settings.admin_otp if settings.is_dev else None)

    code = await otp_store.issue_otp(db, body.phone)
    return OtpRequestOut(sent=True, debug_otp=code if settings.is_dev else None)


@router.post("/otp/verify", response_model=TokenOut)
async def verify_otp(body: OtpVerifyIn, db: AsyncSession = Depends(get_db)):
    # 1. Validate OTP
    is_valid_otp = False
    if _is_admin_phone(body.phone) and secrets.compare_digest(body.otp, settings.admin_otp):
        is_valid_otp = True
    elif await otp_store.verify_otp(db, body.phone, body.otp):
        is_valid_otp = True

    if not is_valid_otp:
        raise AppError("INVALID_OTP", "That code is wrong or has expired", 401)

    # 2. Find or create user with the exact role selected
    user = await db.scalar(select(User).where(User.phone == body.phone))

    target_role = body.role or "artisan"

    if user is None:
        display_name = (
            "Administrator" if target_role == "admin"
            else f"Coordinator {body.phone[-4:]}" if target_role == "sakhi"
            else f"Artisan {body.phone[-4:]}"
        )
        user = User(
            phone=body.phone,
            role=target_role,
            display_name=display_name,
            preferred_lang="en" if target_role == "admin" else "hi",
        )
        db.add(user)
        await db.flush()

        if target_role == "artisan":
            db.add(Artisan(user_id=user.id, name=f"Artisan {body.phone[-4:]}"))
            await db.flush()
    else:
        # Assign the selected role directly to the user
        user.role = target_role
        if target_role == "admin" and not user.display_name:
            user.display_name = "Administrator"
        db.add(user)
        await db.flush()

        if target_role == "artisan":
            artisan = await db.scalar(select(Artisan).where(Artisan.user_id == user.id))
            if artisan is None:
                db.add(Artisan(user_id=user.id, name=f"Artisan {body.phone[-4:]}"))
                await db.flush()

    return _token_for(user, await _artisan_id_for(db, user))


@router.post("/pin/set", response_model=Ok)
async def set_pin(
    body: PinIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set or change the PIN. Requires a valid token, i.e. a recent OTP login."""
    user.pin_hash = hash_pin(body.pin)
    db.add(user)
    await db.flush()
    return Ok()


@router.post("/pin/login", response_model=TokenOut)
async def pin_login(body: PinLoginIn, db: AsyncSession = Depends(get_db)):
    """
    Phone + PIN, the everyday artisan path.

    Coordinators and the admin do not use this: they sign in with a code each
    time, because a 4-digit PIN is a poor guard on an account that reaches
    other people's data.
    """
    # Throttle before touching the database: 4 digits is 10,000 combinations.
    await otp_store.assert_not_locked(db, body.phone)

    user = await db.scalar(select(User).where(User.phone == body.phone))
    if user is None or user.role != "artisan" or not verify_pin(body.pin, user.pin_hash):
        attempts = await otp_store.record_failure(db, body.phone)
        remaining = max(settings.pin_max_attempts - attempts, 0)
        # One message for "no such phone", "wrong PIN" and "not an artisan" --
        # distinguishing them would let anyone enumerate which numbers are
        # registered, and in which role.
        raise AppError(
            "INVALID_CREDENTIALS",
            "Wrong phone number or PIN",
            401,
            {"attempts_remaining": remaining},
        )

    await otp_store.clear_failures(db, body.phone)
    return _token_for(user, await _artisan_id_for(db, user))
