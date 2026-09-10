from __future__ import annotations

import uuid

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import current_artisan
from app.errors import AppError
from app.models.artisan import Artisan
from app.models.listing import Listing
from app.models.media import Media
from app.schemas.preview3d import Preview3DStartIn, Preview3DStatusOut
from app.services import preview3d as preview3d_service
from app.services import storage as storage_service

router = APIRouter(prefix="/preview3d", tags=["preview3d"])


def _out(media: Media) -> Preview3DStatusOut:
    meta = media.meta or {}
    status = meta.get("status", "processing")
    return Preview3DStatusOut(
        job_id=str(media.id),
        status=status,
        media_id=str(media.id) if status == "succeeded" else None,
        glb_url=storage_service.get_storage().url(media.storage_key, "glb")
        if status == "succeeded" and media.storage_key
        else None,
        error=meta.get("error"),
    )


@router.post("/start", response_model=Preview3DStatusOut, status_code=202)
async def start(
    body: Preview3DStartIn,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    source = await db.scalar(
        select(Media).where(Media.id == body.media_id, Media.artisan_id == artisan.id)
    )
    if source is None:
        raise AppError("NOT_FOUND", "Media not found", 404)

    listing = None
    if body.listing_id:
        listing = await db.scalar(
            select(Listing).where(
                Listing.id == body.listing_id, Listing.artisan_id == artisan.id
            )
        )
        if listing is None:
            raise AppError("NOT_FOUND", "Listing not found", 404)

    backend = storage_service.get_storage()
    source_url = backend.url(source.storage_key, source.kind)

    try:
        job = await preview3d_service.create_prediction(source_url)
    except preview3d_service.Preview3DUnavailable as exc:
        raise AppError("PREVIEW3D_UNAVAILABLE", str(exc), 503)

    media = Media(
        artisan_id=artisan.id,
        kind="glb",
        parent_id=source.id,
        storage_key="",  # filled in once the reconstruction finishes
        storage_backend=backend.name,
        meta={
            "status": job.status,
            "provider_job_id": job.prediction_id,
            "source_media_id": str(source.id),
            "listing_id": str(listing.id) if listing else None,
        },
    )
    db.add(media)
    await db.flush()
    await db.refresh(media)

    return _out(media)


@router.get("/{job_id}", response_model=Preview3DStatusOut)
async def poll(
    job_id: uuid.UUID,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    media = await db.scalar(
        select(Media).where(Media.id == job_id, Media.artisan_id == artisan.id, Media.kind == "glb")
    )
    if media is None:
        raise AppError("NOT_FOUND", "No such preview job", 404)

    meta = dict(media.meta or {})
    # Already resolved on an earlier poll -- do not hit Replicate again for a
    # job that finished, and definitely not for one that already failed.
    if meta.get("status") in ("succeeded", "failed", "canceled"):
        return _out(media)

    try:
        job = await preview3d_service.get_prediction(meta["provider_job_id"])
    except preview3d_service.Preview3DUnavailable as exc:
        raise AppError("PREVIEW3D_UNAVAILABLE", str(exc), 503)

    meta["status"] = job.status

    if job.status == "succeeded":
        glb_url = job.glb_url
        if not glb_url:
            # The provider says done but the output didn't match any shape
            # Preview3DJob.glb_url knows how to read -- treat as a failure
            # with the raw payload preserved, not a silent None everywhere.
            meta["status"] = "failed"
            meta["error"] = f"Unrecognised output shape: {job.output!r}"
        else:
            backend = storage_service.get_storage()
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.get(glb_url)
                resp.raise_for_status()
                data = resp.content

            key = backend.put(
                data, prefix=f"glb/{artisan.id}", ext="glb", kind="glb",
                content_type="model/gltf-binary",
            )
            media.storage_key = key

            listing_id = meta.get("listing_id")
            if listing_id:
                listing = await db.get(Listing, uuid.UUID(listing_id))
                if listing is not None and listing.artisan_id == artisan.id:
                    listing.glb_media_id = media.id
                    db.add(listing)
    elif job.status == "failed":
        meta["error"] = job.error

    media.meta = meta
    db.add(media)
    await db.flush()
    await db.refresh(media)

    return _out(media)
