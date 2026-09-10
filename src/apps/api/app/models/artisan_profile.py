"""
Demo-facing extras for an artisan profile: language and a map position.

Deliberately NOT columns on `artisans` itself. That table is owned by
apps/api (see alembic/env.py's OWNED_TABLES) -- adding a column here would
mean this service silently mutating a schema it does not own, and a later
merge would have to decide which service's `lat`/`lon` semantics win. A
one-to-one side table keeps the answer to that question "neither, yet" until
someone deliberately merges them.

No photo column: a profile picture is rendered client-side as an initials
avatar (Avatar.tsx), coloured deterministically from the artisan's name.
Real photo upload is a bigger feature (camera/gallery picker, storage) that
belongs in the merged app, not this slice.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Float, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUID, Base, created_at


class ArtisanProfile(Base):
    __tablename__ = "artisan_profiles"

    # One row per artisan. The FK is the primary key, not a separate id --
    # this table only ever has zero or one row per artisan, so a surrogate
    # key would just be a second way to violate that.
    artisan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("artisans.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # A BCP-47-ish label ("Hindi"), not a code -- this is shown to the
    # coordinator directly and used as the translation target's display name.
    language: Mapped[str] = mapped_column(Text, nullable=False, default="Hindi")
    # Approximate pin position for the India map. Auto-assigned from the
    # artisan's village against a small city lookup (app/data/cities.py) when
    # she's created, not entered by hand -- asking a coordinator to type
    # coordinates is not a real workflow.
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = created_at()

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<ArtisanProfile {self.artisan_id} lang={self.language}>"
