"""
Photo -> rotatable 3D preview, via Replicate's hosted image-to-3D API.

Deliberately NOT a local model. TripoSR/TRELLIS-class reconstruction needs a
GPU for anything faster than minutes-per-image, and this project has none to
give it. Replicate hosts the inference and bills per call (a few cents each
for this class of model) -- the same trade this project already makes for
Gemini/Groq rather than self-hosting an LLM.

Two-step async job, not a single call: Replicate's API queues a prediction
and returns immediately, then the caller polls. poll_until_done wraps that
so routers/preview3d.py can offer both a poll endpoint and (later) a webhook
without duplicating the state machine.

Exact input field names for the chosen model (settings.replicate_model_3d)
are NOT independently verified here -- Replicate's model-specific schema
requires an authenticated call to inspect, which this codebase cannot make
without a real token. The first real call against a live token is the actual
verification; _INPUT_KEY is the one thing likely to need adjusting after
that, not the overall flow.
"""
from __future__ import annotations

import asyncio
import logging

import httpx

from app.config import settings

log = logging.getLogger(__name__)

_API_BASE = "https://api.replicate.com/v1"
_POLL_INTERVAL_SECONDS = 3
_POLL_TIMEOUT_SECONDS = 240  # TRELLIS-class reconstruction: ~30-90s typical

# The input field Replicate's TRELLIS wrapper expects for a single source
# photo. If the first real call 422s on this, the error response's `detail`
# names the correct field -- see the note in create_prediction below.
_INPUT_KEY = "image"


class Preview3DUnavailable(RuntimeError):
    """No token configured, or the provider failed/timed out."""


class Preview3DJob:
    def __init__(self, prediction_id: str, status: str, output: object = None, error: str | None = None):
        self.prediction_id = prediction_id
        self.status = status  # starting | processing | succeeded | failed | canceled
        self.output = output
        self.error = error

    @property
    def done(self) -> bool:
        return self.status in ("succeeded", "failed", "canceled")

    @property
    def glb_url(self) -> str | None:
        """
        Replicate's output shape varies by model wrapper: a bare URL string,
        a dict with a 'model_file' or 'glb' key, or a list of URLs. This
        covers the shapes seen across image-to-3D wrappers on the platform
        rather than assuming one -- get this wrong and a successful job
        looks like a failure two layers up.
        """
        out = self.output
        if isinstance(out, str):
            return out
        if isinstance(out, dict):
            for key in ("model_file", "glb", "mesh", "output"):
                val = out.get(key)
                if isinstance(val, str):
                    return val
        if isinstance(out, list) and out and isinstance(out[0], str):
            return out[0]
        return None


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.replicate_api_token}",
        "Content-Type": "application/json",
    }


async def create_prediction(image_url: str) -> Preview3DJob:
    """
    Starts a reconstruction job. image_url must be a publicly-fetchable URL
    (Replicate's workers download it) -- the media backend's own url(), not a
    local-only path, so this fails immediately and legibly against the
    `local` storage backend on a machine Replicate cannot reach.
    """
    if not settings.replicate_api_token:
        raise Preview3DUnavailable("REPLICATE_API_TOKEN is not set")

    url = f"{_API_BASE}/models/{settings.replicate_model_3d}/predictions"
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.post(
                url, headers=_headers(), json={"input": {_INPUT_KEY: image_url}}
            )
        except httpx.HTTPError as exc:
            raise Preview3DUnavailable(f"Could not reach Replicate: {exc}") from exc

        if resp.status_code == 422:
            # The one error worth surfacing verbatim: it names the actual
            # expected input schema, which is the fix for a wrong _INPUT_KEY.
            raise Preview3DUnavailable(f"Replicate rejected the input: {resp.text}")
        if resp.status_code >= 400:
            raise Preview3DUnavailable(
                f"Replicate returned {resp.status_code}: {resp.text[:300]}"
            )

        data = resp.json()

    return Preview3DJob(prediction_id=data["id"], status=data.get("status", "starting"))


async def get_prediction(prediction_id: str) -> Preview3DJob:
    url = f"{_API_BASE}/predictions/{prediction_id}"
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.get(url, headers=_headers())
        except httpx.HTTPError as exc:
            raise Preview3DUnavailable(f"Could not reach Replicate: {exc}") from exc
        if resp.status_code >= 400:
            raise Preview3DUnavailable(
                f"Replicate returned {resp.status_code}: {resp.text[:300]}"
            )
        data = resp.json()

    return Preview3DJob(
        prediction_id=data["id"],
        status=data.get("status", "processing"),
        output=data.get("output"),
        error=data.get("error"),
    )


async def poll_until_done(prediction_id: str) -> Preview3DJob:
    """Blocks the caller until Replicate finishes. Used by the synchronous
    generate-and-wait route; the poll route calls get_prediction directly so
    the app's own request never has to hold a connection open for 90s."""
    elapsed = 0
    while elapsed < _POLL_TIMEOUT_SECONDS:
        job = await get_prediction(prediction_id)
        if job.done:
            return job
        await asyncio.sleep(_POLL_INTERVAL_SECONDS)
        elapsed += _POLL_INTERVAL_SECONDS
    raise Preview3DUnavailable(
        f"Reconstruction did not finish within {_POLL_TIMEOUT_SECONDS}s"
    )
