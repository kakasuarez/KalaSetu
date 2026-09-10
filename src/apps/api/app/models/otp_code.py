"""
One-time codes, in Postgres.

apps/api keeps these in Redis (app/services/otp.py). This service has no Redis
by design, so the same three jobs -- store the code, expire it, count failed
attempts -- are done with columns instead of key TTLs.

The code is stored HASHED. An OTP is a credential for the few minutes it
lives, and anyone with read access to this table would otherwise be able to log
in as any phone number that had just requested one.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at, uuid_pk


class OtpCode(Base):
    __tablename__ = "otp_codes"

    id: Mapped[uuid.UUID] = uuid_pk()
    phone: Mapped[str] = mapped_column(Text, nullable=False)
    code_hash: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    # Failed verifications against THIS code. Replaces the Redis attempt
    # counter; the row is the lockout.
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Set the moment a code is accepted, so a valid OTP cannot be replayed.
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at()

    __table_args__ = (
        # Every lookup is "the newest unconsumed code for this phone".
        Index("ix_otp_codes_phone_created", "phone", "created_at"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<OtpCode {self.phone} consumed={self.consumed_at is not None}>"
