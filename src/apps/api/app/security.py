"""
PIN hashing and JWT issue/verify.

Two deliberate departures from the PRD skeleton:

  * PyJWT instead of python-jose. python-jose 3.3.0 carries CVE-2024-33663 and
    CVE-2024-33664 and has been effectively unmaintained since 2021.
  * bcrypt is pinned to 4.0.x in requirements.txt. passlib 1.7.4 reads
    bcrypt.__about__, which bcrypt 4.1 removed, so the pairing raises
    AttributeError on the very first hash.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from app.config import settings

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_pin(pin: str) -> str:
    return pwd.hash(pin)


def verify_pin(pin: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return pwd.verify(pin, hashed)
    except ValueError:
        # Malformed hash in the database -- treat as a failed login, not a 500.
        return False


def create_token(sub: str | uuid.UUID, role: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(sub),
            "role": role,
            "iat": now,
            "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
        },
        settings.api_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_token(token: str) -> dict | None:
    """Returns the claims, or None for any invalid/expired/tampered token."""
    try:
        return jwt.decode(
            token,
            settings.api_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.PyJWTError:
        return None
