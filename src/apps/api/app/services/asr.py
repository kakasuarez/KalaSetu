"""
Speech to text, with a hard fallback chain:

    Groq whisper-large-v3-turbo (hosted)  ->  faster-whisper (ML service, local)

The PRD specified Bhashini as the primary. We cannot obtain credentials, so
Groq's Whisper takes that slot: free, no credit card, and Whisper covers the
same Indian languages (Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati,
Kannada, Malayalam, Punjabi, Urdu) plus the Hinglish code-mixing people
actually speak. The chain shape is kept deliberately so Bhashini can be
reinstated as a third provider without touching any caller.

Groq's free tier is 20 req/min and 28,800 audio-seconds/day, with a 25 MB file
cap. The local fallback exists for throttling as much as for outages, and is
what makes OFFLINE_DEMO_MODE work.
"""
from __future__ import annotations

import logging

import httpx

from app.config import settings

log = logging.getLogger(__name__)

# Whisper on Groq is tuned for ~30s segments; very short clips transcribe
# poorly. The wizard is tap-first for that reason, with voice as an accessory.
_GROQ_TIMEOUT = 45
_ML_TIMEOUT = 90

# Groq rejects files above 25 MB outright. Our own cap is lower: a 60s voice
# note at m4a bitrates is well under 1 MB, so anything this large is a bug.
MAX_AUDIO_BYTES = 10 * 1024 * 1024


class ASRUnavailable(RuntimeError):
    """No transcription provider could be reached."""


async def _groq_transcribe(audio: bytes, lang: str, filename: str) -> dict:
    if not settings.groq_api_key:
        raise ASRUnavailable("GROQ_API_KEY is not set")
    from groq import AsyncGroq

    client = AsyncGroq(api_key=settings.groq_api_key, timeout=_GROQ_TIMEOUT)
    kwargs: dict = {
        "file": (filename, audio),
        "model": settings.stt_model_groq,
        "response_format": "json",
    }
    # "auto" means let Whisper detect it. Forcing the wrong language on
    # code-mixed speech makes the transcript worse, not better.
    if lang and lang != "auto":
        kwargs["language"] = lang

    resp = await client.audio.transcriptions.create(**kwargs)
    text = (getattr(resp, "text", "") or "").strip()
    if not text:
        raise ASRUnavailable("Groq returned an empty transcript")
    return {"text": text, "engine": "groq-whisper", "language": lang}


async def _ml_transcribe(audio: bytes, lang: str, filename: str) -> dict:
    """faster-whisper, running in the ML service where the model already lives."""
    headers = (
        {"X-ML-Token": settings.ml_service_token}
        if settings.ml_service_token
        else {}
    )
    url = f"{settings.ml_service_url.rstrip('/')}/transcribe"
    async with httpx.AsyncClient(timeout=_ML_TIMEOUT) as client:
        resp = await client.post(
            url,
            files={"file": (filename, audio, "application/octet-stream")},
            data={"lang": lang},
            headers=headers,
        )
        if resp.status_code != 200:
            raise ASRUnavailable(f"ML service returned {resp.status_code}: {resp.text[:200]}")
        body = resp.json()

    text = (body.get("text") or "").strip()
    if not text:
        raise ASRUnavailable("ML service returned an empty transcript")
    return {
        "text": text,
        "engine": "faster-whisper",
        "language": body.get("language") or lang,
    }


async def transcribe(audio: bytes, lang: str = "hi", filename: str = "note.m4a") -> dict:
    """Returns {text, engine, language}. Raises ASRUnavailable if all fail.

    `engine` is surfaced to the app so a demo can show which path served the
    request -- useful when deliberately killing the network on stage.
    """
    if not audio:
        raise ASRUnavailable("Empty audio")

    # The demo-day switch must block outbound calls, not merely deprioritise them.
    if settings.offline_demo_mode:
        return await _ml_transcribe(audio, lang, filename)

    errors: list[str] = []
    for name, fn in (("groq", _groq_transcribe), ("ml", _ml_transcribe)):
        try:
            return await fn(audio, lang, filename)
        except Exception as exc:  # noqa: BLE001 -- normalise provider errors
            errors.append(f"{name}: {type(exc).__name__}: {exc}")
            log.warning("ASR provider %s failed: %s", name, exc)

    raise ASRUnavailable("; ".join(errors))
