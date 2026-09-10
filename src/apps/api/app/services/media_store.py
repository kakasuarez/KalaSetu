"""
Local-disk storage for voice messages.

The "local" backend from apps/api/app/services/storage.py, trimmed to the one
thing this service needs -- write a file, hand back a URL the app can play.
No Cloudinary/R2 abstraction: that is real infrastructure to reuse at merge
time, not to rebuild here for one file type.
"""
from __future__ import annotations

import uuid
from pathlib import Path

from app.config import settings

_VOICE_SUBDIR = "voice"


def _voice_dir() -> Path:
    path = Path(settings.local_storage_dir) / _VOICE_SUBDIR
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_voice(data: bytes, content_type: str | None) -> str:
    """
    Writes the bytes to disk and returns a path RELATIVE to the API root,
    e.g. "media/voice/<uuid>.m4a".

    Relative, not absolute: app.main mounts settings.local_storage_dir at
    /media, and the mobile client's resolveMediaUrl() (in the shared
    @mobile/api/client) already knows how to turn a relative path into a full
    URL against whichever API base this app is pointed at -- reusing that is
    what avoids hardcoding a host here.
    """
    ext = ".m4a"
    if content_type and "wav" in content_type:
        ext = ".wav"
    elif content_type and "mpeg" in content_type:
        ext = ".mp3"

    filename = f"{uuid.uuid4().hex}{ext}"
    (_voice_dir() / filename).write_bytes(data)
    return f"media/{_VOICE_SUBDIR}/{filename}"
