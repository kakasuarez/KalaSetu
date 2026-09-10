"""KalaSetu API entrypoint."""
from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager


from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from pathlib import Path

from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db import engine
from app.errors import REQUEST_ID_HEADER, register_exception_handlers
from app.routers import (
    admin,
    artisans,
    assistant,
    catalog,
    coach,
    craft,
    health,
    images,
    listings,
    media,
    preview3d,
    pricing,
    publish,
    rag,
    reports,
    sakhi,
    video,
    whatsapp,
)
from app.routers import auth as auth_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
)
log = logging.getLogger("kalasetu")

ROUTERS = (
    health,
    auth_router,
    admin,
    sakhi,
    artisans,
    assistant,
    media,
    images,
    catalog,
    pricing,
    craft,
    listings,
    video,
    rag,
    whatsapp,
    publish,
    coach,
    preview3d,
    reports,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("starting KalaSetu API env=%s offline_demo=%s", settings.env, settings.offline_demo_mode)
    try:
        yield
    finally:
        await engine.dispose()
        log.info("shutdown complete")



app = FastAPI(title="KalaSetu API", version="1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    # Credentials cannot be combined with a wildcard origin -- browsers reject
    # the pair -- and we authenticate with a bearer header, not cookies.
    allow_credentials=not settings.is_dev,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[REQUEST_ID_HEADER],
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    """Tag every request so a log line and an error envelope can be matched up."""
    rid = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex[:12]
    request.state.request_id = rid
    started = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - started) * 1000
    response.headers[REQUEST_ID_HEADER] = rid
    log.info(
        "%s %s -> %s %.0fms [%s]",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
        rid,
    )
    return response


register_exception_handlers(app)

for r in ROUTERS:
    app.include_router(r.router)

# Mount static voice recordings
_media_root = Path(settings.local_storage_dir)
_voice_dir = _media_root / "voice"
_voice_dir.mkdir(parents=True, exist_ok=True)
app.mount("/media/voice", StaticFiles(directory=str(_voice_dir)), name="voice_media")


@app.on_event("startup")
async def _announce_admin() -> None:
    if settings.admin_enabled:
        log.info("admin login enabled phone=%s", settings.admin_phone)
    else:
        log.warning(
            "ADMIN_PHONE/ADMIN_OTP not set -- admin login is disabled"
        )

