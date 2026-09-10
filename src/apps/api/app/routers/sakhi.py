"""
Coordinator: manage the artisans she works with, see them on a map, and
message them.

Every read is scoped by `Artisan.managed_by == user.id` in the query itself,
never filtered after the fact. That is the same rule deps.current_artisan
enforces for the artisan-facing endpoints, and it is what stops one
coordinator's list -- or thread, or map -- from ever containing another's
artisan.
"""
from __future__ import annotations

import secrets
import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.cities import coords_for
from app.db import get_db
from app.deps import current_sakhi
from app.errors import AppError
from app.models.artisan import Artisan
from app.models.artisan_profile import ArtisanProfile
from app.models.message import Message
from app.models.user import User
from app.schemas.admin import ManagedArtisanIn, ManagedArtisanOut
from app.schemas.sakhi import MessageIn, MessageOut
from app.services import media_store, translate as translate_service

router = APIRouter(prefix="/sakhi", tags=["sakhi"])

# India's rough centre. Used only if a profile row is somehow missing --
# every artisan created through create_artisan below always gets one, so this
# is a defensive fallback, not the normal path.
_INDIA_CENTRE = (20.5937, 78.9629)

# A handful of varied dummy artisans for the "Load demo artisans" empty-state
# button -- enough to show the profile grid, the map spread across regions,
# and the directory populated without the coordinator typing anything.
_DEMO_ARTISANS = [
    {"name": "Sita Devi", "village": "Varanasi", "primary_craft": "Banarasi Weaving", "language": "Hindi", "lang_code": "hi"},
    {"name": "Lakshmi Reddy", "village": "Hyderabad", "primary_craft": "Bidriware", "language": "Telugu", "lang_code": "te"},
    {"name": "Meera Nair", "village": "Kochi", "primary_craft": "Coir Craft", "language": "Malayalam", "lang_code": "ml"},
    {"name": "Anjali Das", "village": "Kolkata", "primary_craft": "Kantha Embroidery", "language": "Bengali", "lang_code": "bn"},
    {"name": "Kamla Bai", "village": "Jodhpur", "primary_craft": "Block Printing", "language": "Marwari", "lang_code": "hi"},
    {"name": "Parvati Kaur", "village": "Amritsar", "primary_craft": "Phulkari Embroidery", "language": "Punjabi", "lang_code": "pa"},
]


async def _unique_demo_phone(db: AsyncSession) -> str:
    """
    A random, unused Indian mobile number for a seeded demo artisan.

    Generated rather than hardcoded because users.phone is UNIQUE and
    demo-seed runs per coordinator -- fixed numbers would collide the moment
    a second coordinator seeded her own set. Starts 6-9 so it satisfies the
    same validator real numbers go through (schemas/auth.py).
    """
    for _ in range(25):
        phone = "+91" + secrets.choice("6789") + "".join(
            secrets.choice("0123456789") for _ in range(9)
        )
        clash = await db.scalar(select(User.id).where(User.phone == phone))
        if clash is None:
            return phone
    raise AppError("CONFLICT", "Could not allocate a demo phone number", 409)


def _out(artisan: Artisan, profile: ArtisanProfile | None, phone: str | None) -> ManagedArtisanOut:
    lat, lon = (profile.lat, profile.lon) if profile else _INDIA_CENTRE
    return ManagedArtisanOut(
        id=str(artisan.id),
        name=artisan.name,
        village=artisan.village,
        primary_craft=artisan.primary_craft,
        phone=phone,
        language=profile.language if profile else "Hindi",
        lat=lat,
        lon=lon,
        created_at=artisan.created_at,
    )


