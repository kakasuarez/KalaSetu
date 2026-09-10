"""
Lazy singletons. Never load a model at import time -- the container answers
/health immediately and pays for the model only on the first real request.

This matters concretely here: apps/ml/pipeline.py builds its rembg session at
module scope, and the result is that the service takes ~3 minutes at 100% CPU
after start before it will answer anything at all. On Hugging Face Spaces that
reads as a failed boot. New models go through this module instead.
"""
from __future__ import annotations

import logging
from functools import lru_cache

log = logging.getLogger(__name__)

# "small" int8 is the PRD's budgeted size (~0.5 GB) and transcribes a 60s note
# on CPU in a few seconds. Larger models blow the ML service's RAM budget once
# CLIP and the reranker land in later phases.
WHISPER_MODEL = "small"


@lru_cache(maxsize=1)
def get_whisper():
    from faster_whisper import WhisperModel

    log.info("loading faster-whisper %s (first request only)", WHISPER_MODEL)
    return WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
