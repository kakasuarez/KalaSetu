"""
The central object. Every later phase fills fields on this row:
Phase 2 -> media, Phase 3 -> title/description/facts, Phase 4 -> price band,
Phase 5 -> craft_class/gi_tag, Phase 9 -> embedding, Phase 12 -> glb_media_id.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pgvector.sqlalchemy import Vector
from sqlalchemy import ARRAY, DateTime, Float, ForeignKey, Integer, Numeric, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUID, Base, created_at, pg_enum, uuid_pk

LISTING_STATUSES = ("draft", "ready", "published", "paused", "sold_out")


class Listing(Base):
    __tablename__ = "listings"

    id: Mapped[uuid.UUID] = uuid_pk()
    artisan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("artisans.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        pg_enum("listing_status", *LISTING_STATUSES), nullable=False, default="draft"
    )

    title_en: Mapped[str | None] = mapped_column(Text)
    title_hi: Mapped[str | None] = mapped_column(Text)
    description_en: Mapped[str | None] = mapped_column(Text)
    description_hi: Mapped[str | None] = mapped_column(Text)
    seo_keywords: Mapped[list[str] | None] = mapped_column(ARRAY(Text))

    # Confirmed facts only -- anything absent renders as "not specified".
    # The anti-hallucination contract from Phase 3 depends on this staying honest.
    facts: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    craft_class: Mapped[str | None] = mapped_column(Text)
    craft_confidence: Mapped[float | None] = mapped_column(Float)
    gi_tag: Mapped[str | None] = mapped_column(Text)
    heritage_note: Mapped[str | None] = mapped_column(Text)

    price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    price_p25: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    price_p50: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    price_p75: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    dignity_floor: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    price_reasons: Mapped[list | None] = mapped_column(JSONB, default=list)
    material_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))

    primary_media_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("media.id", ondelete="SET NULL")
    )
    media_ids: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(UUID(as_uuid=True)), nullable=False, default=list
    )
    glb_media_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("media.id", ondelete="SET NULL")
    )

    stock_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    source: Mapped[str] = mapped_column(Text, nullable=False, default="app")

    embedding: Mapped[list[float] | None] = mapped_column(Vector(768))
    # search_tsv is deliberately NOT mapped -- trg_listings_tsv owns it.

    views_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    orders_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_coached_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = created_at()
    # No onupdate=: trg_listings_tsv already sets updated_at on every write.
    # Declaring it here too would race the trigger and go stale on read.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Listing {self.id} {self.status}>"
