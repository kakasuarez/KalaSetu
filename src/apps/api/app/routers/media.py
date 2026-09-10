"""
Media upload and retrieval.

Upload is synchronous and small: the app compresses before sending, and the
router rejects anything over the backend's cap with our error envelope rather
than letting a provider traceback reach the phone.
"""
from __future__ import annotations

import io
import mimetypes
import uuid

import httpx
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.deps import current_artisan
from app.errors import AppError
from app.models.artisan import Artisan
from app.models.listing import Listing
from app.models.media import MEDIA_KINDS, Media
from app.schemas.media import MediaUploadOut, MediaUrlOut
from app.services import storage as storage_service

router = APIRouter(prefix="/media", tags=["media"])

_EXT_BY_MIME = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/wav": "wav",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "model/gltf-binary": "glb",
}

mimetypes.add_type("model/gltf-binary", ".glb")


def _extension(filename: str | None, mime: str | None) -> str:
    if filename and "." in filename:
        return filename.rsplit(".", 1)[-1].lower()
    if mime and mime in _EXT_BY_MIME:
        return _EXT_BY_MIME[mime]
    if mime:
        guessed = mimetypes.guess_extension(mime)
        if guessed:
            return guessed.lstrip(".")
    return "bin"


def _image_dimensions(data: bytes) -> tuple[int | None, int | None]:
    """Best-effort. A photo that Pillow cannot parse is still a valid upload."""
    try:
        from PIL import Image

        with Image.open(io.BytesIO(data)) as img:
            return img.width, img.height
    except Exception:  # noqa: BLE001
        return None, None


@router.post("/upload", response_model=MediaUploadOut, status_code=201)
async def upload_media(
    file: UploadFile = File(...),
    kind: str = Form("image_raw"),
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    if kind not in MEDIA_KINDS:
        raise AppError(
            "BAD_REQUEST",
            f"Unknown media kind '{kind}'",
            400,
            {"allowed": list(MEDIA_KINDS)},
        )

    data = await file.read()
    if not data:
        raise AppError("EMPTY_FILE", "The uploaded file is empty", 400)

    storage_service.check_size(data, kind)

    backend = storage_service.get_storage()
    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0]
    key = backend.put(
        data,
        prefix=f"{kind}/{artisan.id}",
        ext=_extension(file.filename, mime),
        kind=kind,
        content_type=mime,
    )

    width = height = None
    if storage_service.resource_type_for(kind) == "image":
        width, height = _image_dimensions(data)

    media = Media(
        artisan_id=artisan.id,
        kind=kind,
        storage_key=key,
        storage_backend=backend.name,
        mime=mime,
        width=width,
        height=height,
        meta={"size_bytes": len(data), "original_filename": file.filename},
    )
    db.add(media)
    await db.flush()
    await db.refresh(media)

    return MediaUploadOut(
        id=media.id,
        kind=media.kind,
        url=backend.url(key, kind),
        mime=mime,
        width=width,
        height=height,
        size_bytes=len(data),
    )


