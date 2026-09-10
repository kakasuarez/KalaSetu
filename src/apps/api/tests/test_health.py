"""Health and error-envelope contract.

The envelope shape is load-bearing: apps/mobile/src/api/client.ts parses
{"error": {code, message, details}} and throws ApiError from it. If these
tests break, every error in the app degrades to code "UNKNOWN".
"""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_liveness_is_cheap_and_always_ok(api):
    """/health must not touch the database -- a DB blip must not restart us."""
    r = await api.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_every_response_carries_a_request_id(api):
    r = await api.get("/health")
    assert r.headers.get("X-Request-ID")


@pytest.mark.asyncio
async def test_request_id_is_echoed_when_supplied(api):
    r = await api.get("/health", headers={"X-Request-ID": "abc123"})
    assert r.headers["X-Request-ID"] == "abc123"


@pytest.mark.asyncio
async def test_404_uses_the_standard_error_envelope(api):
    r = await api.get("/definitely-not-a-route")
    assert r.status_code == 404
    err = r.json()["error"]
    assert err["code"] == "NOT_FOUND"
    assert "request_id" in err["details"]


@pytest.mark.asyncio
async def test_validation_failure_uses_the_standard_envelope(api):
    """A bad body must not fall through to FastAPI's default shape."""
    r = await api.post("/auth/otp/request", json={"phone": "not-a-number"})
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "VALIDATION_ERROR"
    assert err["details"]["fields"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_readiness_reports_each_dependency(api):
    r = await api.get("/health/ready")
    assert r.status_code in (200, 503)
    body = r.json()
    assert set(body["checks"]) == {"db", "redis", "ml"}
    for check in body["checks"].values():
        assert check["status"] in ("ok", "fail")
        assert isinstance(check["latency_ms"], float)
    assert (body["status"] == "ok") == all(
        c["status"] == "ok" for c in body["checks"].values()
    )
