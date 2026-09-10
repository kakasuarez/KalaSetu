"""Media schemas."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ORMModel


class MediaOut(ORMModel):
    id: uuid.UUID
    kind: str
    parent_id: uuid.UUID | None = None
    mime: str | None = None
    width: int | None = None
    height: int | None = None
    duration_ms: int | None = None
    created_at: datetime


class MediaUploadOut(BaseModel):
    """What the app needs after an upload: the id to attach, and a URL to show."""

    id: uuid.UUID
    kind: str
    url: str
    mime: str | None = None
    width: int | None = None
    height: int | None = None
    size_bytes: int


class MediaUrlOut(BaseModel):
    id: uuid.UUID
    url: str
