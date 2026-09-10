"""Admin and coordinator management bodies."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.auth import PhoneIn, normalise_phone
from app.schemas.common import ORMModel


class CoordinatorIn(PhoneIn):
    """Admin creating a coordinator. The phone is the whole account."""

    name: str = Field(min_length=1, max_length=120)


class CoordinatorOut(ORMModel):
    id: str
    phone: str
    display_name: str | None = None
    created_at: datetime
    # How many artisans this coordinator manages -- the one number that says
    # whether the account is actually being used.
    artisan_count: int = 0


class ManagedArtisanIn(BaseModel):
    """
    A coordinator registering an artisan she works with.

    phone is optional: many artisans in a cluster share a handset, and the
    coordinator can enrol them before they have their own number. Without one
    the artisan has a catalogue but cannot log in yet, which is the correct
    state, not a broken one.

    This does NOT subclass PhoneIn -- that model's validator would reject the
    None it is the whole point of this field to allow.
    """

    phone: str | None = None
    name: str = Field(min_length=1, max_length=120)
    village: str | None = None
    primary_craft: str | None = None
    # Shown to the coordinator and used as the translation target -- see
    # app/services/translate.py. Free text, not a code: "Hindi", not "hi".
    # No coordinates here -- lat/lon are auto-assigned server-side from
    # `village` (app/data/cities.py), not typed by hand.
    language: str = Field(default="Hindi", min_length=1, max_length=40)

    @field_validator("phone")
    @classmethod
    def _normalise_optional(cls, v: str | None) -> str | None:
        # Treat "" from an untouched form field as "not given", not as invalid.
        if v is None or not v.strip():
            return None
        return normalise_phone(v)


class ManagedArtisanOut(ORMModel):
    id: str
    name: str
    village: str | None = None
    primary_craft: str | None = None
    # None when the artisan has no user row yet, i.e. cannot log in herself.
    phone: str | None = None
    language: str
    lat: float
    lon: float
    created_at: datetime
