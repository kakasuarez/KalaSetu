from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUID, Base, created_at, pg_enum, uuid_pk

MEDIA_KINDS = (
    "image_raw",
    "image_enhanced",
    "audio",
    "video",
    "glb",
    "mockup",
    "card",
)


class Media(Base):
    __tablename__ = "media"

    id: Mapped[uuid.UUID] = uuid_pk()
    artisan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("artisans.id", ondelete="CASCADE")
    )
    kind: Mapped[str] = mapped_column(pg_enum("media_kind", *MEDIA_KINDS), nullable=False)

    # Provider-agnostic: a Cloudinary public_id, a local relative path, or an
    # R2 object key, depending on storage_backend.
    storage_key: Mapped[str] = mapped_column(Text, nullable=False)
    storage_backend: Mapped[str] = mapped_column(Text, nullable=False, default="local")

    mime: Mapped[str | None] = mapped_column(Text)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    # enhanced -> raw lineage, used by the before/after slider in Phase 2.
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("media.id", ondelete="SET NULL")
    )
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = created_at()

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Media {self.kind} {self.storage_key}>"