@router.get("/{media_id}/url", response_model=MediaUrlOut)
async def get_media_url(
    media_id: uuid.UUID,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    media = await db.scalar(
        select(Media).where(Media.id == media_id, Media.artisan_id == artisan.id)
    )
    if not media:
        raise AppError("NOT_FOUND", "Media not found", 404)

    backend = storage_service.get_storage()
    if media.storage_backend != backend.name:
        raise AppError(
            "STORAGE_MISMATCH",
            f"This file was stored on '{media.storage_backend}' but the server "
            f"is configured for '{backend.name}'",
            409,
        )
    return MediaUrlOut(id=media.id, url=backend.url(media.storage_key, media.kind))


@router.post("/{media_id}/enhance", response_model=MediaUploadOut, status_code=201)
async def enhance_media(
    media_id: uuid.UUID,
    backdrop: str = Query(default="white"),
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    media = await db.scalar(
        select(Media).where(Media.id == media_id, Media.artisan_id == artisan.id)
    )
    if not media:
        raise AppError("NOT_FOUND", "Media not found", 404)

    if media.kind not in ("image_raw", "image_enhanced"):
        raise AppError("BAD_REQUEST", "Only image_raw or image_enhanced can be enhanced", 400)

    backend = storage_service.get_storage()
    try:
        data = backend.get(media.storage_key)
    except Exception:
        raise AppError("STORAGE_ERROR", "Could not read original media", 502)

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            headers = {"X-ML-Token": settings.ml_service_token} if settings.ml_service_token else {}
            files = {"file": ("image.jpg", data, media.mime or "image/jpeg")}
            res = await client.post(
                f"{settings.ml_service_url.rstrip('/')}/enhance",
                files=files,
                data={"backdrop": backdrop},
                headers=headers,
            )

            if res.status_code != 200:
                raise AppError("ML_ERROR", f"ML enhancement failed: {res.text}", 502)

            enhanced_bytes = res.content
    except httpx.RequestError as e:
        raise AppError("ML_ERROR", f"ML service unreachable: {e}", 502)

    new_kind = "image_enhanced"
    new_mime = "image/jpeg"
    new_ext = "jpg"

    new_key = backend.put(
        enhanced_bytes,
        prefix=f"{new_kind}/{artisan.id}",
        ext=new_ext,
        kind=new_kind,
        content_type=new_mime,
    )

    width, height = _image_dimensions(enhanced_bytes)

    enhanced_media = Media(
        artisan_id=artisan.id,
        kind=new_kind,
        storage_key=new_key,
        storage_backend=backend.name,
        mime=new_mime,
        width=width,
        height=height,
        parent_id=media.id,
        meta={"size_bytes": len(enhanced_bytes)},
    )
    db.add(enhanced_media)
    await db.flush()
    await db.refresh(enhanced_media)

    return MediaUploadOut(
        id=enhanced_media.id,
        kind=enhanced_media.kind,
        url=backend.url(new_key, new_kind),
        mime=new_mime,
        width=width,
        height=height,
        size_bytes=len(enhanced_bytes),
    )


@router.post("/{media_id}/generate3d", response_model=MediaUploadOut, status_code=201)
async def generate_3d_media(
    media_id: uuid.UUID,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    media = await db.scalar(
        select(Media).where(Media.id == media_id, Media.artisan_id == artisan.id)
    )
    if not media:
        raise AppError("NOT_FOUND", "Media not found", 404)

    backend = storage_service.get_storage()
    try:
        data = backend.get(media.storage_key)
    except Exception:
        raise AppError("STORAGE_ERROR", "Could not read source media", 502)

    try:
        async with httpx.AsyncClient(timeout=240.0) as client:
            headers = {"X-ML-Token": settings.ml_service_token} if settings.ml_service_token else {}
            files = {"file": ("image.jpg", data, media.mime or "image/jpeg")}
            res = await client.post(
                f"{settings.ml_service_url.rstrip('/')}/generate3d",
                files=files,
                headers=headers,
            )

            if res.status_code != 200:
                raise AppError("ML_ERROR", f"3D generation failed: {res.text}", 502)

            glb_bytes = res.content
    except httpx.RequestError as e:
        raise AppError("ML_ERROR", f"ML service unreachable: {e}", 502)

    new_kind = "glb"
    new_mime = "model/gltf-binary"
    new_ext = "glb"

    new_key = backend.put(
        glb_bytes,
        prefix=f"{new_kind}/{artisan.id}",
        ext=new_ext,
        kind=new_kind,
        content_type=new_mime,
    )

    glb_media = Media(
        artisan_id=artisan.id,
        kind=new_kind,
        storage_key=new_key,
        storage_backend=backend.name,
        mime=new_mime,
        parent_id=media.id,
        meta={"size_bytes": len(glb_bytes)},
    )
    db.add(glb_media)
    await db.flush()
    await db.refresh(glb_media)

    return MediaUploadOut(
        id=glb_media.id,
        kind=glb_media.kind,
        url=backend.url(new_key, new_kind),
        mime=new_mime,
        width=None,
        height=None,
        size_bytes=len(glb_bytes),
    )


@router.post(
    "/listing/{listing_id}/generate3d",
    response_model=MediaUploadOut,
    status_code=201,
)
async def generate_3d_from_listing(
    listing_id: uuid.UUID,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    """Generate a 3D model from ALL images attached to a listing.

    Gathers the primary image and every additional media image, sends them
    all to the ML service, stores the resulting GLB, and auto-attaches it
    to the listing's media_ids.
    """
    # 1. Fetch the listing (must belong to this artisan)
    listing = await db.scalar(
        select(Listing).where(
            Listing.id == listing_id, Listing.artisan_id == artisan.id
        )
    )
    if not listing:
        raise AppError("NOT_FOUND", "Listing not found", 404)

    # 2. Gather all media IDs (primary + additional)
    media_id_set: list[uuid.UUID] = []
    if listing.primary_media_id:
        media_id_set.append(listing.primary_media_id)
    for mid in listing.media_ids or []:
        if mid not in media_id_set:
            media_id_set.append(mid)

    if not media_id_set:
        raise AppError("BAD_REQUEST", "Listing has no media to generate 3D from", 400)

    # 3. Load all media rows
    media_rows = list(
        await db.scalars(
            select(Media).where(
                Media.id.in_(media_id_set),
                Media.artisan_id == artisan.id,
            )
        )
    )

    # Filter to image types only (skip existing GLBs, audio, video etc.)
    image_media = [
        m for m in media_rows
        if m.kind in ("image_raw", "image_enhanced")
    ]

    if not image_media:
        raise AppError(
            "BAD_REQUEST",
            "No image media found for this listing",
            400,
        )

    # 4. Read all image bytes from storage
    backend = storage_service.get_storage()
    image_files = []
    primary_media = None
    for m in image_media:
        try:
            data = backend.get(m.storage_key)
            if m.id == listing.primary_media_id:
                primary_media = m
                # Insert primary image first
                image_files.insert(0, (data, m.mime or "image/jpeg"))
            else:
                image_files.append((data, m.mime or "image/jpeg"))
        except Exception:
            continue  # Skip files that can't be read

    if not image_files:
        raise AppError("STORAGE_ERROR", "Could not read any media files", 502)

    # 5. Send all images to the ML service
    try:
        async with httpx.AsyncClient(timeout=240.0) as client:
            headers = (
                {"X-ML-Token": settings.ml_service_token}
                if settings.ml_service_token
                else {}
            )

            # Build multipart files list
            multipart_files = []
            if len(image_files) == 1:
                # Single image: use 'file' field for backward compatibility
                data, mime = image_files[0]
                multipart_files.append(("file", ("image.jpg", data, mime)))
            else:
                # Multiple images: use 'files' field
                for idx, (data, mime) in enumerate(image_files):
                    multipart_files.append(
                        ("files", (f"image_{idx}.jpg", data, mime))
                    )

            res = await client.post(
                f"{settings.ml_service_url.rstrip('/')}/generate3d",
                files=multipart_files,
                headers=headers,
            )

            if res.status_code != 200:
                raise AppError(
                    "ML_ERROR", f"3D generation failed: {res.text}", 502
                )

            glb_bytes = res.content
    except httpx.RequestError as e:
        raise AppError("ML_ERROR", f"ML service unreachable: {e}", 502)

    # 6. Store the GLB file
    new_kind = "glb"
    new_mime = "model/gltf-binary"
    new_ext = "glb"

    new_key = backend.put(
        glb_bytes,
        prefix=f"{new_kind}/{artisan.id}",
        ext=new_ext,
        kind=new_kind,
        content_type=new_mime,
    )

    # 7. Create the Media row
    parent = primary_media or image_media[0]
    glb_media = Media(
        artisan_id=artisan.id,
        kind=new_kind,
        storage_key=new_key,
        storage_backend=backend.name,
        mime=new_mime,
        parent_id=parent.id,
        meta={
            "size_bytes": len(glb_bytes),
            "source_images": len(image_files),
        },
    )
    db.add(glb_media)
    await db.flush()
    await db.refresh(glb_media)

    # 8. Auto-attach the GLB to the listing's media_ids
    existing_ids = list(listing.media_ids or [])
    if glb_media.id not in existing_ids:
        listing.media_ids = existing_ids + [glb_media.id]
        db.add(listing)
        await db.flush()

    return MediaUploadOut(
        id=glb_media.id,
        kind=glb_media.kind,
        url=backend.url(new_key, new_kind),
        mime=new_mime,
        width=None,
        height=None,
        size_bytes=len(glb_bytes),
    )


@router.delete("/listing/{listing_id}/3d")
@router.post("/listing/{listing_id}/remove3d")
async def delete_3d_from_listing(
    listing_id: uuid.UUID,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    """Remove 3D GLB model(s) attached to a listing and clean up storage."""
    listing = await db.scalar(
        select(Listing).where(
            Listing.id == listing_id, Listing.artisan_id == artisan.id
        )
    )
    if not listing:
        raise AppError("NOT_FOUND", "Listing not found", 404)

    media_ids = list(listing.media_ids or [])
    if not media_ids:
        return {"status": "ok", "removed": 0}

    glb_rows = list(
        await db.scalars(
            select(Media).where(
                Media.id.in_(media_ids),
                Media.artisan_id == artisan.id,
                Media.kind == "glb",
            )
        )
    )

    glb_ids = {m.id for m in glb_rows}
    new_media_ids = [mid for mid in media_ids if mid not in glb_ids]
    listing.media_ids = new_media_ids
    db.add(listing)

    backend = storage_service.get_storage()
    for m in glb_rows:
        try:
            backend.delete(m.storage_key, m.kind)
        except Exception:
            pass
        await db.delete(m)

    await db.flush()
    return {"status": "ok", "removed": len(glb_rows)}


@router.get("/local/{key:path}", include_in_schema=False)
async def serve_local(key: str):
    if settings.storage_backend != "local":
        raise AppError("NOT_FOUND", "Not found", 404)

    data = storage_service.LocalStorage().get(key)
    if key.lower().endswith(".glb"):
        mime = "model/gltf-binary"
    else:
        mime = mimetypes.guess_type(key)[0] or "application/octet-stream"
    return Response(
        content=data,
        media_type=mime,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
    )