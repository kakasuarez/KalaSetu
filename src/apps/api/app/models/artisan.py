from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Float, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUID, Base, created_at, uuid_pk


class Artisan(Base):
    __tablename__ = "artisans"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    # Sakhi-mode link. NULL = self-managed. Enforced in deps.current_artisan.
    managed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    village: Mapped[str | None] = mapped_column(Text)
    district: Mapped[str | None] = mapped_column(Text)
    state: Mapped[str | None] = mapped_column(Text)
    pincode: Mapped[str | None] = mapped_column(Text)
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)

    primary_craft: Mapped[str | None] = mapped_column(Text)
    years_experience: Mapped[int | None] = mapped_column(Integer)
    shg_cluster: Mapped[str | None] = mapped_column(Text)
    artisan_card_no: Mapped[str | None] = mapped_column(Text)
    story_native: Mapped[str | None] = mapped_column(Text)
    story_en: Mapped[str | None] = mapped_column(Text)
    photo_key: Mapped[str | None] = mapped_column(Text)
    monthly_capacity: Mapped[int | None] = mapped_column(Integer)

    # Graduation mode (Phase 13): 3=full AI, 2=guided, 1=review only.
    listings_completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    assist_level: Mapped[int] = mapped_column(Integer, nullable=False, default=3)

    created_at: Mapped[datetime] = created_at()

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Artisan {self.name}>"
