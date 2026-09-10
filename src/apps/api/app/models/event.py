"""Coaching nudges and the raw event log. Phases 10-11."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUID, Base, created_at, uuid_pk


class CoachNudge(Base):
    __tablename__ = "coach_nudges"

    id: Mapped[uuid.UUID] = uuid_pk()
    artisan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("artisans.id", ondelete="CASCADE"),
        nullable=False,
    )
    listing_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("listings.id", ondelete="CASCADE")
    )
    # demand_signal | stale_listing | price_adjust | motif_idea
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    message_native: Mapped[str | None] = mapped_column(Text)
    audio_key: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acted_on: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = created_at()


class Event(Base):
    __tablename__ = "events"

    # BIGSERIAL, not a UUID -- append-only and high volume.
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    # Deliberately not foreign keys: events outlive the rows they describe.
    artisan_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    listing_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    # view | impression | query | order | publish
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = created_at()
