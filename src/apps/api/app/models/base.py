"""
Shared model pieces.

Column types mirror infra/neon_setup.sql exactly. Where the database owns a
value -- server defaults, the tsvector triggers -- the model defers to it
rather than keeping a second Python-side source of truth.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

__all__ = ["Base", "uuid_pk", "created_at", "pg_enum", "UUID", "TimestampMixin"]


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def created_at() -> Mapped[datetime]:
    # server_default, not a Python default: the database is the clock.
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


def pg_enum(name: str, *values: str) -> ENUM:
    """
    Reference an enum that already exists in the database.

    create_type=False is essential: the type is created by
    infra/neon_setup.sql, and without this Alembic tries to CREATE TYPE again
    on every autogenerate.
    """
    return ENUM(*values, name=name, create_type=False)


class TimestampMixin:
    created_at: Mapped[datetime] = created_at()
