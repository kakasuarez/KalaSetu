FROM python:3.11-slim

# ffmpeg     -> video frame extraction (Phase 6) and audio transcode (Phase 3)
# libgl1 etc -> OpenCV. Omitting these fails at RUNTIME with a
#               confusing "ImportError: libGL.so.1", not at build time.
# libgomp1   -> LightGBM's OpenMP runtime (Phase 4)
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg libgl1 libglib2.0-0 libsm6 libxext6 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /code

COPY requirements.txt .
# The cache mount keeps pip's wheel cache in a BuildKit volume instead of
# throwing it away with the layer. This install pulls ~250 MB; without the
# cache a single PyPI read timeout meant the retry re-downloaded all of it
# from scratch, which on a slow link never finished. Now a retry resumes.
#
# A short timeout with a large retry budget beats the reverse. pip's retry
# budget is shared across the whole run, so a 300 s timeout drained it on four
# stalled reads and then failed outright on numpy with a misleading
# "from versions: none" -- that is an unreachable index, not a bad pin.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --prefer-binary --retries 30 --timeout 60 -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
