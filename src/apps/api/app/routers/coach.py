"""
The business coach -- PRD phase 10.

Every route resolves its artisan through deps.current_artisan, same as every
other endpoint since Phase 1, so a coordinator acting for an artisan she
manages sees exactly that artisan's coaching, and tenant isolation is not a
second thing this router has to get right.
"""
from __future__ import annotations

import datetime as dt
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import current_artisan
from app.errors import AppError
from app.models.artisan import Artisan
from app.models.event import CoachNudge
from app.models.listing import Listing
from app.models.media import Media
from app.schemas.coach import (
    CoachCardOut,
    CoachCardsOut,
    DigestOut,
    MockupOut,
    NudgeActionIn,
    TemplateOut,
)
from app.schemas.common import Ok
from app.services import coach as coach_service
from app.services import mockup as mockup_service
from app.services import storage as storage_service

router = APIRouter(prefix="/coach", tags=["coach"])


@router.get("/cards", response_model=CoachCardsOut)
async def get_cards(
    persist: bool = True,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    """
    Today's coaching cards, ranked by rupee impact.

    persist=True (the default) writes them to coach_nudges and stamps
    last_coached_at on any listing a card came from, which is what makes the
    14-day quiet period real. The app's pull-to-refresh should pass
    persist=false so casually reopening the screen does not reset that clock.
    """
    cards = await coach_service.build_cards(db, artisan)
    if persist and cards:
        await coach_service.persist_nudges(db, artisan, cards)

    return CoachCardsOut(
        cards=[CoachCardOut(**c) for c in cards],
        generated_at=dt.datetime.now(dt.timezone.utc).isoformat(),
    )


@router.get("/digest", response_model=DigestOut)
async def get_digest(
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    """
    "Aaj aapke 3 products 40 logon ne dekhe..." -- Features.docx #14.

    Returned for the app to show or speak on demand. Push delivery (the 7pm
    WhatsApp voice note the PRD describes) is a job for the scheduler plus
    Phase 7's WhatsApp sender, neither of which exists yet; this endpoint is
    what that job would call once they do, so it is not blocked on them.
    """
    digest = await coach_service.daily_digest(db, artisan)
    return DigestOut(**digest)


@router.get("/templates", response_model=list[TemplateOut])
async def list_templates(artisan: Artisan = Depends(current_artisan)):
    """No artisan-specific filtering (yet) -- the dependency is here only to
    keep this behind auth like every other coach route, not because the
    catalog varies per artisan."""
    return [TemplateOut(**t) for t in mockup_service.template_catalog()]


@router.post("/mockup/{template}", response_model=MockupOut)
async def generate_mockup(
    template: str,
    media_id: uuid.UUID,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    """
    Warp one of her own photos onto a modern product template.

    media_id must be a photo SHE uploaded -- scoped by artisan_id the same
    way get_media_url in routers/media.py is, and for the same reason: a
    mockup id is not a licence to warp a stranger's photo.
    """
    source = await db.scalar(
        select(Media).where(Media.id == media_id, Media.artisan_id == artisan.id)
    )
    if source is None:
        raise AppError("NOT_FOUND", "Media not found", 404)

    backend = storage_service.get_storage()
    if source.storage_backend != backend.name:
        raise AppError(
            "STORAGE_MISMATCH",
            f"This file was stored on '{source.storage_backend}' but the "
            f"server is configured for '{backend.name}'",
            409,
        )
    motif_bytes = backend.get(source.storage_key)

    jpeg = mockup_service.apply_motif(motif_bytes, template)

    # Her cheapest live listing price is the "before" -- see services/coach.py
    # for why this must trace to a real row rather than a guess.
    cheapest = await db.scalar(
        select(func.min(Listing.price)).where(
            Listing.artisan_id == artisan.id,
            Listing.price.is_not(None),
            Listing.status.in_(("published", "ready")),
        )
    )
    story = mockup_service.value_story(template, float(cheapest or 250))

    key = backend.put(
        jpeg,
        prefix=f"mockup/{artisan.id}",
        ext="jpg",
        kind="mockup",
        content_type="image/jpeg",
    )
    mockup_media = Media(
        artisan_id=artisan.id,
        kind="mockup",
        parent_id=source.id,
        storage_key=key,
        storage_backend=backend.name,
        mime="image/jpeg",
        meta={"template": template, "source_media_id": str(source.id)},
    )
    db.add(mockup_media)
    await db.flush()
    await db.refresh(mockup_media)

    return MockupOut(
        media_id=str(mockup_media.id),
        url=backend.url(key, "mockup"),
        template=template,
        label=story["label"],
        current_price=story["current_price"],
        potential_price=story["potential_price"],
        multiplier=story["multiplier"],
        uplift=story["uplift"],
    )


@router.patch("/nudges/{nudge_id}", response_model=Ok)
async def act_on_nudge(
    nudge_id: uuid.UUID,
    body: NudgeActionIn,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    """
    Mark a nudge acted-on, so build_cards stops repeating advice she took.

    Scoped to the calling artisan for the same reason every other write here
    is -- a nudge id from someone else's account must 404, not 403.
    """
    nudge = await db.scalar(
        select(CoachNudge).where(CoachNudge.id == nudge_id, CoachNudge.artisan_id == artisan.id)
    )
    if nudge is None:
        raise AppError("NOT_FOUND", "Nudge not found", 404)

    nudge.acted_on = body.acted_on
    db.add(nudge)
    await db.flush()
    return Ok()