async def _managed_artisan(
    db: AsyncSession, user: User, artisan_id: uuid.UUID
) -> tuple[Artisan, ArtisanProfile | None]:
    """
    The one place every artisan-scoped endpoint below resolves its target.

    404, not 403, on a mismatch -- same reasoning as deps.current_artisan:
    an id that isn't hers should not even confirm that it exists.
    """
    artisan = await db.scalar(
        select(Artisan).where(Artisan.id == artisan_id, Artisan.managed_by == user.id)
    )
    if artisan is None:
        raise AppError("NOT_FOUND", "No such artisan", 404)
    profile = await db.scalar(
        select(ArtisanProfile).where(ArtisanProfile.artisan_id == artisan_id)
    )
    return artisan, profile


@router.get("/artisans", response_model=list[ManagedArtisanOut])
async def list_artisans(
    user: User = Depends(current_sakhi),
    db: AsyncSession = Depends(get_db),
):
    # Outer joins: an artisan enrolled without a phone has no user row, and an
    # older row could in principle predate its profile -- an inner join would
    # silently drop exactly the people who need the coordinator most.
    rows = (
        await db.execute(
            select(Artisan, ArtisanProfile, User.phone)
            .outerjoin(User, Artisan.user_id == User.id)
            .outerjoin(ArtisanProfile, ArtisanProfile.artisan_id == Artisan.id)
            .where(Artisan.managed_by == user.id)
            .order_by(Artisan.created_at.desc())
        )
    ).all()
    return [_out(artisan, profile, phone) for artisan, profile, phone in rows]


@router.post("/artisans", response_model=ManagedArtisanOut, status_code=201)
async def create_artisan(
    body: ManagedArtisanIn,
    user: User = Depends(current_sakhi),
    db: AsyncSession = Depends(get_db),
):
    """
    Enrol an artisan.

    With a phone she gets a user row and can log in herself later; without one
    she gets a profile the coordinator maintains on her behalf. Both are valid
    states -- a shared handset is the norm in a cluster, not an edge case.
    """
    artisan_user: User | None = None

    if body.phone:
        existing = await db.scalar(select(User).where(User.phone == body.phone))
        if existing is not None:
            if existing.role != "artisan":
                raise AppError(
                    "ALREADY_EXISTS",
                    f"That number is registered as {existing.role}",
                    409,
                    {"role": existing.role},
                )
            # She already has an account. Claiming it silently would let any
            # coordinator adopt any artisan in the programme, so refuse and
            # leave reassignment to the admin.
            owned = await db.scalar(
                select(Artisan).where(Artisan.user_id == existing.id)
            )
            if owned is not None:
                raise AppError(
                    "ALREADY_EXISTS",
                    "That artisan already has a profile",
                    409,
                )
            artisan_user = existing
        else:
            artisan_user = User(
                phone=body.phone, role="artisan", preferred_lang="hi"
            )
            db.add(artisan_user)
            await db.flush()

    artisan = Artisan(
        user_id=artisan_user.id if artisan_user else None,
        managed_by=user.id,
        name=body.name,
        village=body.village,
        primary_craft=body.primary_craft,
    )
    db.add(artisan)
    await db.flush()

    lat, lon = coords_for(body.village, seed=body.name)
    profile = ArtisanProfile(
        artisan_id=artisan.id, language=body.language, lat=lat, lon=lon
    )
    db.add(profile)
    await db.flush()

    return _out(artisan, profile, body.phone)


