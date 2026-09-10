"""Artisan profile schemas."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class ArtisanOut(ORMModel):
    id: uuid.UUID
    name: str
    village: str | None = None
    district: str | None = None
    state: str | None = None
    pincode: str | None = None
    primary_craft: str | None = None
    years_experience: int | None = None
    shg_cluster: str | None = None
    artisan_card_no: str | None = None
    story_native: str | None = None
    story_en: str | None = None
    photo_key: str | None = None
    # photo_key is a storage key, which is meaningless to the app. The URL is
    # resolved on read the way ListingOut.primary_media_url is.
    photo_url: str | None = None
    # Regenerated whenever the profile changes, so the app can show the card
    # without knowing how it is built.
    story_card_url: str | None = None
    monthly_capacity: int | None = None
    listings_completed: int
    assist_level: int
    created_at: datetime


class ArtisanUpdate(BaseModel):
    """All optional -- PATCH semantics, only the sent fields are applied."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    village: str | None = None
    district: str | None = None
    state: str | None = None
    pincode: str | None = Field(default=None, pattern=r"^\d{6}$")
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)
    primary_craft: str | None = None
    years_experience: int | None = Field(default=None, ge=0, le=90)
    shg_cluster: str | None = None
    artisan_card_no: str | None = None
    story_native: str | None = None
    story_en: str | None = None
    monthly_capacity: int | None = Field(default=None, ge=0)
    # Set the profile photo by pointing at media the artisan already uploaded,
    # rather than trusting a client-supplied storage key.
    photo_media_id: uuid.UUID | None = None
