"""
Object storage, behind one interface.

Backends:
  local       -- writes under settings.local_storage_dir, served by
                 GET /media/local/{key}. The dev default, so nothing is
                 blocked on cloud credentials.
  cloudinary  -- the production backend for this project.
  r2          -- S3-compatible, kept because the PRD specifies it and swapping
                 back is a one-line env change.

Cloudinary quirks worth knowing before you debug them at 2am:

  * Audio files (MP3, WAV, M4A) upload with resource_type="video", NOT "raw".
    Cloudinary treats audio as a degenerate video so it can transcode it.
  * Free-plan hard caps: 10 MB image, 10 MB raw, 100 MB video. We check sizes
    ourselves so an oversize upload returns our error envelope rather than a
    provider traceback.
  * public_id excludes the file extension. The delivery URL adds it back from
    the stored format, so we keep the extension out of the key.
"""
from __future__ import annotations

import mimetypes
import shutil
import uuid
from pathlib import Path
from typing import Protocol

from app.config import settings
from app.errors import AppError

# Our media_kind -> Cloudinary resource_type, and the cap that applies.
_RESOURCE_TYPES = {
    "image_raw": "image",
    "image_enhanced": "image",
    "mockup": "image",
    "card": "image",
    "audio": "video",  # not a typo -- see module docstring
    "video": "video",
    "glb": "raw",
}


def resource_type_for(kind: str) -> str:
    return _RESOURCE_TYPES.get(kind, "raw")


def max_bytes_for(kind: str) -> int:
    rt = resource_type_for(kind)
    if rt == "image":
        return settings.max_image_bytes
    if rt == "video":
        return settings.max_video_bytes
    return settings.max_raw_bytes


def check_size(data: bytes, kind: str) -> None:
    limit = max_bytes_for(kind)
    if len(data) > limit:
        raise AppError(
            "FILE_TOO_LARGE",
            f"This file is {len(data) / 1_048_576:.1f} MB. "
            f"The limit for {kind} is {limit // 1_048_576} MB.",
            413,
            {"size_bytes": len(data), "limit_bytes": limit, "kind": kind},
        )


class StorageBackend(Protocol):
    name: str

    def put(self, data: bytes, prefix: str, ext: str, kind: str,
            content_type: str | None = None) -> str: ...
    def get(self, key: str) -> bytes: ...
    def url(self, key: str, kind: str = "image_raw") -> str: ...
    def delete(self, key: str, kind: str = "image_raw") -> None: ...


class LocalStorage:
    """Filesystem backend for development. Keys are relative POSIX paths."""

    name = "local"

    def __init__(self, root: str | Path | None = None) -> None:
        self.root = Path(root or settings.local_storage_dir).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # Resolve and confirm containment: a key like "../../.env" must not escape.
        target = (self.root / key).resolve()
        if not target.is_relative_to(self.root):
            raise AppError("BAD_REQUEST", "Invalid storage key", 400)
        return target

    def put(self, data: bytes, prefix: str, ext: str, kind: str,
            content_type: str | None = None) -> str:
        key = f"{prefix}/{uuid.uuid4().hex}.{ext.lstrip('.')}"
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return key

    def get(self, key: str) -> bytes:
        path = self._path(key)
        if not path.is_file():
            raise AppError("NOT_FOUND", "Stored file not found", 404)
        return path.read_bytes()

    def url(self, key: str, kind: str = "image_raw") -> str:
        base = settings.local_storage_public_base.rstrip("/")
        return f"{base}/media/local/{key}" if base else f"/media/local/{key}"

    def delete(self, key: str, kind: str = "image_raw") -> None:
        path = self._path(key)
        if path.is_file():
            path.unlink()


class CloudinaryStorage:
    """Cloudinary backend. Keys are public_ids (no file extension)."""

    name = "cloudinary"

    def __init__(self) -> None:
        import cloudinary

        if not settings.cloudinary_cloud_name:
            raise AppError(
                "CONFIG_ERROR",
                "STORAGE_BACKEND=cloudinary but CLOUDINARY_CLOUD_NAME is unset",
                503,
            )
        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
            secure=True,
        )
        self._cloudinary = cloudinary

    def put(self, data: bytes, prefix: str, ext: str, kind: str,
            content_type: str | None = None) -> str:
        import cloudinary.uploader

        public_id = f"{prefix}/{uuid.uuid4().hex}"
        try:
            result = cloudinary.uploader.upload(
                data,
                public_id=public_id,
                resource_type=resource_type_for(kind),
                overwrite=False,
            )
        except Exception as exc:  # noqa: BLE001 - normalise provider errors
            raise AppError("STORAGE_ERROR", f"Upload failed: {exc}", 502) from exc
        # Cloudinary may namespace the id; trust what it returns, not what we sent.
        return result.get("public_id", public_id)

    def get(self, key: str) -> bytes:
        import httpx

        resp = httpx.get(self.url(key), timeout=30, follow_redirects=True)
        if resp.status_code != 200:
            raise AppError("NOT_FOUND", "Stored file not found", 404)
        return resp.content

    def url(self, key: str, kind: str = "image_raw") -> str:
        from cloudinary.utils import cloudinary_url

        url, _ = cloudinary_url(key, resource_type=resource_type_for(kind), secure=True)
        return url

    def delete(self, key: str, kind: str = "image_raw") -> None:
        import cloudinary.uploader

        cloudinary.uploader.destroy(key, resource_type=resource_type_for(kind))


class R2Storage:
    """S3-compatible backend (Cloudflare R2). Keys include the extension."""

    name = "r2"

    def __init__(self) -> None:
        import boto3
        from botocore.client import Config

        self._s3 = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )

    def put(self, data: bytes, prefix: str, ext: str, kind: str,
            content_type: str | None = None) -> str:
        key = f"{prefix}/{uuid.uuid4().hex}.{ext.lstrip('.')}"
        self._s3.put_object(
            Bucket=settings.r2_bucket,
            Key=key,
            Body=data,
            ContentType=content_type
            or mimetypes.guess_type(key)[0]
            or "application/octet-stream",
        )
        return key

    def get(self, key: str) -> bytes:
        return self._s3.get_object(Bucket=settings.r2_bucket, Key=key)["Body"].read()

    def url(self, key: str, kind: str = "image_raw") -> str:
        if settings.r2_public_base:
            return f"{settings.r2_public_base.rstrip('/')}/{key}"
        return self._s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.r2_bucket, "Key": key},
            ExpiresIn=3600,
        )

    def delete(self, key: str, kind: str = "image_raw") -> None:
        self._s3.delete_object(Bucket=settings.r2_bucket, Key=key)


_BACKENDS = {
    "local": LocalStorage,
    "cloudinary": CloudinaryStorage,
    "r2": R2Storage,
}

_instance: StorageBackend | None = None


def get_storage() -> StorageBackend:
    """Lazy singleton so an unconfigured backend fails on use, not on import."""
    global _instance
    if _instance is None:
        cls = _BACKENDS.get(settings.storage_backend)
        if cls is None:
            raise AppError(
                "CONFIG_ERROR",
                f"Unknown STORAGE_BACKEND '{settings.storage_backend}'. "
                f"Expected one of: {', '.join(_BACKENDS)}",
                503,
            )
        _instance = cls()
    return _instance


def reset_storage() -> None:
    """Drop the cached backend. Used by tests that switch backends."""
    global _instance
    _instance = None


def clear_local_storage() -> None:
    """Wipe the local media tree. Dev/test only."""
    root = Path(settings.local_storage_dir)
    if root.exists():
        shutil.rmtree(root)
