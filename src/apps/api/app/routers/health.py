"""
Liveness and readiness.

Two endpoints, deliberately:

  GET /health        cheap, no dependencies, always 200. This is what a
                     platform health check should poll -- a DB blip must not
                     cause the container to be restarted.
  GET /health/ready  checks every dependency, returns 503 when the database is
                     down. This is what the mobile app and the pre-demo
                     checklist hit.

The ML service being unreachable is reported but NOT fatal: every AI path in
this project has a deterministic fallback (PRD design principle "fail soft").
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db

router = APIRouter(tags=["health"])


def _detail(exc: Exception) -> str:
    """Raw exception text is useful locally and a disclosure risk in prod."""
    return f"{type(exc).__name__}: {exc}" if settings.is_dev else type(exc).__name__


async def _timed(coro) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        await coro
        status, detail = "ok", None
    except Exception as exc:  # noqa: BLE001 -- a health check reports, never raises
        status, detail = "fail", _detail(exc)
    result: dict[str, Any] = {
        "status": status,
        "latency_ms": round((time.perf_counter() - started) * 1000, 1),
    }
    if detail:
        result["detail"] = detail
    return result


@router.get("/health")
async def health() -> dict[str, Any]:
    """Liveness. If the process can answer this, it is alive."""
    return {"status": "ok", "env": settings.env, "version": "1.0"}


@router.get("/health/ready")
async def ready(
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    async def check_db() -> None:
        await db.execute(text("SELECT 1"))

    async def check_ml() -> None:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(f"{settings.ml_service_url}/health")
            r.raise_for_status()

    db_check, ml_check = await asyncio.gather(
        _timed(check_db()),
        _timed(check_ml()),
    )

    checks = {"db": db_check, "ml": ml_check}

    # The ML service is optional (fallbacks exist); the database is not.
    if db_check["status"] != "ok":
        overall, response.status_code = "unhealthy", 503
    elif ml_check["status"] != "ok":
        overall = "degraded"
    else:
        overall = "ok"

    return {
        "status": overall,
        "env": settings.env,
        "offline_demo_mode": settings.offline_demo_mode,
        "checks": checks,
    }

