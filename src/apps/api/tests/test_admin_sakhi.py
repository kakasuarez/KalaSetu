"""
Integration tests for 3-role auth, Admin coordinator management, and Sakhi operations.
"""
from __future__ import annotations

import io
import pytest
from sqlalchemy import select

from app.config import settings
from app.models.artisan import Artisan
from app.models.artisan_profile import ArtisanProfile
from app.models.message import Message
from app.models.user import User
from tests.conftest import auth_header, unique_phone


# ==============================================================================
# 1. 3-Role Auth & Role Gating Tests
# ==============================================================================


@pytest.mark.integration
async def test_admin_seeded_login(api, monkeypatch):
    phone = unique_phone()
    otp = "2026"
    monkeypatch.setattr(settings, "admin_phone", phone, raising=False)
    monkeypatch.setattr(settings, "admin_otp", otp, raising=False)

    # Request OTP for admin phone returns debug_otp=None
    req = await api.post("/auth/otp/request", json={"phone": phone, "role": "admin"})
    assert req.status_code == 200
    assert req.json()["sent"] is True
    assert req.json()["debug_otp"] is None

    # Verify with correct seeded OTP returns admin token
    verify = await api.post(
        "/auth/otp/verify", json={"phone": phone, "role": "admin", "otp": otp}
    )
    assert verify.status_code == 200
    data = verify.json()
    assert data["role"] == "admin"
    assert data["access_token"]
    assert data["display_name"] == "Administrator"

    # Verify with wrong OTP returns 401 INVALID_OTP
    bad = await api.post(
        "/auth/otp/verify", json={"phone": phone, "role": "admin", "otp": "0000"}
    )
    assert bad.status_code == 401
    assert bad.json()["error"]["code"] == "INVALID_OTP"


@pytest.mark.integration
async def test_admin_phone_collision_returns_409(api, db, monkeypatch):
    # Setup an existing artisan user
    phone = unique_phone()
    artisan_user = User(phone=phone, role="artisan", display_name="Regular Artisan")
    db.add(artisan_user)
    await db.flush()

    # Admin configured with the same phone
    monkeypatch.setattr(settings, "admin_phone", phone, raising=False)
    monkeypatch.setattr(settings, "admin_otp", "2026", raising=False)

    # Verifying as admin when phone belongs to artisan must refuse with 409 ROLE_CONFLICT
    verify = await api.post(
        "/auth/otp/verify", json={"phone": phone, "role": "admin", "otp": "2026"}
    )
    assert verify.status_code == 409
    assert verify.json()["error"]["code"] == "ROLE_CONFLICT"


@pytest.mark.integration
async def test_role_gate_prevents_unauthorized_sakhi_self_enrollment(api):
    phone = unique_phone()

    # 1. Requesting OTP for unregistered phone with role="sakhi" does not issue OTP
    req = await api.post("/auth/otp/request", json={"phone": phone, "role": "sakhi"})
    assert req.status_code == 200
    assert req.json()["debug_otp"] is None

    # 2. Attempting to verify without a valid OTP returns 401 INVALID_OTP
    verify_bad = await api.post(
        "/auth/otp/verify", json={"phone": phone, "role": "sakhi", "otp": "1234"}
    )
    assert verify_bad.status_code == 401
    assert verify_bad.json()["error"]["code"] == "INVALID_OTP"

    # 3. If caller requested OTP as artisan, but attempts to verify as sakhi on first login:
    req_artisan = await api.post("/auth/otp/request", json={"phone": phone, "role": "artisan"})
    assert req_artisan.status_code == 200
    otp = req_artisan.json()["debug_otp"]
    assert otp is not None

    # Attempting to sign up as sakhi using that OTP returns 401 INVALID_CREDENTIALS
    verify_escalate = await api.post(
        "/auth/otp/verify", json={"phone": phone, "role": "sakhi", "otp": otp}
    )
    assert verify_escalate.status_code == 401
    assert verify_escalate.json()["error"]["code"] == "INVALID_CREDENTIALS"


# ==============================================================================
# 2. Admin Coordinator Management Endpoints (/admin)
# ==============================================================================


