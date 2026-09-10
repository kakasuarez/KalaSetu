"""RAG corpus and buyer-query models. Filled in by Phases 7 and 9.

Defined now so Base.metadata matches the live schema -- alembic autogenerate
emits DROP TABLE for any table it cannot see a model for.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import ARRAY, Boolean, DateTime, Float, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUID, Base, created_at, pg_enum, uuid_pk

KB_SOURCES = ("artisan_qa", "listing_fact", "craft_knowledge", "policy", "scheme")
QUERY_STATUSES = ("answered_auto", "escalated", "answered_artisan", "abandoned")


class KbDocument(Base):
    __tablename__ = "kb_documents"

    id: Mapped[uuid.UUID] = uuid_pk()
    source: Mapped[str] = mapped_column(pg_enum("kb_source", *KB_SOURCES), nullable=False)
    # NULL artisan_id = global knowledge (craft facts, government schemes).
    artisan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("artisans.id", ondelete="CASCADE")
    )
    listing_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("listings.id", ondelete="CASCADE")
    )
    craft_class: Mapped[str | None] = mapped_column(Text)
    lang: Mapped[str] = mapped_column(Text, nullable=False, default="en")
    title: Mapped[str | None] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_native: Mapped[str | None] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(768))
    # search_tsv is owned by trg_kb_tsv.
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = created_at()


class BuyerQuery(Base):
    __tablename__ = "buyer_queries"

    id: Mapped[uuid.UUID] = uuid_pk()
    listing_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("listings.id", ondelete="CASCADE")
    )
    artisan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("artisans.id", ondelete="CASCADE")
    )
    channel: Mapped[str] = mapped_column(Text, nullable=False)
    buyer_ref: Mapped[str | None] = mapped_column(Text)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    question_lang: Mapped[str | None] = mapped_column(Text)
    answer: Mapped[str | None] = mapped_column(Text)
    answer_source: Mapped[str | None] = mapped_column(Text)
    retrieved_ids: Mapped[list[uuid.UUID] | None] = mapped_column(ARRAY(UUID(as_uuid=True)))
    top_score: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(
        pg_enum("query_status", *QUERY_STATUSES), nullable=False, default="escalated"
    )
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at()
