"""Coach schemas -- phase 10."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


class CoachCardOut(BaseModel):
    """
    One card, shaped to match CoachCard in
    apps/mobile/src/data/sampleContent.ts exactly -- the Learn screen already
    renders this shape against sample data; this is what makes swapping the
    sample constant for a real fetch a one-line change, not a rewrite.
    """

    kind: Literal["demand", "motif", "stale", "questions"]
    title: str
    action: str
    focus: bool = False
    impact_rupees: int = 0
    # Present only on their matching kind -- optional here, required in the
    # union sampleContent.ts defines, because the API sends one flat shape
    # and lets absent fields mean "not this kind" rather than modelling a
    # discriminated union twice.
    body: str | None = None
    fromPrice: str | None = None
    toPrice: str | None = None
    product: str | None = None
    fix: str | None = None
    meta: dict[str, Any] = {}


class CoachCardsOut(BaseModel):
    cards: list[CoachCardOut]
    generated_at: str


class DigestOut(BaseModel):
    date: str
    live_listings: int
    views_total: int
    orders_today: int
    revenue_today: float
    message_en: str
    message_hi: str


class TemplateOut(BaseModel):
    id: str
    label: str
    base_price: int


class MockupOut(BaseModel):
    media_id: str
    url: str
    template: str
    label: str
    current_price: int
    potential_price: int
    multiplier: float
    uplift: int


class NudgeActionIn(BaseModel):
    acted_on: bool = True
