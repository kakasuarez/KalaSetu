"""
Listing CRUD and, most importantly, tenant isolation.

The DoD names one test explicitly: artisan A must not be able to read artisan
B's listing. current_artisan is the only thing enforcing that, so it is
exercised from every angle here -- read, update, media attach, and Sakhi mode.
"""
from __future__ import annotations

import uuid

import pytest

from tests.conftest import auth_header


@pytest.mark.integration
@pytest.mark.asyncio
async def test_create_list_and_update(api, artisan_factory):
    user, _ = await artisan_factory()
    h = auth_header(user)

    r = await api.post("/listings", json={"title_en": "Blue Pottery Vase", "price": "450.00"},
                 headers=h)
    assert r.status_code == 201
    body = r.json()
    listing_id = body["id"]

    # Server-side defaults must be populated -- flush alone does not read them
    # back, which is the bug the PRD skeleton has.
    assert body["status"] == "draft"
    assert body["created_at"] is not None
    assert body["updated_at"] is not None
    assert body["stock_qty"] == 1
    assert body["facts"] == {}

    r = await api.get("/listings", headers=h)
    assert r.status_code == 200
    assert [x["id"] for x in r.json()] == [listing_id]

    r = await api.patch(f"/listings/{listing_id}", json={"price": "525.00", "status": "ready"},
                  headers=h)
    assert r.status_code == 200
    assert r.json()["status"] == "ready"
    assert r.json()["price"] == "525.00"

    r = await api.get(f"/listings/{listing_id}", headers=h)
    assert r.status_code == 200
    assert r.json()["title_en"] == "Blue Pottery Vase"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_status_filter_and_validation(api, artisan_factory):
    user, _ = await artisan_factory()
    h = auth_header(user)

    await api.post("/listings", json={"title_en": "Draft one"}, headers=h)
    r = await api.post("/listings", json={"title_en": "Ready one", "status": "ready"}, headers=h)
    assert r.status_code == 201

    assert len((await api.get("/listings?status=ready", headers=h)).json()) == 1
    assert len((await api.get("/listings?status=draft", headers=h)).json()) == 1

    bad = await api.get("/listings?status=nonsense", headers=h)
    assert bad.status_code == 400
    assert bad.json()["error"]["code"] == "BAD_REQUEST"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_client_cannot_set_published_status(api, artisan_factory):
    """`published` belongs to the Phase 8 publisher, not to the client."""
    user, _ = await artisan_factory()
    r = await api.post("/listings", json={"title_en": "X", "status": "published"},
                 headers=auth_header(user))
    assert r.status_code == 422


# ---------- tenant isolation: the DoD test ----------

@pytest.mark.integration
@pytest.mark.asyncio
async def test_artisan_a_cannot_read_artisan_b_listing(api, artisan_factory):
    user_a, _ = await artisan_factory()
    user_b, _ = await artisan_factory()

    created = await api.post("/listings", json={"title_en": "A's secret vase"},
                       headers=auth_header(user_a))
    assert created.status_code == 201
    listing_id = created.json()["id"]

    # 404, not 403: a 403 would confirm the id exists.
    denied = await api.get(f"/listings/{listing_id}", headers=auth_header(user_b))
    assert denied.status_code == 404
    denied_patch = await api.patch(f"/listings/{listing_id}", json={"price": "1.00"},
                                   headers=auth_header(user_b))
    assert denied_patch.status_code == 404
    # And it must not leak through the list endpoint either.
    listed = await api.get("/listings", headers=auth_header(user_b))
    assert listed.json() == []


@pytest.mark.integration
@pytest.mark.asyncio
async def test_cannot_attach_another_artisans_media(api, artisan_factory, local_storage):
    user_a, _ = await artisan_factory()
    user_b, _ = await artisan_factory()

    up = await api.post(
        "/media/upload",
        files={"file": ("v.jpg", b"\xff\xd8\xff\xdb" + b"0" * 128, "image/jpeg")},
        data={"kind": "image_raw"},
        headers=auth_header(user_a),
    )
    assert up.status_code == 201
    media_id = up.json()["id"]

    r = await api.post("/listings", json={"title_en": "B's listing", "primary_media_id": media_id},
                 headers=auth_header(user_b))
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "MEDIA_NOT_FOUND"

    # And B cannot read the URL for it either.
    other = await api.get(f"/media/{media_id}/url", headers=auth_header(user_b))
    assert other.status_code == 404


# ---------- Sakhi mode ----------

@pytest.mark.integration
@pytest.mark.asyncio
async def test_sakhi_can_act_only_for_managed_artisans(api, artisan_factory, db):
    from app.models.artisan import Artisan

    sakhi_user, _ = await artisan_factory(role="sakhi")

    managed = Artisan(name="Managed artisan", managed_by=sakhi_user.id)
    db.add(managed)
    _, unmanaged = await artisan_factory()
    await db.flush()

    h = auth_header(sakhi_user)

    ok = await api.get("/artisans/me", headers={**h, "X-Artisan-Id": str(managed.id)})
    assert ok.status_code == 200
    assert ok.json()["name"] == "Managed artisan"

    denied = await api.get("/artisans/me", headers={**h, "X-Artisan-Id": str(unmanaged.id)})
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "FORBIDDEN"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_plain_artisan_cannot_use_the_sakhi_header(api, artisan_factory):
    """The header must be inert for a non-sakhi, not a privilege escalation."""
    user_a, _ = await artisan_factory()
    _, artisan_b = await artisan_factory()

    r = await api.get("/artisans/me",
                headers={**auth_header(user_a), "X-Artisan-Id": str(artisan_b.id)})
    assert r.status_code == 403


@pytest.mark.integration
@pytest.mark.asyncio
async def test_malformed_artisan_header_is_400_not_500(api, artisan_factory):
    user, _ = await artisan_factory(role="sakhi")
    r = await api.get("/artisans/me",
                headers={**auth_header(user), "X-Artisan-Id": "not-a-uuid"})
    assert r.status_code == 400


@pytest.mark.integration
@pytest.mark.asyncio
async def test_unknown_listing_id_is_404(api, artisan_factory):
    user, _ = await artisan_factory()
    r = await api.get(f"/listings/{uuid.uuid4()}", headers=auth_header(user))
    assert r.status_code == 404
