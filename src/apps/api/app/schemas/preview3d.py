"""3D preview schemas -- phase 12."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class Preview3DStartIn(BaseModel):
    media_id: str  # the source photo -- must be an image_raw/image_enhanced Media she owns
    # If given, the finished GLB is attached to Listing.glb_media_id
    # automatically once reconstruction succeeds -- must be a listing she owns.
    listing_id: str | None = None


class Preview3DStatusOut(BaseModel):
    job_id: str
    status: Literal["starting", "processing", "succeeded", "failed", "canceled"]
    # Populated once status == 'succeeded'.
    media_id: str | None = None
    glb_url: str | None = None
    error: str | None = None
