"""
Artisan profile, and the story card rendered from it.

The card is the reason most of these columns exist. Buyers of handmade goods
are buying the maker as much as the object, and PRD.md:4685 makes that a
deliverable: her photo, name, village, craft, years, and two lines in her own
voice, on every listing.
"""
from __future__ import annotations

import hashlib
import logging
import uuid

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.db import get_db
from app.deps import current_artisan
from app.errors import AppError
from app.models.artisan import Artisan
from app.models.media import Media
from app.schemas.artisan import ArtisanOut, ArtisanUpdate
from app.services import asr, storage as storage_service
from app.services.llm import LLMUnavailable, complete_json
from app.services.story_card import render_story_card

log = logging.getLogger("kalasetu")

router = APIRouter(prefix="/artisans", tags=["artisans"])


# --------------------------------------------------------------- story card


def _signature(artisan: Artisan) -> str:
    """Fingerprint of everything the card draws.

    A cached card is reused only while this matches, so editing her village
    regenerates the image and editing her monthly capacity does not.
    """
    parts = [
        artisan.name or "",
        artisan.village or "",
        artisan.district or "",
        artisan.state or "",
        artisan.primary_craft or "",
        str(artisan.years_experience or ""),
        artisan.story_en or artisan.story_native or "",
        artisan.photo_key or "",
    ]
    return hashlib.sha256("\x1f".join(parts).encode()).hexdigest()[:16]


async def _cached_card(artisan: Artisan, db: AsyncSession) -> Media | None:
    return await db.scalar(
        select(Media)
        .where(Media.artisan_id == artisan.id, Media.kind == "card")
        .order_by(Media.created_at.desc())
        .limit(1)
    )


async def _story_card_url(artisan: Artisan, db: AsyncSession) -> str | None:
    """Return the card's URL, rendering it only when the profile has changed.

    Failures are logged and swallowed: a profile screen that 500s because a
    font is missing would be a worse outcome than one without a card image.
    """
    backend = storage_service.get_storage()
    signature = _signature(artisan)

    cached = await _cached_card(artisan, db)
    if (
        cached
        and (cached.meta or {}).get("signature") == signature
        and cached.storage_backend == backend.name
    ):
        return backend.url(cached.storage_key, cached.kind)

    photo: bytes | None = None
    if artisan.photo_key:
        try:
            photo = backend.get(artisan.photo_key)
        except Exception as exc:  # noqa: BLE001 -- a missing object is not fatal
            log.warning("story card: photo %s unreadable (%s)", artisan.photo_key, exc)

    try:
        image = render_story_card(
            name=artisan.name,
            village=artisan.village,
            district=artisan.district,
            state=artisan.state,
            craft=artisan.primary_craft,
            years=artisan.years_experience,
            story=artisan.story_en or artisan.story_native,
            photo=photo,
        )
        key = backend.put(
            image,
            prefix=f"card/{artisan.id}",
            ext="jpg",
            kind="card",
            content_type="image/jpeg",
        )
    except Exception as exc:  # noqa: BLE001 -- never block the profile on the card
        log.warning("story card render failed: %s: %s", type(exc).__name__, exc)
        return None

    db.add(
        Media(
            artisan_id=artisan.id,
            kind="card",
            storage_key=key,
            storage_backend=backend.name,
            mime="image/jpeg",
            width=1080,
            height=1350,
            meta={"signature": signature, "type": "story_card"},
        )
    )
    await db.flush()
    return backend.url(key, "card")


async def _to_out(artisan: Artisan, db: AsyncSession) -> ArtisanOut:
    """ArtisanOut with the two URL fields the row itself cannot supply."""
    out = ArtisanOut.model_validate(artisan)

    if artisan.photo_key:
        backend = storage_service.get_storage()
        # photo_key is a bare key; only the backend that wrote it can resolve
        # it, and there is no backend column on artisans to check against.
        try:
            out.photo_url = backend.url(artisan.photo_key, "image_raw")
        except Exception as exc:  # noqa: BLE001
            log.warning("photo url failed for artisan %s: %s", artisan.id, exc)

    out.story_card_url = await _story_card_url(artisan, db)
    return out


