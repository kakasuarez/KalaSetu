"""Small, optional Gemini adapter used by the pricing assistant."""
from __future__ import annotations

import asyncio
import json
import logging

from app.config import settings

log = logging.getLogger(__name__)


def _decode_json(text: str) -> dict:
    text = text.strip().removeprefix("```json").removesuffix("```").strip()
    value = json.loads(text)
    if not isinstance(value, dict):
        raise ValueError("Gemini returned a non-object response")
    return value


def _generate(prompt: str, image: bytes, image_mime: str, audio: bytes | None,
              audio_mime: str | None) -> dict:
    import google.generativeai as genai

    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel(settings.llm_model_gemini)
    parts: list[object] = [prompt, {"mime_type": image_mime, "data": image}]
    if audio and audio_mime:
        parts.append({"mime_type": audio_mime, "data": audio})
    response = model.generate_content(parts)
    return _decode_json(response.text)


async def extract_product_facts(*, image: bytes, image_mime: str,
                                transcript: str | None = None,
                                audio: bytes | None = None,
                                audio_mime: str | None = None) -> dict:
    """Extract only user-observable facts; return an empty result on failure."""
    if settings.offline_demo_mode or not settings.gemini_api_key:
        return {}

    prompt = (
        "You are extracting facts for a handicraft price estimate. Return JSON only "
        "with keys craft, material, work_hours, piece_count, dimensions, "
        "condition, and confidence. Use null when a fact is not present. Never "
        "invent facts. The spoken description is: " + (transcript or "not provided")
    )
    try:
        return await asyncio.to_thread(
            _generate, prompt, image, image_mime, audio, audio_mime
        )
    except Exception as exc:  # noqa: BLE001 - pricing has a deterministic fallback
        log.warning("Gemini pricing extraction failed: %s", exc)
        return {}
