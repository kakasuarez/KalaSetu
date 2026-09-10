"""
The voice assistant behind the microphone button.

She asks a question out loud -- "how many things have I put up?", "what is my
basket priced at?", "add a new item" -- and gets a short spoken answer.

Scope is deliberately narrow: it answers from her own profile and her own
listings, and says it does not know about anything else. That keeps it useful
without pretending to be the RAG engine, which is a later phase with a real
retrieval corpus behind it (`routers/rag.py` stays reserved for that). A
confident wrong answer about her money would cost her more than a shrug.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import current_artisan
from app.models.artisan import Artisan
from app.models.listing import Listing
from app.services.llm import LLMUnavailable, complete_json

log = logging.getLogger("kalasetu")

router = APIRouter(prefix="/assistant", tags=["assistant"])

# Actions the app knows how to route on. Anything else must come back as null
# rather than as a guess the app would silently ignore.
ACTIONS = ("add_product", "open_catalog", "open_inbox", "open_profile")

SYSTEM = """You are the assistant inside KalaSetu, an app used by artisans in rural India.

You will be given FACTS about one artisan and her products, then her spoken question.

Rules:
1. Answer ONLY from the FACTS. If they do not contain the answer, say you do
   not know and suggest what she could do instead. Never estimate a number,
   a price, an earning or a date that is not in the FACTS.
2. Two short sentences at most. Plain words. This is read aloud, so no lists,
   no markdown, no symbols other than the rupee sign.
3. Speak to her directly as "you".
4. Set "action" when she is clearly asking to go somewhere or do something:
   "add_product" to start a new listing, "open_catalog" to see her products,
   "open_inbox" for buyer messages, "open_profile" for her own details.
   Otherwise set it to null.

Return JSON: {"answer": "...", "action": "add_product" | "open_catalog" | "open_inbox" | "open_profile" | null}
"""


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    lang: str = "hi"


class AskResponse(BaseModel):
    answer: str
    action: str | None = None


class _Answer(BaseModel):
    answer: str = ""
    action: str | None = None


def _money(value) -> str:
    return f"INR {value:.0f}" if value is not None else "no price set"


async def _facts(artisan: Artisan, db: AsyncSession) -> str:
    """Everything the model is allowed to know, as plain lines.

    Kept small on purpose: a compact block is cheaper, faster, and leaves less
    room for the model to blend two products together.
    """
    listings = list(
        await db.scalars(
            select(Listing)
            .where(Listing.artisan_id == artisan.id)
            .order_by(Listing.created_at.desc())
            .limit(40)
        )
    )

    lines = [
        f"Her name: {artisan.name}",
        f"Her village: {artisan.village or 'not given'}",
        f"Her craft: {artisan.primary_craft or 'not given'}",
        f"Years of practice: {artisan.years_experience or 'not given'}",
        f"Number of products in her shop: {len(listings)}",
    ]

    by_status: dict[str, int] = {}
    for listing in listings:
        by_status[listing.status] = by_status.get(listing.status, 0) + 1
    for status, count in sorted(by_status.items()):
        lines.append(f"Products with status {status}: {count}")

    for listing in listings[:20]:
        title = listing.title_en or listing.title_hi or "untitled"
        lines.append(f"Product: {title} | price {_money(listing.price)} | {listing.status}")

    # Said out loud rather than left implicit, so the model refuses these
    # questions instead of inventing a figure for them.
    lines.append(
        "Not known: her earnings, how much money she has been paid, buyer "
        "messages, orders, and delivery dates. These are not yet recorded."
    )
    return "\n".join(lines)


@router.post("/ask", response_model=AskResponse)
async def ask(
    body: AskRequest,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    facts = await _facts(artisan, db)
    user = f"FACTS:\n{facts}\n\nHER QUESTION:\n{body.question.strip()}"

    try:
        result = await complete_json(SYSTEM, user, _Answer)
    except LLMUnavailable as exc:
        log.warning("assistant unavailable: %s", exc)
        return AskResponse(
            answer="I cannot answer right now. Please try again in a moment.",
            action=None,
        )

    answer = result.answer.strip()
    if not answer:
        answer = "I did not understand that. Please say it again."

    action = result.action if result.action in ACTIONS else None
    return AskResponse(answer=answer, action=action)
