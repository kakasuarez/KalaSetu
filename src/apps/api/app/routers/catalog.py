"""
The multilingual auto-cataloger.

Four endpoints backing the five-step wizard:

    GET  /catalog/crafts        the taxonomy + per-craft question set
    POST /catalog/transcribe    voice note -> text (any Indian language)
    POST /catalog/extract-facts transcript -> confirmed facts + what is missing
    POST /catalog/generate      facts -> EN/HI listing copy, then audited

The ordering rule that makes the whole feature defensible lives in
extract_facts below: questionnaire answers are stated by the artisan, spoken
facts are inferred by a model, and when they disagree the stated answer wins.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import ValidationError

from app.data import crafts as crafts_data
from app.deps import current_artisan
from app.errors import AppError
from app.models.artisan import Artisan
from app.schemas.catalog import (
    CraftOut,
    ExtractFactsRequest,
    ExtractFactsResponse,
    FactSource,
    GenerateRequest,
    GenerateResponse,
    ProductFacts,
    TranscribeResponse,
)
from app.services import asr, grounding

log = logging.getLogger("kalasetu")

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/crafts", response_model=list[CraftOut])
async def list_crafts():
    """The craft taxonomy and its questions.

    Unauthenticated on purpose: it is static reference data with nothing
    tenant-specific in it, and the app needs it to render before a listing
    exists. Serving it from here rather than bundling it in the app keeps the
    required-field rules in one place.
    """
    return crafts_data.catalogue()


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    file: UploadFile = File(...),
    lang: str = Form("hi"),
    artisan: Artisan = Depends(current_artisan),
):
    """Voice note in, text out. `lang` may be 'auto' to let Whisper detect it."""
    audio = await file.read()
    if not audio:
        raise AppError("EMPTY_FILE", "The recording is empty", 400)

    if len(audio) > asr.MAX_AUDIO_BYTES:
        raise AppError(
            "FILE_TOO_LARGE",
            f"That recording is {len(audio) / 1_048_576:.1f} MB. "
            f"The limit is {asr.MAX_AUDIO_BYTES // 1_048_576} MB.",
            413,
            {"size_bytes": len(audio), "limit_bytes": asr.MAX_AUDIO_BYTES},
        )

    try:
        result = await asr.transcribe(
            audio, lang=lang, filename=file.filename or "note.m4a"
        )
    except asr.ASRUnavailable as exc:
        # 502, not 500: the failure is upstream, and the app should offer a
        # retry rather than telling the artisan she did something wrong.
        raise AppError(
            "ASR_UNAVAILABLE",
            "We could not hear that clearly. Please try recording again.",
            502,
            {"detail": str(exc)},
        ) from exc

    return TranscribeResponse(**result)


def _parse_answers(raw: dict) -> tuple[ProductFacts, list[str]]:
    """Parse questionnaire answers, discarding only the ones that do not fit.

    A spoken answer to a numeric question arrives as whatever Whisper heard --
    "karib do ghante" in the work_hours box. Rejecting the whole payload for
    that used to 400 the request and strand the artisan on the questions step
    with no way forward, which is a far worse outcome than one blank field.

    A discarded answer becomes unspecified, never a guess: the field then shows
    up in `missing` and its source stays "unspecified", so the artisan is asked
    again rather than having a number invented for her.
    """
    try:
        return ProductFacts(**raw), []
    except ValidationError as exc:
        bad = {str(e["loc"][0]) for e in exc.errors() if e.get("loc")}

    kept = {k: v for k, v in raw.items() if k not in bad}
    log.warning("discarding unparseable answers %s", sorted(bad))
    try:
        return ProductFacts(**kept), sorted(bad)
    except ValidationError as exc:
        # Nothing salvageable -- an unknown key or a shape no field accepts.
        raise AppError(
            "VALIDATION_ERROR", "Some answers were not in the expected form", 400,
            {"detail": str(exc)},
        ) from exc


@router.post("/extract-facts", response_model=ExtractFactsResponse)
async def extract_facts(
    body: ExtractFactsRequest,
    artisan: Artisan = Depends(current_artisan),
):
    """Transcript -> facts, merged over what the questionnaire already knows."""
    answered, dropped = _parse_answers(body.existing_facts)

    answered_keys = set(answered.confirmed())

    spoken = await grounding.extract_facts(
        body.transcript, body.lang, body.craft_id, body.existing_facts
    )
    # Stated beats inferred. See ProductFacts.merge.
    facts = answered.merge(spoken)

    missing = facts.missing_required(body.craft_id)

    sources: dict[str, FactSource] = {}
    for field in ProductFacts.model_fields:
        if field in answered_keys:
            sources[field] = "answered"
        elif field in facts.confirmed():
            sources[field] = "spoken"
        else:
            sources[field] = "unspecified"

    return ExtractFactsResponse(
        facts=facts,
        missing=missing,
        follow_ups=grounding.build_follow_ups(missing),
        sources=sources,
        discarded=dropped,
    )


@router.post("/generate", response_model=GenerateResponse)
async def generate(
    body: GenerateRequest,
    artisan: Artisan = Depends(current_artisan),
):
    """Facts -> listing copy, then audited against those same facts.

    Violations are returned rather than hidden. The app shows the result as a
    "nothing invented" badge, and a badge that only ever says yes is worthless.
    """
    if not body.artisan_name:
        body.artisan_name = artisan.name
    if not body.village:
        body.village = artisan.village

    listing = await grounding.generate_listing(body)
    violations, checked = await grounding.verify_listing(body.facts, listing)

    if violations:
        # One automatic repair attempt. If the second pass is cleaner we ship
        # it; if not, the violations travel to the UI so a human can decide.
        retry = await grounding.generate_listing(body)
        retry_violations, retry_checked = await grounding.verify_listing(body.facts, retry)
        if len(retry_violations) < len(violations):
            listing, violations, checked = retry, retry_violations, retry_checked

    return GenerateResponse(
        listing=listing,
        violations=violations,
        verified=checked and not violations,
        verification_ran=checked,
    )
