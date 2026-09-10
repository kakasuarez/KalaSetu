"""
A coordinator's message thread with one artisan.

Single-table, no separate `conversations` row: the thread IS "every message
where artisan_id matches", the same way apps/api/app/models/qa.py's
BuyerQuery has no parent conversation object. One fewer join for every read.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUID, Base, created_at, uuid_pk


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = uuid_pk()
    artisan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("artisans.id", ondelete="CASCADE"), nullable=False
    )
    # 'sakhi' | 'artisan'. Plain text, not a Postgres enum: apps/api's models
    # reference real enum types created once by infra/neon_setup.sql, but
    # message_sender/message_kind are new to this service, and this table is
    # interface-owned -- adding new enum TYPES (not just tables) to a shared
    # database is exactly the kind of schema growth alembic/env.py's
    # OWNED_TABLES filter exists to keep contained. Valid values are enforced
    # in schemas/sakhi.py with a Pydantic Literal instead.
    #
    # Always 'sakhi' here in practice -- there is no artisan-side chat UI yet,
    # so nothing writes 'artisan'. The column exists now so that screen is
    # additive later rather than a schema change.
    sender: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    # What the coordinator typed, in English. NULL for a voice message.
    body: Mapped[str | None] = mapped_column(Text)
    # body translated into the artisan's ArtisanProfile.language. NULL when
    # translation was skipped (voice messages, or GROQ_API_KEY unset/unreachable
    # -- app/services/translate.py fails soft rather than blocking a send).
    translated_body: Mapped[str | None] = mapped_column(Text)
    # Relative path under settings.local_storage_dir, e.g. "voice/<uuid>.m4a".
    # Resolved to a full URL client-side by @mobile/api/client's
    # resolveMediaUrl -- NULL for a text message.
    audio_path: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at()

    __table_args__ = (
        # Every read is "this artisan's thread, oldest first".
        Index("ix_messages_artisan_created", "artisan_id", "created_at"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Message {self.id} artisan={self.artisan_id} kind={self.kind}>"
