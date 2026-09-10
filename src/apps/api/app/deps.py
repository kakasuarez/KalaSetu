"""
Request-scoped dependencies: who is calling, and which artisan they may act for.

current_artisan is built now, in Phase 1, even though Sakhi mode ships in
Phase 11. Every endpoint from here on resolves its artisan through it, so
multi-tenancy never has to be retrofitted across the whole surface.
"""
from __future__ import annotations

import uuid

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.errors import AppError
from app.models.artisan import Artisan
from app.models.user import User
from app.security import decode_token


bearer_scheme = HTTPBearer(auto_error=False)


def _as_uuid(value: str | None) -> uuid.UUID | None:
    """Parse a UUID without letting a malformed one become a 500."""
    if not value:
        return None
    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError, TypeError):
        return None


async def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    authorization = (
        f"{credentials.scheme} {credentials.credentials}"
        if credentials
        else ""
    )
    if not authorization.startswith("Bearer "):
        raise AppError("UNAUTHORIZED", "Missing bearer token", 401)

    payload = decode_token(authorization.removeprefix("Bearer ").strip())
    if not payload:
        raise AppError("UNAUTHORIZED", "Invalid or expired token", 401)

    # sub is a string in the JWT; users.id is a UUID column. Comparing the two
    # directly makes asyncpg raise, so parse it here.
    user_id = _as_uuid(payload.get("sub"))
    if not user_id:
        raise AppError("UNAUTHORIZED", "Malformed token subject", 401)

    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise AppError("UNAUTHORIZED", "User not found", 401)
    return user


async def current_admin(user: User = Depends(current_user)) -> User:
    """
    The administrator.

    The role is read from the database row, never from the JWT claim: a token
    outlives a demotion, and `role` in the claim is a convenience for the app's
    routing, not a grant.
    """
    if user.role != "admin":
        raise AppError("FORBIDDEN", "Administrator access required", 403)
    return user


async def current_sakhi(user: User = Depends(current_user)) -> User:
    """A coordinator. Same rule: the row decides, not the token."""
    if user.role != "sakhi":
        raise AppError("FORBIDDEN", "Coordinator access required", 403)
    return user


async def current_artisan(
    x_artisan_id: str | None = Header(default=None),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> Artisan:
    """
    Resolves the artisan context.

    Sakhi mode: a user with role='sakhi' may pass X-Artisan-Id to act on behalf
    of an artisan they manage. The managed_by link is verified server-side --
    the header alone is never trusted.
    """
    if x_artisan_id:
        artisan_id = _as_uuid(x_artisan_id)
        if not artisan_id:
            raise AppError("BAD_REQUEST", "X-Artisan-Id is not a valid id", 400)
        if user.role != "sakhi":
            raise AppError(
                "FORBIDDEN", "Only a sakhi may act on behalf of another artisan", 403
            )
        artisan = await db.scalar(
            select(Artisan).where(
                Artisan.id == artisan_id, Artisan.managed_by == user.id
            )
        )
        if not artisan:
            raise AppError("FORBIDDEN", "Not authorised for this artisan", 403)
        return artisan

    artisan = await db.scalar(select(Artisan).where(Artisan.user_id == user.id))
    if not artisan:
        raise AppError("NO_PROFILE", "Artisan profile not created", 404)
    return artisan

