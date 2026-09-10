"""
PIN-login throttling, in Postgres.

This is the table form of the Redis key apps/api uses
(`pin_attempts:{phone}`, INCR with an EXPIRE on first failure). `locked_until`
does the job the TTL did: one row per phone, rewritten rather than accumulated.

It exists because a 4-digit PIN is 10,000 combinations. Without a lockout an
artisan's account falls to a shell loop in under a minute, which is why the
original calls the throttle "not optional".
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at, uuid_pk


class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    id: Mapped[uuid.UUID] = uuid_pk()
    # One row per phone. Unique so a race cannot produce two counters that each
    # stay under the limit.
    phone: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # NULL until the limit is hit. The window starts at the first failure, as
    # in the Redis version.
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at()

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<LoginAttempt {self.phone} attempts={self.attempts}>"
