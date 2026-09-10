"""
Administrator: manage coordinators.

This is the only place a `sakhi` row is created. routers/auth.py will not mint
one for an unknown phone, so an account that can reach other people's
catalogues is always granted by someone who already holds one.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import current_admin
from app.errors import AppError
from app.models.artisan import Artisan
from app.models.user import User
from app.schemas.admin import CoordinatorIn, CoordinatorOut
from app.schemas.common import Ok

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/coordinators", response_model=list[CoordinatorOut])
async def list_coordinators(
    _: User = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    # One query, not one-plus-N: the artisan count comes back as an outer join
    # so a list of 50 coordinators is still a single round trip to Neon, where
    # every round trip is a wire hop to us-east-2.
    rows = (
        await db.execute(
            select(User, func.count(Artisan.id))
            .outerjoin(Artisan, Artisan.managed_by == User.id)
            .where(User.role == "sakhi")
            .group_by(User.id)
            .order_by(User.created_at.desc())
        )
    ).all()

    return [
        CoordinatorOut(
            id=str(user.id),
            phone=user.phone,
            display_name=user.display_name,
            created_at=user.created_at,
            artisan_count=count,
        )
        for user, count in rows
    ]


@router.post("/coordinators", response_model=CoordinatorOut, status_code=201)
async def create_coordinator(
    body: CoordinatorIn,
    _: User = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.scalar(select(User).where(User.phone == body.phone))
    if existing is not None:
        # Report the clash plainly. This endpoint is behind an admin token, so
        # there is no enumeration risk here -- and an admin who cannot tell
        # "already a coordinator" from "already an artisan" cannot fix it.
        raise AppError(
            "ALREADY_EXISTS",
            f"That number is already registered as {existing.role}",
            409,
            {"role": existing.role},
        )

    user = User(
        phone=body.phone,
        role="sakhi",
        display_name=body.name,
        preferred_lang="hi",
    )
    db.add(user)
    await db.flush()

    return CoordinatorOut(
        id=str(user.id),
        phone=user.phone,
        display_name=user.display_name,
        created_at=user.created_at,
        artisan_count=0,
    )


@router.delete("/coordinators/{coordinator_id}", response_model=Ok)
async def delete_coordinator(
    coordinator_id: uuid.UUID,
    _: User = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Remove a coordinator.

    Their artisans are NOT deleted. `artisans.managed_by` is ON DELETE SET
    NULL, so each one reverts to self-managed and keeps its catalogue -- an
    artisan's livelihood must not depend on whether her coordinator still
    works for the programme.
    """
    user = await db.scalar(
        select(User).where(User.id == coordinator_id, User.role == "sakhi")
    )
    if user is None:
        raise AppError("NOT_FOUND", "No such coordinator", 404)

    await db.delete(user)
    await db.flush()
    return Ok()
