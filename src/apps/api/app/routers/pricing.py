from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import current_artisan
from app.errors import AppError
from app.models.artisan import Artisan
from app.models.media import Media
from app.schemas.pricing import PricingSuggestIn, PricingSuggestOut
from app.services import gemini, storage as storage_service
from app.services.pricing import PricingEngine

router = APIRouter(prefix="/pricing", tags=["pricing"])


async def _owned_media(media_id: uuid.UUID, artisan_id: uuid.UUID,
                       db: AsyncSession) -> Media:
    media = await db.scalar(
        select(Media).where(Media.id == media_id, Media.artisan_id == artisan_id)
    )
    if not media:
        raise AppError("NOT_FOUND", "Media not found", 404)
    return media


@router.post("/suggest", response_model=PricingSuggestOut)
@router.post("/suggest", response_model=PricingSuggestOut)
async def suggest_price(body: PricingSuggestIn,
                        artisan: Artisan = Depends(current_artisan),
                        db: AsyncSession = Depends(get_db)):
    image = await _owned_media(body.image_media_id, artisan.id, db)
    if not (image.mime or "").startswith("image/"):
        raise AppError("BAD_REQUEST", "image_media_id must reference an image", 400)

    audio = None
    audio_media = None
    if body.audio_media_id:
        audio_media = await _owned_media(body.audio_media_id, artisan.id, db)
        if audio_media.kind != "audio":
            raise AppError("BAD_REQUEST", "audio_media_id must reference audio", 400)
        try:
            audio = storage_service.get_storage().get(audio_media.storage_key)
        except Exception:
            audio = None

    backend = storage_service.get_storage()
    try:
        image_bytes = backend.get(image.storage_key)
    except Exception as e:
        raise AppError("NOT_FOUND", "Failed to retrieve image file from storage", 404)

    # Safely call Gemini and fall back if it fails, times out, or lacks an API key
    extracted = None
    try:
        extracted = await gemini.extract_product_facts(
            image=image_bytes, image_mime=image.mime or "image/jpeg",
            transcript=body.transcript, audio=audio,
            audio_mime=audio_media.mime if audio_media else None,
        )
    except Exception as err:
        # Fall back gracefully so the artisan is never blocked
        print(f"[Pricing] Gemini extraction skipped/failed: {err}")

    # Safe merging (handles None for extracted or body.facts)
    facts = {**(extracted or {}), **(body.facts or {})}

    try:
        estimate = PricingEngine.load().predict(facts=facts, state=body.state)
    except Exception as err:
        raise AppError("PRICING_ERROR", f"Failed to calculate pricing estimate: {str(err)}", 500)

    return PricingSuggestOut(
        low=estimate.low, recommended=estimate.recommended, high=estimate.high,
        dignity_floor=estimate.dignity_floor,
        floor_breached=estimate.floor_breached,
        confidence=estimate.confidence, extracted_facts=facts,
        reasons=estimate.reasons, missing_facts=estimate.missing_facts,
        engine=("gemini-facts+fair-wage-mvp" if extracted
                 else "fair-wage-fallback-gemini-unavailable"),
    )