# KalaSetu

**AI-Driven Market Linkage and Smart Cataloging for Marginalized Artisans** — Smart India Hackathon 2026.

An artisan speaks in her own language, points her phone at her stock, and KalaSetu produces professional e-commerce listings, prices them fairly, publishes them to ONDC and government marketplaces, answers buyer questions on her behalf, and coaches her on what to make next.

---

## Status

### Implemented Features

- **Foundations:** Schema, migrations, `/health` and ready checks, tenant isolation.
- **Authentication:** Phone + OTP on first use, PIN-based login.
- **Artisan Profiles:** Onboarding and profile management.
- **Media Management:** Photo and audio uploads, with Cloudinary, R2, and local backends.
- **Listings & Cataloging:** Full CRUD for listings, AI-assisted catalog wizard.
- **Pricing:** Smart pricing engine.
- **Voice Assistant:** Multilingual voice interactions.
- **Business Coach:** Training and learning modules for artisans.
- **Sakhi Network:** Directory, map, profiles, and chat for community leaders (Sakhis).
- **3D Preview:** Support for 3D/GLB mockups and previews.
- **Admin Dashboard:** Platform monitoring and management.
- Craft Identification
- Image Studio (Background removal, generation)
- ONDC Publishing
- RAG (Retrieval-Augmented Generation) for semantic search
- Video Processing
- WhatsApp Bot Integration

---

## Architecture

```
Expo app (Android) ──HTTPS+JWT──┐
WhatsApp Cloud API ──webhook────┤
                                ▼
                        FastAPI (Railway)
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
             Neon Postgres  Upstash Redis  Cloudflare R2
             + pgvector     + RQ queue     images/audio/glb
                                ▼
                          RQ worker ──▶ ML service (HF Spaces)
                                        Bhashini · Gemini · ONDC
```

The ML service is a separate process because CLIP + e5 + reranker + rembg need ~3.5 GB of RAM together. Keeping them out of the API means the API deploys in seconds and fits a small instance.

## Layout

```
apps/api/      FastAPI backend + Alembic migrations
apps/ml/       ML service, HF Spaces
apps/mobile/   Expo app
infra/         neon_setup.sql — the schema
ml/            offline training: scripts, notebooks, artifacts
assets/        mockup templates, backdrops, fonts, demo assets
scripts/       seeding, reindexing, mock ONDC gateway
```

---

## Prerequisites

