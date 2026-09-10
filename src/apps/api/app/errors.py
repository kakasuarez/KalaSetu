"""
One error shape for the whole API:

    {"error": {"code": "FACT_MISSING", "message": "...", "details": {...}}}

apps/mobile/src/api/client.ts parses exactly this and throws ApiError(code,
message, details). Anything that escapes without going through here reaches the
app as code "UNKNOWN", which the UI cannot act on -- so every exception class
FastAPI can raise is mapped below, including the catch-all.
"""
from __future__ import annotations

import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings

log = logging.getLogger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"

# Status code -> stable error code, so the app can branch on code, not number.
_STATUS_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    503: "SERVICE_UNAVAILABLE",
}


class AppError(Exception):
    """Raise this for any expected failure. Everything else is a bug."""

    def __init__(self, code: str, message: str, status: int = 400, details=None):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status
        self.details = details or {}


def error_response(
    code: str, message: str, status: int, details=None, request_id: str | None = None
) -> JSONResponse:
    payload = {"code": code, "message": message, "details": details or {}}
    if request_id:
        payload["details"] = {**payload["details"], "request_id": request_id}
    return JSONResponse(status_code=status, content={"error": payload})


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "") or request.headers.get(
        REQUEST_ID_HEADER, ""
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError):
        return error_response(
            exc.code, exc.message, exc.status, exc.details, _request_id(request)
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):
        # exc.errors() can contain non-JSON-serialisable values (e.g. the raw
        # bytes of an upload); str() the offending input defensively.
        fields = [
            {
                "loc": ".".join(str(p) for p in e.get("loc", ())),
                "msg": e.get("msg", ""),
                "type": e.get("type", ""),
            }
            for e in exc.errors()
        ]
        return error_response(
            "VALIDATION_ERROR",
            "Request body or parameters are invalid",
            422,
            {"fields": fields},
            _request_id(request),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException):
        code = _STATUS_CODES.get(exc.status_code, "HTTP_ERROR")
        return error_response(
            code, str(exc.detail), exc.status_code, None, _request_id(request)
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        rid = _request_id(request) or uuid.uuid4().hex[:12]
        log.exception("unhandled error [request_id=%s] %s %s", rid, request.method, request.url.path)
        # Never leak internals to a buyer or an artisan's phone in production.
        message = (
            f"{type(exc).__name__}: {exc}"
            if settings.is_dev
            else "Something went wrong. Please try again."
        )
        return error_response("INTERNAL_ERROR", message, 500, None, rid)
