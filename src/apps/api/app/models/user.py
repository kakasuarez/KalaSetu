from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at, pg_enum, uuid_pk

USER_ROLES = ("artisan", "sakhi", "buyer", "admin")


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()
    phone: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    # NULL until she sets a PIN after her first OTP login.
    pin_hash: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str] = mapped_column(
        pg_enum("user_role", *USER_ROLES), nullable=False, default="artisan"
    )
    display_name: Mapped[str | None] = mapped_column(Text)
    preferred_lang: Mapped[str] = mapped_column(String, nullable=False, default="hi")
    created_at: Mapped[datetime] = created_at()

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<User {self.phone} role={self.role}>"
