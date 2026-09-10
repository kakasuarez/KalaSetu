"""
The artisan profile surface the redesigned app depends on: a resolvable photo
URL, a story card, and a grid that does not need one request per tile.
"""
from __future__ import annotations

import io

import pytest
from PIL import Image

from tests.conftest import auth_header

from app.services.story_card import render_story_card


# ------------------------------------------------------------- story card


def test_story_card_renders_a_real_image():
    data = render_story_card(
        name="Meena Devi",
        village="Madhubani",
        district="Bihar",
        state=None,
        craft="Mithila painting",
        years=12,
        story="I learned this from my mother when I was nine.",
        photo=None,
    )

    image = Image.open(io.BytesIO(data))
    assert image.format == "JPEG"
    assert image.size == (1080, 1350)


def test_story_card_survives_every_field_being_absent():
    """A card is rendered the day she signs up, before she has filled in
    anything. It must not raise, and it must not invent a village."""
    data = render_story_card(
        name="Artisan 8200",
        village=None,
        district=None,
        state=None,
        craft=None,
        years=None,
        story=None,
        photo=None,
    )
    assert Image.open(io.BytesIO(data)).size == (1080, 1350)


def test_story_card_survives_an_unreadable_photo():
    """An upload that is not really an image must degrade to the initial
    circle, not 500 the profile screen."""
    data = render_story_card(
        name="Meena Devi",
        village="Madhubani",
        district=None,
        state=None,
        craft="Mithila painting",
        years=12,
        story="Two lines about my work.",
        photo=b"this is not a jpeg",
    )
    assert Image.open(io.BytesIO(data)).size == (1080, 1350)


def test_mixed_script_line_is_split_by_script():
    """The trap that made "12 years" render as tofu boxes: PIL draws one
    string in one face, and neither Noto face covers both scripts."""
    from app.services.story_card import _runs

    runs = _runs("मिथिला · 12 years")
    assert [deva for _, deva in runs] == [True, False]
    # The middle dot must land in the Latin run -- the Devanagari face has no
    # glyph for it.
    assert "·" in runs[1][0]


# ---------------------------------------------------------------- profile


@pytest.mark.integration
@pytest.mark.asyncio
async def test_photo_must_be_media_she_owns(api, artisan_factory, local_storage):
    """photo_media_id is taken instead of a storage key precisely so this
    cannot happen: pointing a profile at another artisan's file."""
    owner, _ = await artisan_factory()
    intruder, _ = await artisan_factory()

    upload = await api.post(
        "/media/upload",
        files={"file": ("face.jpg", b"\xff\xd8\xff\xdb" + b"0" * 64, "image/jpeg")},
        data={"kind": "image_raw"},
        headers=auth_header(owner),
    )
    assert upload.status_code == 201
    media_id = upload.json()["id"]

    r = await api.patch(
        "/artisans/me",
        json={"photo_media_id": media_id},
        headers=auth_header(intruder),
    )
    assert r.status_code == 404

    r = await api.patch(
        "/artisans/me",
        json={"photo_media_id": media_id},
        headers=auth_header(owner),
    )
    assert r.status_code == 200
    assert r.json()["photo_url"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_profile_carries_a_story_card_url(api, artisan_factory, local_storage):
    user, _ = await artisan_factory()

    r = await api.get("/artisans/me", headers=auth_header(user))
    assert r.status_code == 200
    assert r.json()["story_card_url"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_listing_rows_carry_their_image_url(api, artisan_factory, local_storage):
    """The whole point of resolving on list: a six-card grid is one request.

    Before this, only GET /listings/{id} resolved a URL, so the Shop screen
    would have made one call per tile.
    """
    user, _ = await artisan_factory()
    h = auth_header(user)

    upload = await api.post(
        "/media/upload",
        files={"file": ("pot.jpg", b"\xff\xd8\xff\xdb" + b"0" * 64, "image/jpeg")},
        data={"kind": "image_raw"},
        headers=h,
    )
    media_id = upload.json()["id"]

    created = await api.post(
        "/listings",
        json={"title_en": "Blue Pottery Vase", "primary_media_id": media_id},
        headers=h,
    )
    assert created.status_code == 201

    listed = await api.get("/listings", headers=h)
    assert listed.status_code == 200
    rows = listed.json()
    assert len(rows) == 1
    assert rows[0]["primary_media_url"], "list rows must resolve their own image"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_listing_without_a_photo_has_a_null_url(api, artisan_factory, local_storage):
    """A listing can exist before its photo does. Null, not a broken URL."""
    user, _ = await artisan_factory()
    h = auth_header(user)

    await api.post("/listings", json={"title_en": "No photo yet"}, headers=h)

    rows = (await api.get("/listings", headers=h)).json()
    assert rows[0]["primary_media_url"] is None