# ------------------------------------------------------------------ profile


@router.get("/me", response_model=ArtisanOut)
async def get_me(
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    # current_artisan already resolves Sakhi mode via X-Artisan-Id, so "me"
    # means "the artisan this request is acting for".
    return await _to_out(artisan, db)


@router.patch("/me", response_model=ArtisanOut)
async def update_me(
    body: ArtisanUpdate,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    fields = body.model_dump(exclude_unset=True)

    # The photo arrives as a media id she already uploaded, never as a storage
    # key: a key from the client would let anyone point their profile at any
    # object in the bucket.
    photo_media_id = fields.pop("photo_media_id", None)
    if photo_media_id is not None:
        media = await db.scalar(
            select(Media).where(
                Media.id == photo_media_id, Media.artisan_id == artisan.id
            )
        )
        if media is None:
            raise AppError("NOT_FOUND", "That photo does not exist", 404)
        if not (media.mime or "").startswith("image/"):
            raise AppError("VALIDATION_ERROR", "That file is not an image", 400)
        artisan.photo_key = media.storage_key

    for field, value in fields.items():
        setattr(artisan, field, value)

    db.add(artisan)
    await db.flush()
    await db.refresh(artisan)
    return await _to_out(artisan, db)


# -------------------------------------------------------------------- story


_STORY_SYSTEM = """You compress an artisan's spoken introduction into two short lines for her profile card.

Rules:
1. Use ONLY what she said. Never add a craft, a place, a number of years, an
   award or a family detail that is not in the transcript.
2. Two sentences at most, 30 words total at most. Simple words.
3. First person, her voice. Not "she says" or "this artisan".
4. If the transcript is too vague to say anything concrete, return empty
   strings rather than padding it out.

Return JSON: {"story_native": "...", "story_en": "..."}
story_native is in the language she spoke. story_en is the English translation.
"""


class _Story(BaseModel):
    story_native: str = ""
    story_en: str = ""


class StoryOut(BaseModel):
    transcript: str
    story_native: str | None
    story_en: str | None
    story_card_url: str | None


@router.post("/me/story", response_model=StoryOut)
async def set_story(
    file: UploadFile = File(...),
    lang: str = Form("hi"),
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    """Voice note in, two lines of profile story out.

    The summariser is held to the same rule as the cataloger: it may only
    compress what she said. An invented "third-generation weaver" on a story
    card is a claim a buyer can act on, so it has to be hers.
    """
    audio = await file.read()
    if not audio:
        raise AppError("EMPTY_FILE", "The recording is empty", 400)
    if len(audio) > asr.MAX_AUDIO_BYTES:
        raise AppError(
            "FILE_TOO_LARGE",
            f"That recording is {len(audio) / 1_048_576:.1f} MB. "
            f"The limit is {asr.MAX_AUDIO_BYTES // 1_048_576} MB.",
            413,
        )

    heard = await asr.transcribe(audio, lang=lang, filename=file.filename or "story.m4a")
    transcript = (heard.get("text") or "").strip()
    if not transcript:
        raise AppError("ASR_EMPTY", "Nothing was heard in that recording", 422)

    try:
        story = await complete_json(_STORY_SYSTEM, transcript, _Story)
    except LLMUnavailable as exc:
        # Keep her words rather than losing them: the raw transcript is a
        # worse story than a polished one, but it is entirely hers.
        log.warning("story summariser unavailable (%s); keeping the transcript", exc)
        story = _Story(story_native=transcript, story_en="")

    artisan.story_native = story.story_native or transcript
    artisan.story_en = story.story_en or None
    db.add(artisan)
    await db.flush()
    await db.refresh(artisan)

    return StoryOut(
        transcript=transcript,
        story_native=artisan.story_native,
        story_en=artisan.story_en,
        story_card_url=await _story_card_url(artisan, db),
    )