@pytest.mark.integration
async def test_admin_coordinators_crud(api, db):
    # Setup admin user
    admin_user = User(
        phone=unique_phone(), role="admin", display_name="Super Admin"
    )
    db.add(admin_user)
    await db.flush()
    headers = auth_header(admin_user)

    # List coordinators initially
    r = await api.get("/admin/coordinators", headers=headers)
    assert r.status_code == 200

    # Create new coordinator
    coord_phone = unique_phone()
    create_resp = await api.post(
        "/admin/coordinators",
        json={"phone": coord_phone, "name": "Geeta Sakhi"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    coord_data = create_resp.json()
    assert coord_data["phone"] == coord_phone
    assert coord_data["display_name"] == "Geeta Sakhi"
    assert coord_data["artisan_count"] == 0
    coord_id = coord_data["id"]

    # Prevent duplicate phone registration
    dup_resp = await api.post(
        "/admin/coordinators",
        json={"phone": coord_phone, "name": "Duplicate Sakhi"},
        headers=headers,
    )
    assert dup_resp.status_code == 409
    assert dup_resp.json()["error"]["code"] == "ALREADY_EXISTS"

    # List coordinators includes new coordinator
    list_resp = await api.get("/admin/coordinators", headers=headers)
    assert list_resp.status_code == 200
    coordinators = list_resp.json()
    assert any(c["id"] == coord_id for c in coordinators)

    # Delete coordinator
    del_resp = await api.delete(f"/admin/coordinators/{coord_id}", headers=headers)
    assert del_resp.status_code == 200
    assert del_resp.json()["ok"] is True

    # Confirm deletion
    post_del_resp = await api.get("/admin/coordinators", headers=headers)
    assert not any(c["id"] == coord_id for c in post_del_resp.json())


@pytest.mark.integration
async def test_admin_authorization_guard(api, db):
    # Non-admin user (artisan)
    artisan_user = User(phone=unique_phone(), role="artisan")
    db.add(artisan_user)
    await db.flush()

    r = await api.get("/admin/coordinators", headers=auth_header(artisan_user))
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN"


# ==============================================================================
# 3. Sakhi Managed Artisan Endpoints (/sakhi)
# ==============================================================================


@pytest.mark.integration
async def test_sakhi_artisans_lifecycle(api, db):
    # Setup sakhi user
    sakhi_user = User(
        phone=unique_phone(), role="sakhi", display_name="Sakhi Coordinator"
    )
    db.add(sakhi_user)
    await db.flush()
    headers = auth_header(sakhi_user)

    # Enrol new artisan with profile
    artisan_phone = unique_phone()
    create_resp = await api.post(
        "/sakhi/artisans",
        json={
            "name": "Devi Bai",
            "phone": artisan_phone,
            "village": "Jaipur",
            "primary_craft": "Blue Pottery",
            "language": "Hindi",
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    artisan_data = create_resp.json()
    assert artisan_data["name"] == "Devi Bai"
    assert artisan_data["village"] == "Jaipur"
    assert artisan_data["primary_craft"] == "Blue Pottery"
    assert artisan_data["language"] == "Hindi"
    assert isinstance(artisan_data["lat"], float)
    assert isinstance(artisan_data["lon"], float)
    artisan_id = artisan_data["id"]

    # List managed artisans
    list_resp = await api.get("/sakhi/artisans", headers=headers)
    assert list_resp.status_code == 200
    artisans = list_resp.json()
    assert any(a["id"] == artisan_id for a in artisans)

    # Send text message to artisan
    msg_resp = await api.post(
        f"/sakhi/artisans/{artisan_id}/messages",
        json={"body": "Namaste, your order is ready."},
        headers=headers,
    )
    assert msg_resp.status_code == 201
    msg_data = msg_resp.json()
    assert msg_data["artisan_id"] == artisan_id
    assert msg_data["sender"] == "sakhi"
    assert msg_data["kind"] == "text"
    assert msg_data["body"] == "Namaste, your order is ready."

    # Send voice message to artisan
    fake_audio = io.BytesIO(b"RIFF....WAVEfmt ....data....")
    voice_resp = await api.post(
        f"/sakhi/artisans/{artisan_id}/messages/voice",
        files={"file": ("recording.wav", fake_audio, "audio/wav")},
        headers=headers,
    )
    assert voice_resp.status_code == 201
    voice_data = voice_resp.json()
    assert voice_data["artisan_id"] == artisan_id
    assert voice_data["kind"] == "voice"
    assert voice_data["audio_path"].startswith("media/voice/")

    # List messages in thread
    thread_resp = await api.get(
        f"/sakhi/artisans/{artisan_id}/messages", headers=headers
    )
    assert thread_resp.status_code == 200
    thread = thread_resp.json()
    assert len(thread) >= 2


@pytest.mark.integration
async def test_sakhi_demo_seed_idempotency(api, db):
    sakhi_user = User(
        phone=unique_phone(), role="sakhi", display_name="Demo Sakhi"
    )
    db.add(sakhi_user)
    await db.flush()
    headers = auth_header(sakhi_user)

    # First seed: populates demo artisans
    first_seed = await api.post("/sakhi/artisans/demo-seed", headers=headers)
    assert first_seed.status_code == 200
    artisans1 = first_seed.json()
    assert len(artisans1) == 6

    # Second seed: returns existing artisans idempotently without duplicating
    second_seed = await api.post("/sakhi/artisans/demo-seed", headers=headers)
    assert second_seed.status_code == 200
    artisans2 = second_seed.json()
    assert len(artisans2) == 6
    assert [a["id"] for a in artisans1] == [a["id"] for a in artisans2]
