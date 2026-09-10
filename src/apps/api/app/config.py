"""
Application settings.

Every value is env-driven. Only the database URL is mandatory -- everything
else has a safe default so the API boots for local work and tests without a
fully populated .env. Missing third-party credentials degrade the relevant
feature (see the per-service fallbacks in the PRD), they do not stop the app.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The .env lives at the repo root, three levels above this file
# (apps/api/app/config.py -> apps/api/app -> apps/api -> apps -> repo root).
# Docker mounts it at /code/.env instead, so both paths are listed.
_ENV_FILES = (
    ".env", ".env.local",
    "../../.env", "../../.env.local",
    "../../../.env", "../../../.env.local",
)

DEFAULT_SECRET = "change-me-32-chars-minimum"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILES, env_file_encoding="utf-8", extra="ignore"
    )

    # ---------- core ----------
    env: str = "dev"
    api_secret_key: str = DEFAULT_SECRET
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 43200  # 30 days -- artisans should not re-login
    # Comma-separated. Ignored in dev, where all origins are allowed.
    cors_origins: str = ""

    # ---------- database ----------
    database_url: str
    # Sync driver for Alembic. Derived from database_url when left blank.
    database_url_sync: str = ""

    # ---------- auth ----------
    otp_length: int = 4
    otp_ttl_seconds: int = 300
    # A 4-digit PIN is only 10,000 combinations, so login MUST be throttled.
    pin_max_attempts: int = 5
    pin_lockout_seconds: int = 900

    # ---------- admin ----------
    # The admin is seeded from config rather than registered: a fixed phone and
    # OTP is what "there is one administrator" means in practice.
    admin_phone: str = ""
    admin_otp: str = ""

    # ---------- storage ----------
    # local | cloudinary | r2
    storage_backend: str = "local"
    local_storage_dir: str = "var/media"
    # Public base for the local backend, e.g. http://192.168.1.40:8000
    local_storage_public_base: str = ""

    # Cloudinary free-plan caps. Enforced server-side so an oversize upload
    # returns our error envelope instead of a provider stack trace.
    max_image_bytes: int = 10 * 1024 * 1024
    max_raw_bytes: int = 10 * 1024 * 1024
    max_video_bytes: int = 100 * 1024 * 1024

    # ---------- storage: cloudinary ----------
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    # ---------- storage (Cloudflare R2) ----------
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = "kalasetu"
    r2_public_base: str = ""

    # ---------- ML service ----------
    ml_service_url: str = "http://localhost:8001"
    ml_service_token: str = ""

    # Hugging Face image-to-3D. The token stays server-side; the mobile app
    # only receives the stored GLB URL.
    #
    # We call a public Gradio Space, not the Serverless Inference API -- the
    # latter needs the paid "Inference Providers" token permission. The Space
    # has to expose stateless endpoints; see app/routers/preview3d.py for why
    # stabilityai/stable-fast-3d does not qualify.
    hf_api_token: str = ""
    hf_3d_space: str = "stabilityai/TripoSR"

    # ---------- LLM ----------
    gemini_api_key: str = ""
    groq_api_key: str = ""
    llm_primary: str = "gemini"
    # gemini-2.0-flash was decommissioned (404 with an upgrade hint).
    # Verified available and JSON-mode capable on 2026-09-03; check
    # /v1beta/models if this 404s.
    llm_model_gemini: str = "gemini-3.6-flash"
    # The PRD names llama-3.3-70b-versatile, which Groq has since
    # decommissioned (404 model_not_found). Verified available and
    # JSON-mode capable on 2026-09-03; check /v1/models if this 404s.
    llm_model_groq: str = "openai/gpt-oss-120b"
    # Speech-to-text. Groq's Whisper stands in for Bhashini, which we cannot
    # get credentials for; it is free, needs no card, and covers the same
    # Indian languages. Local faster-whisper is the fallback (app/services/asr.py).
    stt_model_groq: str = "whisper-large-v3-turbo"

    # ---------- 3D preview (phase 12) ----------
    # Image-to-3D reconstruction via Replicate's hosted API -- no local GPU
    # needed. Blank means the feature degrades soft: services/preview3d.py
    # raises PreviewUnavailable rather than the request hanging or 500ing.
    replicate_api_token: str = ""
    # firtoz/trellis: verified on Replicate, outputs a real GLB (not just OBJ,
    # which most image-to-3D models default to and which model-viewer on the
    # mobile app cannot render without a client-side conversion step).
    replicate_model_3d: str = "firtoz/trellis"

    # ---------- Bhashini ----------
    bhashini_user_id: str = ""
    bhashini_api_key: str = ""
    bhashini_pipeline_id: str = "64392f96daac500b55c543cd"
    bhashini_enabled: bool = True

    # ---------- messaging channels ----------
    wa_phone_number_id: str = ""
    wa_access_token: str = ""
    wa_verify_token: str = "kalasetu-verify"
    wa_app_secret: str = ""
    channel_primary: str = "whatsapp"  # whatsapp|telegram
    telegram_bot_token: str = ""

    # ---------- ONDC ----------
    ondc_subscriber_id: str = ""
    ondc_ukid: str = ""
    ondc_signing_private_key: str = ""
    ondc_encryption_private_key: str = ""
    ondc_gateway_url: str = ""
    ondc_registry_url: str = ""
    ondc_mock: bool = True

    # ---------- feature flags ----------
    feature_3d: bool = True
    feature_ondc: bool = True
    feature_rag: bool = True
    # Forces every fallback path and blocks outbound calls. The demo-day switch.
    offline_demo_mode: bool = False

    # ---------- derived ----------
    @property
    def is_dev(self) -> bool:
        return self.env.lower() in ("dev", "local", "test")

    @property
    def cors_origin_list(self) -> list[str]:
        if self.is_dev:
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def admin_enabled(self) -> bool:
        return bool(self.admin_phone and self.admin_otp)

    @model_validator(mode="after")
    def _derive_and_check(self) -> "Settings":
        # Alembic needs a sync driver; asyncpg cannot run migrations.
        if not self.database_url_sync:
            object.__setattr__(
                self,
                "database_url_sync",
                self.database_url.replace("+asyncpg", "").replace("+psycopg", ""),
            )

        # asyncpg does not accept libpq query parameters like sslmode or channel_binding
        if "+asyncpg" in self.database_url and "?" in self.database_url:
            base, query = self.database_url.split("?", 1)
            params = [
                p for p in query.split("&")
                if not p.startswith(("sslmode=", "channel_binding="))
            ]
            clean_url = f"{base}?{'&'.join(params)}" if params else base
            object.__setattr__(self, "database_url", clean_url)


        # A default signing key in production means anyone can mint a JWT for
        # any artisan. Fail at boot rather than silently shipping it.
        if not self.is_dev:
            if self.api_secret_key == DEFAULT_SECRET:
                raise ValueError(
                    "API_SECRET_KEY is still the placeholder value; set a real "
                    f"secret when ENV={self.env}"
                )
            if len(self.api_secret_key) < 32:
                raise ValueError(
                    "API_SECRET_KEY must be at least 32 characters "
                    f"(got {len(self.api_secret_key)})"
                )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
