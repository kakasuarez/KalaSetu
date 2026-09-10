"""Chat message bodies for the coordinator <-> artisan thread."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class MessageIn(BaseModel):
    """A text message. Voice messages go through the multipart upload
    endpoint instead -- there is no file field a JSON body can carry."""

    body: str = Field(min_length=1, max_length=2000)


class MessageOut(ORMModel):
    id: str
    artisan_id: str
    sender: Literal["sakhi", "artisan"]
    kind: Literal["text", "voice"]
    body: str | None = None
    translated_body: str | None = None
    # Relative path ("media/voice/<uuid>.m4a"); the client resolves it with
    # resolveMediaUrl(). None for a text message.
    audio_path: str | None = None
    created_at: datetime
