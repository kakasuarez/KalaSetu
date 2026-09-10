"""
English -> artisan's-language translation for one chat message.

A single-provider, best-effort version of apps/api/app/services/llm.py's
Gemini+Groq failover -- Groq only, because a chat message's translation
missing is a degraded send, not a blocked one. Per the project's "fail soft,
never blank" principle (README), any failure here returns the ORIGINAL text
untranslated rather than raising, so a coordinator's message always goes
through even when the translator is down.
"""
from __future__ import annotations

import asyncio
import logging

from app.config import settings

log = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 20

_SYSTEM = (
    "You translate short messages from a coordinator to an artisan she "
    "supports. Translate the user's message into {language}. Reply with "
    "ONLY the translation -- no quotes, no explanation, no original text."
)


async def translate(text: str, language: str) -> tuple[str | None, bool]:
    """
    Returns (translated_text_or_None, was_translated).

    was_translated is False whenever the second element should be ignored --
    either translation was skipped (no key) or it failed. The caller (see
    routers/sakhi.py) stores None rather than a guess, so the UI can show
    "not translated" instead of silently presenting English as if it were
    Bengali.
    """
    if not settings.groq_api_key:
        return None, False
    if not text.strip():
        return None, False

    try:
        from groq import AsyncGroq

        client = AsyncGroq(api_key=settings.groq_api_key)
        resp = await asyncio.wait_for(
            client.chat.completions.create(
                model=settings.llm_model_groq,
                messages=[
                    {"role": "system", "content": _SYSTEM.format(language=language)},
                    {"role": "user", "content": text},
                ],
                temperature=0.2,
            ),
            timeout=_TIMEOUT_SECONDS,
        )
        translated = (resp.choices[0].message.content or "").strip()
        if not translated:
            return None, False
        return translated, True
    except Exception as exc:  # noqa: BLE001 -- any provider failure is soft
        log.warning("translate: Groq failed, sending original text: %s", exc)
        return None, False
