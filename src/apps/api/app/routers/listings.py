"""
Listing CRUD.

Every read and write is scoped to the artisan resolved by current_artisan --
that dependency is the only thing standing between one artisan's catalogue and
another's, so nothing here queries by id alone.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import current_artisan
from app.errors import AppError
from app.models.artisan import Artisan
from app.models.listing import LISTING_STATUSES, Listing
from app.models.media import Media
from app.schemas.listing import ListingCreate, ListingDetail, ListingOut, ListingUpdate
from app.services import storage as storage_service

router = APIRouter(prefix="/listings", tags=["listings"])


async def _owned_listing(
    listing_id: uuid.UUID, artisan: Artisan, db: AsyncSession
) -> Listing:
    """Fetch a listing, or 404 if it is not this artisan's.

    404 rather than 403 on purpose: a 403 would confirm the id exists and let
    someone enumerate the catalogue.
    """
    listing = await db.scalar(
        select(Listing).where(
            Listing.id == listing_id, Listing.artisan_id == artisan.id
        )
    )
    if not listing:
        raise AppError("NOT_FOUND", "Listing not found", 404)
    return listing


async def _validate_media(
    db: AsyncSession, artisan: Artisan, media_ids: list[uuid.UUID]
) -> None:
    """Refuse to attach media belonging to another artisan."""
    if not media_ids:
        return
    unique = list(set(media_ids))
    rows = await db.scalars(
        select(Media.id).where(Media.id.in_(unique), Media.artisan_id == artisan.id)
    )
    found = set(rows.all())
    missing = [str(m) for m in unique if m not in found]
    if missing:
        raise AppError(
            "MEDIA_NOT_FOUND",
            "Some media do not exist or belong to another artisan",
            400,
            {"media_ids": missing},
        )


async def _primary_urls(
    listings: list[Listing], db: AsyncSession
) -> dict[uuid.UUID, str]:
    """Map listing id -> public URL of its primary image, in one query.

    Resolved for the whole page at once. Doing it per listing would turn a
    six-card shop grid into seven round trips, which on a village connection
    is the difference between a screen that loads and one she backs out of.
    """
    wanted = {l.primary_media_id for l in listings if l.primary_media_id}
    if not wanted:
        return {}

    rows = list(await db.scalars(select(Media).where(Media.id.in_(wanted))))
    backend = storage_service.get_storage()
    # A row stored on a different backend has no URL we can build -- the key
    # only means something to the backend that wrote it.
    by_id = {
        m.id: backend.url(m.storage_key, m.kind)
        for m in rows
        if m.storage_backend == backend.name
    }
    return {
        l.id: by_id[l.primary_media_id]
        for l in listings
        if l.primary_media_id in by_id
    }


async def _media_urls(listings: list[Listing], db: AsyncSession) -> dict[uuid.UUID, list[str]]:
    wanted = {
        media_id
        for listing in listings
        for media_id in (listing.media_ids or [])
    }
    if not wanted:
        return {}

    rows = list(await db.scalars(select(Media).where(Media.id.in_(wanted))))
    backend = storage_service.get_storage()
    by_id = {
        media.id: backend.url(media.storage_key, media.kind)
        for media in rows
        if media.storage_backend == backend.name
    }
    return {
        listing.id: [by_id[media_id] for media_id in (listing.media_ids or []) if media_id in by_id]
        for listing in listings
    }


@router.post("", response_model=ListingOut, status_code=201)
async def create_listing(
    body: ListingCreate,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    payload = body.model_dump(exclude_unset=True)

    attached = list(payload.get("media_ids") or [])
    if payload.get("primary_media_id"):
        attached.append(payload["primary_media_id"])
    await _validate_media(db, artisan, attached)

    listing = Listing(artisan_id=artisan.id, **payload)
    db.add(listing)
    await db.flush()
    # flush does not read back server-side defaults or the trigger's
    # updated_at, so without this the response serialises nulls.
    await db.refresh(listing)
    # Phase 9 will add: await index_listing(db, listing)
    return listing


@router.get("", response_model=list[ListingOut])
async def list_listings(
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    if status and status not in LISTING_STATUSES:
        raise AppError(
            "BAD_REQUEST",
            f"Unknown status '{status}'",
            400,
            {"allowed": list(LISTING_STATUSES)},
        )

    q = select(Listing).where(Listing.artisan_id == artisan.id)
    if status:
        q = q.where(Listing.status == status)
    q = q.order_by(Listing.created_at.desc()).limit(limit).offset(offset)

    listings = list(await db.scalars(q))
    urls = await _primary_urls(listings, db)
    all_urls = await _media_urls(listings, db)
    out = []
    for listing in listings:
        row = ListingOut.model_validate(listing)
        row.primary_media_url = urls.get(listing.id)
        row.media_urls = all_urls.get(listing.id, [])
        out.append(row)
    return out


@router.get("/{listing_id}", response_model=ListingDetail)
async def get_listing(
    listing_id: uuid.UUID,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    listing = await _owned_listing(listing_id, artisan, db)

    ids = list(listing.media_ids or [])
    if listing.primary_media_id and listing.primary_media_id not in ids:
        ids.append(listing.primary_media_id)

    media_rows = []
    if ids:
        media_rows = list(await db.scalars(select(Media).where(Media.id.in_(ids))))

    detail = ListingDetail.model_validate(listing)
    detail.media = media_rows
    detail.primary_media_url = (await _primary_urls([listing], db)).get(listing.id)
    detail.media_urls = (await _media_urls([listing], db)).get(listing.id, [])
    return detail


@router.patch("/{listing_id}", response_model=ListingOut)
async def update_listing(
    listing_id: uuid.UUID,
    body: ListingUpdate,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    listing = await _owned_listing(listing_id, artisan, db)
    payload = body.model_dump(exclude_unset=True)

    attached = list(payload.get("media_ids") or [])
    if payload.get("primary_media_id"):
        attached.append(payload["primary_media_id"])
    await _validate_media(db, artisan, attached)

    for field, value in payload.items():
        setattr(listing, field, value)
    db.add(listing)
    await db.flush()
    # trg_listings_tsv rewrites updated_at on every UPDATE; read it back.
    await db.refresh(listing)
    return listing
