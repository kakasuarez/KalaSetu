"""
Provider-agnostic LLM with structured output and automatic failover.

Gemini 2.0 Flash first, Groq Llama 3.3 70B second -- exactly the pair
config.py already declares. Both have free tiers that need no credit card, so
neither is a billing risk during the hackathon.

Two things this module refuses to do:

  * Return prose. Callers ask for a Pydantic model and get one, or an
    LLMUnavailable is raised. A half-parsed dict reaching the grounding layer
    would silently become an invented product fact.
  * Reach the network when OFFLINE_DEMO_MODE is set. That flag is the demo-day
    switch (config.py:116) and it must be absolute -- callers are expected to
    have a deterministic fallback ready.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Type, TypeVar

from pydantic import BaseModel, ValidationError

from app.config import settings

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Generation is the slow call; extraction and verification are short. 45s is
# above the p99 for Flash at these prompt sizes and well under the phone's
# patience.
_TIMEOUT_SECONDS = 45


class LLMUnavailable(RuntimeError):
    """Every provider failed, or outbound calls are disabled."""


def _strip_fences(text: str) -> str:
    """Models wrap JSON in ``` despite being told not to. Tolerate it."""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t
        t = t.rsplit("```", 1)[0]
    return t.replace("```json", "").replace("```", "").strip()


def _first_json_object(text: str) -> str:
    """Salvage the outermost {...} when a model prepends a sentence anyway."""
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        return text[start : end + 1]
    return text


def _gemini_sync(system: str, user: str) -> str:
    import google.generativeai as genai

    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel(
        settings.llm_model_gemini,
        system_instruction=system,
        generation_config={"response_mime_type": "application/json"},
    )
    return model.generate_content(user).text


async def _gemini(system: str, user: str) -> str:
    if not settings.gemini_api_key:
        raise LLMUnavailable("GEMINI_API_KEY is not set")
    # The google-generativeai client is synchronous; keep it off the loop.
    return await asyncio.to_thread(_gemini_sync, system, user)


async def _groq(system: str, user: str) -> str:
    if not settings.groq_api_key:
        raise LLMUnavailable("GROQ_API_KEY is not set")
    from groq import AsyncGroq

    client = AsyncGroq(api_key=settings.groq_api_key)
    resp = await client.chat.completions.create(
        model=settings.llm_model_groq,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format={"type": "json_object"},
        temperature=0.4,
    )
    return resp.choices[0].message.content or ""


async def complete_json(system: str, user: str, model: Type[T]) -> T:
    """Ask for JSON matching `model`. Raises LLMUnavailable if nobody answers.

    Ordering follows settings.llm_primary so the fallback can be exercised in a
    demo by flipping one env var.
    """
    if settings.offline_demo_mode:
        raise LLMUnavailable("OFFLINE_DEMO_MODE is on; no outbound LLM calls")

    providers = (
        [("gemini", _gemini), ("groq", _groq)]
        if settings.llm_primary == "gemini"
        else [("groq", _groq), ("gemini", _gemini)]
    )

    errors: list[str] = []
    for name, fn in providers:
        try:
            raw = await asyncio.wait_for(fn(system, user), timeout=_TIMEOUT_SECONDS)
            payload = _first_json_object(_strip_fences(raw))
            return model.model_validate(json.loads(payload))
        except (json.JSONDecodeError, ValidationError) as exc:
            # A malformed response is a provider failure, not a caller error --
            # fall through and let the next one try.
            errors.append(f"{name}: bad JSON ({type(exc).__name__})")
            log.warning("LLM %s returned unusable JSON: %s", name, exc)
        except LLMUnavailable as exc:
            errors.append(f"{name}: {exc}")
        except Exception as exc:  # noqa: BLE001 -- normalise every provider error
            errors.append(f"{name}: {type(exc).__name__}: {exc}")
            log.warning("LLM %s failed: %s", name, exc)

    raise LLMUnavailable("; ".join(errors) or "no LLM provider configured")
