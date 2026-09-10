"""
Auth flow and the login throttle.

The throttle is the important one here. A 4-digit PIN is 10,000 combinations;
without a lockout an artisan's account is a shell loop away from compromise.
"""
from __future__ import annotations

import pytest

from app.schemas.auth import normalise_phone
from tests.conftest import unique_phone


async def _login(api, phone: str) -> str:
    """OTP round-trip, returning a usable access token."""
    r = await api.post("/auth/otp/request", json={"phone": phone})
    otp = r.json()["debug_otp"]
    r = await api.post("/auth/otp/verify", json={"phone": phone, "otp": otp})
    return r.json()["access_token"]


# ---------- phone normalisation ----------

@pytest.mark.parametrize(
    "raw",
    ["9876543210", "+919876543210", "919876543210", "98765 43210", "+91 98765-43210"],
)
def test_phone_forms_normalise_to_one_canonical_value(raw):
    assert normalise_phone(raw) == "+919876543210"


@pytest.mark.parametrize("raw", ["12345", "5876543210", "", "abcdefghij", "98765432101"])
def test_invalid_phones_are_rejected(raw):
    with pytest.raises(ValueError):
        normalise_phone(raw)


# ---------- OTP ----------

@pytest.mark.integration
async def test_otp_login_creates_user_and_artisan(api):
    phone = unique_phone()

    r = await api.post("/auth/otp/request", json={"phone": phone})
    assert r.status_code == 200
    otp = r.json()["debug_otp"]
    assert otp and len(otp) == 4  # dev only; None in production

    r = await api.post("/auth/otp/verify", json={"phone": phone, "otp": otp})
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"]
    assert body["role"] == "artisan"
    assert body["pin_set"] is False  # no PIN yet
    assert body["artisan_id"]  # profile created in the same step

    # The token works immediately.
    me = await api.get(
        "/artisans/me", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert me.status_code == 200


@pytest.mark.integration
async def test_otp_is_single_use(api):
    phone = unique_phone()
    r = await api.post("/auth/otp/request", json={"phone": phone})
    otp = r.json()["debug_otp"]

    first = await api.post("/auth/otp/verify", json={"phone": phone, "otp": otp})
    assert first.status_code == 200

    replay = await api.post("/auth/otp/verify", json={"phone": phone, "otp": otp})
    assert replay.status_code == 401
    assert replay.json()["error"]["code"] == "INVALID_OTP"


@pytest.mark.integration
async def test_wrong_otp_rejected(api):
    phone = unique_phone()
    r = await api.post("/auth/otp/request", json={"phone": phone})
    real = r.json()["debug_otp"]
    wrong = "0000" if real != "0000" else "1111"

    bad = await api.post("/auth/otp/verify", json={"phone": phone, "otp": wrong})
    assert bad.status_code == 401


# ---------- PIN ----------

@pytest.mark.integration
async def test_weak_pins_are_rejected(api):
    """A repeated-digit PIN is the first thing an attacker tries."""
    token = await _login(api, unique_phone())
    r = await api.post(
        "/auth/pin/set",
        json={"pin": "1111"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.integration
async def test_non_numeric_pin_is_rejected(api):
    token = await _login(api, unique_phone())
    r = await api.post(
        "/auth/pin/set",
        json={"pin": "abcd"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 422


@pytest.mark.integration
async def test_set_pin_then_login(api):
    phone = unique_phone()
    token = await _login(api, phone)

    r = await api.post(
        "/auth/pin/set",
        json={"pin": "2468"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200

    good = await api.post("/auth/pin/login", json={"phone": phone, "pin": "2468"})
    assert good.status_code == 200
    assert good.json()["pin_set"] is True

    bad = await api.post("/auth/pin/login", json={"phone": phone, "pin": "1357"})
    assert bad.status_code == 401
    assert bad.json()["error"]["code"] == "INVALID_CREDENTIALS"


@pytest.mark.integration
async def test_pin_login_locks_out_after_repeated_failures(api):
    """Without this, a 4-digit PIN falls to brute force in seconds."""
    phone = unique_phone()
    token = await _login(api, phone)
    await api.post(
        "/auth/pin/set",
        json={"pin": "2468"},
        headers={"Authorization": f"Bearer {token}"},
    )

    responses = []
    for _ in range(7):
        responses.append(
            await api.post("/auth/pin/login", json={"phone": phone, "pin": "9999"})
        )

    assert responses[0].status_code == 401
    assert any(r.status_code == 429 for r in responses), "never locked out"
    locked = next(r for r in responses if r.status_code == 429)
    assert locked.json()["error"]["code"] == "TOO_MANY_ATTEMPTS"

    # The correct PIN is refused too while locked -- otherwise the lockout is
    # trivially bypassed by the attacker who just guessed right.
    correct = await api.post("/auth/pin/login", json={"phone": phone, "pin": "2468"})
    assert correct.status_code == 429


@pytest.mark.integration
async def test_login_error_does_not_reveal_whether_the_phone_exists(api):
    """Same code and message for an unknown number and a wrong PIN."""
    phone = unique_phone()
    token = await _login(api, phone)
    await api.post(
        "/auth/pin/set",
        json={"pin": "2468"},
        headers={"Authorization": f"Bearer {token}"},
    )

    wrong_pin = await api.post("/auth/pin/login", json={"phone": phone, "pin": "1357"})
    unknown = await api.post(
        "/auth/pin/login", json={"phone": unique_phone(), "pin": "1357"}
    )

    assert wrong_pin.status_code == unknown.status_code == 401
    assert wrong_pin.json()["error"]["message"] == unknown.json()["error"]["message"]


# ---------- token handling ----------

async def test_missing_token_is_401(api):
    r = await api.get("/artisans/me")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.parametrize(
    "value", ["Bearer nonsense", "Bearer ", "Basic abc", "nonsense", ""]
)
async def test_garbage_token_is_401_not_500(api, value):
    r = await api.get("/artisans/me", headers={"Authorization": value})
    assert r.status_code == 401


async def test_token_signed_with_another_key_is_rejected(api):
    import jwt as pyjwt

    forged = pyjwt.encode(
        {"sub": "00000000-0000-0000-0000-000000000000", "role": "admin"},
        "not-the-real-key",
        algorithm="HS256",
    )
    r = await api.get("/artisans/me", headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 401


async def test_expired_token_is_rejected(api, monkeypatch):
    from app.config import settings
    from app.security import create_token

    monkeypatch.setattr(settings, "jwt_expire_minutes", -1, raising=False)
    expired = create_token("00000000-0000-0000-0000-000000000000", "artisan")
    r = await api.get("/artisans/me", headers={"Authorization": f"Bearer {expired}"})
    assert r.status_code == 401