@router.post("/artisans/demo-seed", response_model=list[ManagedArtisanOut])
async def seed_demo_artisans(
    user: User = Depends(current_sakhi),
    db: AsyncSession = Depends(get_db),
):
    """
    Populate a few varied dummy artisans for a demo.

    Idempotent in the way that matters for a button on an empty state: if
    this coordinator already has any artisans, nothing is added and her
    current list comes back unchanged, so tapping it twice cannot double up.
    """
    existing = (
        await db.execute(select(Artisan).where(Artisan.managed_by == user.id))
    ).scalars().all()
    if existing:
        return await list_artisans(user, db)

    for demo in _DEMO_ARTISANS:
        # Each demo artisan gets a real user row with a phone, so the
        # directory's Call button is actually dialable in a demo rather than
        # greyed out. (A phone-less artisan is still a valid state -- it is
        # just not a useful one to demo.)
        artisan_user = User(
            phone=await _unique_demo_phone(db),
            role="artisan",
            display_name=demo["name"],
            preferred_lang=demo["lang_code"],
        )
        db.add(artisan_user)
        await db.flush()

        artisan = Artisan(
            user_id=artisan_user.id,
            managed_by=user.id,
            name=demo["name"],
            village=demo["village"],
            primary_craft=demo["primary_craft"],
        )
        db.add(artisan)
        await db.flush()
        lat, lon = coords_for(demo["village"], seed=demo["name"])
        db.add(
            ArtisanProfile(
                artisan_id=artisan.id, language=demo["language"], lat=lat, lon=lon
            )
        )
    await db.flush()

    return await list_artisans(user, db)


@router.get("/artisans/{artisan_id}/messages", response_model=list[MessageOut])
async def list_messages(
    artisan_id: uuid.UUID,
    user: User = Depends(current_sakhi),
    db: AsyncSession = Depends(get_db),
):
    await _managed_artisan(db, user, artisan_id)  # raises 404 if not hers

    rows = (
        await db.execute(
            select(Message)
            .where(Message.artisan_id == artisan_id)
            .order_by(Message.created_at.asc())
        )
    ).scalars().all()
    return [
        MessageOut(
            id=str(m.id),
            artisan_id=str(m.artisan_id),
            sender=m.sender,
            kind=m.kind,
            body=m.body,
            translated_body=m.translated_body,
            audio_path=m.audio_path,
            created_at=m.created_at,
        )
        for m in rows
    ]


@router.post("/artisans/{artisan_id}/messages", response_model=MessageOut, status_code=201)
async def send_text_message(
    artisan_id: uuid.UUID,
    body: MessageIn,
    user: User = Depends(current_sakhi),
    db: AsyncSession = Depends(get_db),
):
    """
    Send a text message, translated into the artisan's language.

    Translation failing (no GROQ_API_KEY, provider down) is not a reason to
    block the send -- app/services/translate.py already returns None rather
    than raising, so the message goes through in English either way and
    translated_body is just absent.
    """
    _, profile = await _managed_artisan(db, user, artisan_id)
    language = profile.language if profile else "Hindi"

    translated, _ok = await translate_service.translate(body.body, language)

    message = Message(
        artisan_id=artisan_id,
        sender="sakhi",
        kind="text",
        body=body.body,
        translated_body=translated,
    )
    db.add(message)
    await db.flush()

    return MessageOut(
        id=str(message.id),
        artisan_id=str(message.artisan_id),
        sender=message.sender,
        kind=message.kind,
        body=message.body,
        translated_body=message.translated_body,
        audio_path=message.audio_path,
        created_at=message.created_at,
    )


@router.post(
    "/artisans/{artisan_id}/messages/voice",
    response_model=MessageOut,
    status_code=201,
)
async def send_voice_message(
    artisan_id: uuid.UUID,
    file: UploadFile = File(...),
    user: User = Depends(current_sakhi),
    db: AsyncSession = Depends(get_db),
):
    await _managed_artisan(db, user, artisan_id)  # raises 404 if not hers

    data = await file.read()
    if not data:
        raise AppError("EMPTY_FILE", "That recording is empty", 400)

    audio_path = media_store.save_voice(data, file.content_type)

    message = Message(
        artisan_id=artisan_id,
        sender="sakhi",
        kind="voice",
        audio_path=audio_path,
    )
    db.add(message)
    await db.flush()

    return MessageOut(
        id=str(message.id),
        artisan_id=str(message.artisan_id),
        sender=message.sender,
        kind=message.kind,
        body=message.body,
        translated_body=message.translated_body,
        audio_path=message.audio_path,
        created_at=message.created_at,
    )
