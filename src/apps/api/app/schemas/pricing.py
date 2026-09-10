"""Schemas for the multimodal pricing assistant."""
from __future__ import annotations

import uuid
from decimal import Decimal

from pydantic import BaseModel, Field


class PricingSuggestIn(BaseModel):
    image_media_id: uuid.UUID
    audio_media_id: uuid.UUID | None = None
    transcript: str | None = Field(default=None, max_length=5000)
    language: str = Field(default="hi", min_length=2, max_length=16)
    state: str = Field(default="UP", min_length=2, max_length=3)
    facts: dict = Field(default_factory=dict)


class PricingReason(BaseModel):
    factor: str
    impact: str
    message: str


class PricingSuggestOut(BaseModel):
    currency: str = "INR"
    low: Decimal
    recommended: Decimal
    high: Decimal
    dignity_floor: Decimal
    floor_breached: bool
    confidence: float = Field(ge=0, le=1)
    extracted_facts: dict
    reasons: list[PricingReason]
    missing_facts: list[str]
    engine: str