- Docker Desktop
- Python 3.11 (only for running the API or migrations outside Docker)
- Node 20+ and the Expo Go app on an Android phone
- A [Neon](https://neon.tech) project.

## Setup

**1. Environment**

```bash
cp .env.example .env
```

Fill in at minimum `DATABASE_URL`. Everything else has a working default, and
missing third-party credentials degrade that feature rather than breaking boot.

> `DATABASE_URL` must use the `postgresql+asyncpg://` scheme. `DATABASE_URL_SYNC`
> is derived from it automatically and is what Alembic uses.
>
> If you use Neon's **pooled** host, asyncpg's prepared statements break. `app/db.py`
> already sets `statement_cache_size=0` to handle this — don't remove it.

**2. Database**

```bash
make migrate
```

This applies `infra/neon_setup.sql` via `alembic upgrade head`: 10 tables, 5 enums,
two `tsvector` triggers, and HNSW indexes on both `vector(768)` columns. The script
is idempotent, so it is safe to re-run and safe over a partially-created database.

**3. Run**

```bash
make up                       # api on :8000, redis on :6379
curl localhost:8000/health    # liveness
curl localhost:8000/health/ready | jq   # per-dependency status
```

**4. Mobile**

```bash
cd apps/mobile
cp .env.example .env          # set EXPO_PUBLIC_API_URL to your LAN IP, not localhost
npm install
npm start                     # scan the QR with Expo Go
```

The phone and your computer must be on the same Wi-Fi. `localhost` on the phone
means the phone itself, which is why the LAN IP matters.

---

## Auth

Phone + OTP on first use, then phone + PIN. With `ENV=dev` the OTP comes back in the response as `debug_otp`.

```
POST /auth/otp/request  {phone}            -> {sent, debug_otp}
POST /auth/otp/verify   {phone, otp}       -> {access_token, pin_set, artisan_id}
POST /auth/pin/set      {pin}              (bearer token required)
POST /auth/pin/login    {phone, pin}       -> {access_token, ...}
```

`otp/verify` creates the `users` and `artisans` rows on first login, so there
is no separate signup step.

A 4-digit PIN is only 10,000 combinations, so `pin/login` is throttled in
Redis: `PIN_MAX_ATTEMPTS` failures per phone triggers a `PIN_LOCKOUT_SECONDS`
block, and the correct PIN is refused during it too.

**Tenant isolation** runs through `deps.current_artisan`. Every listing and
media endpoint resolves its artisan there and nowhere else, so one artisan can
never reach another's catalogue. A `sakhi` may pass `X-Artisan-Id` to act for
an artisan she manages — the `managed_by` link is checked server-side, never
trusted from the header. Cross-tenant reads return **404, not 403**, so ids
cannot be enumerated.

## Storage

Media goes through one interface (`app/services/storage.py`) with three
backends, chosen by `STORAGE_BACKEND`:

| Backend      | Use                                                          |
| ------------ | ------------------------------------------------------------ |
| `local`      | dev default — writes under `var/media`, needs no credentials |
| `cloudinary` | the project's cloud storage                                  |
| `r2`         | S3-compatible alternative, kept wired                        |

Two Cloudinary details that are easy to get wrong:

- **Audio uploads with `resource_type="video"`, not `"raw"`.** Cloudinary treats
  audio as a degenerate video so it can transcode it. Video processing depends on this.
- **Free-plan caps: 10 MB image, 10 MB raw, 100 MB video.** The API enforces
  these itself and returns `FILE_TOO_LARGE` in the standard envelope, so an
  oversize photo never surfaces as a provider traceback. The app compresses to
  1600px / JPEG q0.7 before uploading, which lands well under.

When using the `local` backend, set `LOCAL_STORAGE_PUBLIC_BASE` to your LAN IP
— the phone cannot resolve `localhost`.

## Health endpoints

`GET /health` is liveness: no dependencies, always 200. This is what a platform
health check should poll — a database blip must not restart the container.

`GET /health/ready` checks the database, Redis, and the ML service, reports
per-check latency, and returns 503 only when the **database** is down. Redis or
the ML service being unavailable reports `degraded`: every AI path in this
project has a deterministic fallback.

```json
{
	"status": "degraded",
	"env": "dev",
	"offline_demo_mode": false,
	"checks": {
		"db": { "status": "ok", "latency_ms": 41.2 },
		"redis": {
			"status": "fail",
			"latency_ms": 2826.1,
			"detail": "ConnectionError"
		},
		"ml": { "status": "fail", "latency_ms": 3219.6, "detail": "ConnectError" }
	}
}
```

Raw exception text appears in `detail` only when `ENV=dev`.

## Error format

Every error — including validation failures and unhandled exceptions — uses one
envelope, which `apps/mobile/src/api/client.ts` parses into an `ApiError`:

```json
{
	"error": {
		"code": "FACT_MISSING",
		"message": "...",
		"details": { "request_id": "a1b2c3" }
	}
}
```

Every response carries an `X-Request-ID` header, echoed if you supply one, and
it appears in both the log line and the error body.

## Tests

```bash
make test
```

The suite targets what actually breaks rather than coverage:
the health contract and error envelope, the auth flow and its lockout, the
storage caps and resource-type mapping, and — most importantly — tenant
isolation, including the Sakhi path.

The suite is hermetic apart from the database: Redis is faked in-process, and
every test runs inside a transaction that is rolled back, so it can point at
a real Neon branch without leaving rows behind.

---

## Notes

- **Neon cold starts.** The free tier suspends idle compute; the first query can
  take ~8 s. Warm it before a demo (`/health/ready` five minutes ahead).
- **Local dev outside Docker** needs a reachable `REDIS_URL`. The compose stack
  supplies `redis://redis:6379`, which only resolves inside the network.
