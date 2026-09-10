"""
Listing schemas.

ListingCreate is deliberately narrow: in Phase 1 an artisan types a title and a
price by hand. The AI-owned fields (craft_class, the price band, embedding,
gi_tag) are set by later phases through their own endpoints, never by the
client, so they are absent from the writable models.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.listing import LISTING_STATUSES
from app.schemas.common import ORMModel
from app.schemas.media import MediaOut

# Draft and ready are the only statuses a Phase 1 client may set. `published`
# is owned by the Phase 8 publisher; sold_out follows an order.
CLIENT_SETTABLE_STATUSES = ("draft", "ready", "paused")


class ListingBase(BaseModel):
    title_en: str | None = Field(default=None, max_length=300)
    title_hi: str | None = Field(default=None, max_length=300)
    description_en: str | None = None
    description_hi: str | None = None
    seo_keywords: list[str] | None = None
    facts: dict | None = None
    price: Decimal | None = Field(default=None, ge=0, le=99_999_999)
    material_cost: Decimal | None = Field(default=None, ge=0, le=99_999_999)
    stock_qty: int | None = Field(default=None, ge=0, le=100_000)
    primary_media_id: uuid.UUID | None = None
    media_ids: list[uuid.UUID] | None = None
    # Deliberate exception to the "AI-owned fields are not client-writable"
    # rule below: in the Phase 3 wizard the artisan PICKS her craft from a
    # fixed list, so this is stated data, not a model's guess. Phase 5's
    # classifier will later write the same column, and a human choice
    # outranks it.
    craft_class: str | None = Field(default=None, max_length=64)


class ListingCreate(ListingBase):
    status: str = Field(default="draft", pattern="|".join(CLIENT_SETTABLE_STATUSES))
    source: str = Field(default="app", pattern="app|whatsapp|video")


class ListingUpdate(ListingBase):
    status: str | None = Field(default=None, pattern="|".join(CLIENT_SETTABLE_STATUSES))


class ListingOut(ORMModel):
    id: uuid.UUID
    artisan_id: uuid.UUID
    status: str

    title_en: str | None = None
    title_hi: str | None = None
    description_en: str | None = None
    description_hi: str | None = None
    seo_keywords: list[str] | None = None
    facts: dict

    craft_class: str | None = None
    craft_confidence: float | None = None
    gi_tag: str | None = None
    heritage_note: str | None = None

    price: Decimal | None = None
    price_p25: Decimal | None = None
    price_p50: Decimal | None = None
    price_p75: Decimal | None = None
    dignity_floor: Decimal | None = None
    price_reasons: list | None = None
    material_cost: Decimal | None = None

    primary_media_id: uuid.UUID | None = None
    # Resolved on every read, list included. A grid of cards that had to fetch
    # each listing individually just to learn its image URL would be one
    # request per tile on a village 3G connection.
    primary_media_url: str | None = None
    media_urls: list[str] = []
    media_ids: list[uuid.UUID]
    glb_media_id: uuid.UUID | None = None

    stock_qty: int
    source: str
    views_count: int
    orders_count: int

    created_at: datetime
    updated_at: datetime


class ListingDetail(ListingOut):
    """Listing plus every resolved media row, not only the primary one."""

    media: list[MediaOut] = []


__all__ = [
    "LISTING_STATUSES",
    "ListingCreate",
    "ListingDetail",
    "ListingOut",
    "ListingUpdate",
]
