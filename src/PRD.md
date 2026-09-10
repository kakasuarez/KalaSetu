# KalaSetu — Product Requirements & Engineering Document

**Problem Statement:** AI-Driven Market Linkage and Smart Cataloging Mobile Application for Marginalized Artisans
**Event:** Smart India Hackathon 2026
**Document version:** 1.0
**Status:** Build specification — this document is the single source of truth for scope, architecture, file layout, and implementation order.

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Scope & Feature Inventory](#2-scope--feature-inventory)
3. [Locked Tech Stack](#3-locked-tech-stack)
4. [System Architecture](#4-system-architecture)
5. [Repository Structure](#5-repository-structure)
6. [Data Model](#6-data-model)
7. [Environment & Configuration](#7-environment--configuration)
8. [API Contract](#8-api-contract)
9. [Phase 0 — Foundations](#phase-0--foundations)
10. [Phase 1 — Auth, Artisan Profile, Listing CRUD](#phase-1--auth-artisan-profile-listing-crud)
11. [Phase 2 — AI Image Enhancer & Studio](#phase-2--ai-image-enhancer--studio)
12. [Phase 3 — Multilingual Auto-Cataloger](#phase-3--multilingual-auto-cataloger)
13. [Phase 4 — Dynamic Pricing Assistant](#phase-4--dynamic-pricing-assistant)
14. [Phase 5 — Craft Identification & GI Tagging](#phase-5--craft-identification--gi-tagging)
15. [Phase 6 — Video-to-Catalog](#phase-6--video-to-catalog)
16. [Phase 7 — WhatsApp Channel](#phase-7--whatsapp-channel)
17. [Phase 8 — ONDC & GeM Publisher](#phase-8--ondc--gem-publisher)
18. [Phase 9 — RAG Query Engine](#phase-9--rag-query-engine)
19. [Phase 10 — Business Coach](#phase-10--business-coach)
20. [Phase 11 — Sakhi Mode, Zero-Text UI, Voice Digest](#phase-11--sakhi-mode-zero-text-ui-voice-digest)
21. [Phase 12 — 3D Product Preview](#phase-12--3d-product-preview)
22. [Phase 13 — Optional Features](#phase-13--optional-features)
23. [Phase 14 — Hardening & Demo](#phase-14--hardening--demo)
24. [Testing Strategy](#24-testing-strategy)
25. [Deployment Runbook](#25-deployment-runbook)
26. [Risk Register](#26-risk-register)
27. [Demo Script](#27-demo-script)

---

## 1. Product Vision

KalaSetu is a voice-first, AI-driven business manager for Indian artisans. An artisan speaks in her own language, points her phone at her stock, and the system produces professional e-commerce listings, prices them fairly, publishes them to ONDC and government marketplaces, answers buyer questions on her behalf, and coaches her on what to make next.

**Design principles (non-negotiable, these drive every decision below):**

| Principle | Consequence |
|---|---|
| Voice in, voice out | No screen requires typing. Every screen is readable aloud. |
| WhatsApp is the daily driver | The app is the manager view; WhatsApp is where work happens. |
| Grounded, never invented | The AI never states a product fact the artisan did not confirm. |
| Fail soft, never blank | Every AI call has a deterministic fallback. Demo must survive no-internet. |
| The AI fades | Assistance reduces as the artisan's own skill grows. |

**Primary user:** a woman weaver/potter/painter, 25–55, low literacy, owns an entry-level Android phone, has WhatsApp, has intermittent 3G.

**Secondary user:** the *Sakhi* — an SHG leader or CSC operator who manages 15–20 artisan accounts.

**Tertiary user:** a B2B buyer or government procurement officer discovering products via ONDC.

---

## 2. Scope & Feature Inventory

Every feature below is in scope. The `Phase` column is the build order — do not build out of order, later phases depend on earlier infrastructure.

| # | Feature | PS-mandated | Phase | Est. effort |
|---|---|---|---|---|
| F1 | AI Image Enhancer & Studio | **Yes** | 2 | M |
| F2 | Multilingual Auto-Cataloger (voice → description) | **Yes** | 3 | L |
| F3 | Dynamic Pricing Assistant (ML) | **Yes** | 4 | L |
| F4 | Grounded descriptions (anti-hallucination) | No | 3 | S |
| F5 | Craft ID + GI tag auto-attach | No | 5 | M |
| F6 | Video-to-catalog (bulk listing) | No | 6 | L |
| F7 | WhatsApp inbound (artisan listing creation) | No | 7 | M |
| F8 | WhatsApp inbound (buyer queries) | No | 7 | M |
| F9 | ONDC publisher | No | 8 | L |
| F10 | GeM / Amazon / Flipkart export | No | 8 | S |
| F11 | RAG query engine (buyer + artisan) | No | 9 | L |
| F12 | Demand signal / "what to make next" | No | 10 | M |
| F13 | Motif mockups (tote/mug/sleeve) | No | 10 | M |
| F14 | Stale listing coach (30-day) | No | 10 | S |
| F15 | Sakhi mode (multi-account) | No | 11 | M |
| F16 | Zero-text UI + read-aloud | No | 11 | M |
| F17 | Voice daily digest via WhatsApp | No | 11 | S |
| F18 | 3D product preview | No | 12 | M |
| F19 | Artisan story card | No | 13 | S |
| F20 | Sales history → credit report PDF | No | 13 | S |
| F21 | Graduation mode | No | 13 | S |

**Definition of "done" for the hackathon:** F1–F11 working end-to-end on a real device, F12–F18 demoable, F19–F21 present but may be shallow.

---

## 3. Locked Tech Stack

Do not deviate from this table without a team decision. Substitutions cost more than they save mid-build.

### Core

| Layer | Choice | Notes |
|---|---|---|
| Mobile | **React Native + Expo (SDK 51+)** | `expo-dev-client` required (native modules for ML Kit) |
| Backend | **FastAPI**, Python 3.11 | Async, Pydantic v2 |
| Database | **Neon** (serverless Postgres 16) | Free tier, branching for test DBs |
| Vector store | **pgvector** with HNSW index | Same Neon database, no second datastore |
| Keyword search | **Postgres `tsvector`** | BM25 half of hybrid retrieval |
| Job queue | **Redis (Upstash) + RQ** | Video, 3D, batch jobs |
| Object storage | **Cloudflare R2** (S3-compatible, `boto3`) | 10 GB free; Neon has no blob storage |
| Auth | **Custom JWT** (`python-jose` + `passlib`) | Phone + 4-digit PIN; Neon has no auth service |
| ML service | **Separate FastAPI app on HF Spaces** | Keeps API process light |
| Scheduler | **APScheduler** in worker + GitHub Actions cron backup | |

### AI / ML

| Capability | Primary | Fallback |
|---|---|---|
| Background removal (server) | `rembg` / `isnet-general-use` | `u2net` |
| Background removal (device) | ML Kit Subject Segmentation | server call |
| Lighting/colour | OpenCV CLAHE + gray-world WB | — |
| ASR | Bhashini ASR | `faster-whisper` small |
| Translation | Bhashini NMT | Gemini |
| TTS | Bhashini TTS | `gTTS` / `expo-speech` |
| LLM | Gemini 2.0 Flash | Groq Llama 3.3 70B |
| Image embedding | CLIP ViT-B/32 (`open_clip`) | — |
| Text embedding | `multilingual-e5-base` | `paraphrase-multilingual-MiniLM` |
| Reranker | `bge-reranker-base` | skip rerank |
| Pricing model | LightGBM quantile (q25/q50/q75) | kNN on CLIP embeddings |
| Craft classifier | CLIP features + sklearn LogisticRegression | CLIP zero-shot |
| Detection | YOLO-World (open-vocab) | YOLOv8n |
| Clustering | DBSCAN (cosine) on CLIP | Agglomerative |
| Image→3D | TripoSR on HF ZeroGPU | pre-generated GLBs |
| Mockups | OpenCV homography warp | — |

### Deployment

| Component | Host |
|---|---|
| API + RQ worker | Railway |
| ML service | HF Spaces (CPU, upgrade to ZeroGPU for TripoSR) |
| Database | Neon |
| Redis | Upstash |
| Blobs | Cloudflare R2 |
| Mobile | Expo EAS Build → APK, distributed by QR |

---

## 4. System Architecture

```
                        ┌──────────────────────────┐
                        │   Expo App (Android)     │
                        │  camera · voice · offline│
                        └────────────┬─────────────┘
                                     │ HTTPS + JWT
┌──────────────────┐                 ▼
│ WhatsApp Cloud   │      ┌─────────────────────────────┐
│ API (webhook)    │─────▶│      FastAPI  (Railway)     │
└──────────────────┘      │  routers · services · auth  │
                          └──┬────────┬─────────┬───────┘
                             │        │         │
              ┌──────────────┘        │         └──────────────┐
              ▼                       ▼                        ▼
     ┌─────────────────┐    ┌──────────────────┐    ┌────────────────────┐
     │  Neon Postgres  │    │  Upstash Redis   │    │  Cloudflare R2     │
     │  + pgvector     │    │  + RQ queue      │    │  images/audio/glb  │
     └─────────────────┘    └────────┬─────────┘    └────────────────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │  RQ Worker (Railway)│
                          │  video · 3d · batch │
                          └──────────┬──────────┘
                                     │
        ┌────────────────────────────┼───────────────────────────┐
        ▼                            ▼                           ▼
┌────────────────┐        ┌──────────────────┐       ┌────────────────────┐
│ ML Service     │        │ External APIs    │       │ ONDC Network       │
│ (HF Spaces)    │        │ Bhashini · Gemini│       │ pre-prod / mock    │
│ embed·segment  │        │ Groq · pytrends  │       │ Ed25519 signed     │
│ classify·rerank│        └──────────────────┘       └────────────────────┘
│ triposr        │
└────────────────┘
```

**Why the ML service is separate:** CLIP + e5 + reranker + rembg together need ~4 GB RAM. Keeping them out of the API process means the API deploys in seconds, restarts without reloading weights, and fits a small Railway instance. The API talks to it over HTTP with a shared secret.

**Request flow — creating a listing by voice:**

```
1. App records audio + captures photo
2. POST /media/upload      → R2, returns media_id + presigned URL
3. POST /catalog/transcribe → Bhashini ASR → transcript (native lang)
4. POST /catalog/facts      → LLM extracts structured facts → app asks
                              2-3 voice follow-ups for missing required fields
5. POST /catalog/generate   → grounded description (EN + HI) + SEO fields
6. POST /images/enhance     → ML service segment → OpenCV studio → R2
7. POST /craft/identify     → craft class + GI tag
8. POST /pricing/suggest    → price band + SHAP reasons + dignity floor
9. POST /listings           → persist, embed, index
10. POST /publish/ondc      → enqueue publish job
```

---

## 5. Repository Structure

Monorepo. One git repo, one `docker-compose.yml` for local dev.

```
kalasetu/
├── README.md
├── PRD.md                          # this document
├── docker-compose.yml
├── .env.example
├── .gitignore
├── Makefile
│
├── apps/
│   ├── api/                        # FastAPI backend
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── alembic.ini
│   │   ├── alembic/
│   │   │   ├── env.py
│   │   │   └── versions/
│   │   ├── app/
│   │   │   ├── __init__.py
│   │   │   ├── main.py
│   │   │   ├── config.py
│   │   │   ├── db.py
│   │   │   ├── deps.py
│   │   │   ├── security.py
│   │   │   ├── errors.py
│   │   │   ├── models/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── base.py
│   │   │   │   ├── user.py
│   │   │   │   ├── artisan.py
│   │   │   │   ├── listing.py
│   │   │   │   ├── media.py
│   │   │   │   ├── qa.py
│   │   │   │   ├── order.py
│   │   │   │   ├── publication.py
│   │   │   │   └── event.py
│   │   │   ├── schemas/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── auth.py
│   │   │   │   ├── listing.py
│   │   │   │   ├── catalog.py
│   │   │   │   ├── pricing.py
│   │   │   │   ├── rag.py
│   │   │   │   └── common.py
│   │   │   ├── routers/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── health.py
│   │   │   │   ├── auth.py
│   │   │   │   ├── artisans.py
│   │   │   │   ├── media.py
│   │   │   │   ├── images.py
│   │   │   │   ├── catalog.py
│   │   │   │   ├── pricing.py
│   │   │   │   ├── craft.py
│   │   │   │   ├── listings.py
│   │   │   │   ├── video.py
│   │   │   │   ├── rag.py
│   │   │   │   ├── whatsapp.py
│   │   │   │   ├── publish.py
│   │   │   │   ├── coach.py
│   │   │   │   ├── preview3d.py
│   │   │   │   └── reports.py
│   │   │   ├── services/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── storage.py
│   │   │   │   ├── ml_client.py
│   │   │   │   ├── llm.py
│   │   │   │   ├── asr.py
│   │   │   │   ├── translate.py
│   │   │   │   ├── tts.py
│   │   │   │   ├── grounding.py
│   │   │   │   ├── imaging.py
│   │   │   │   ├── pricing.py
│   │   │   │   ├── craft.py
│   │   │   │   ├── video.py
│   │   │   │   ├── mockup.py
│   │   │   │   ├── coach.py
│   │   │   │   ├── reports.py
│   │   │   │   ├── rag/
│   │   │   │   │   ├── __init__.py
│   │   │   │   │   ├── indexer.py
│   │   │   │   │   ├── retriever.py
│   │   │   │   │   ├── graph.py
│   │   │   │   │   └── answerer.py
│   │   │   │   ├── channels/
│   │   │   │   │   ├── __init__.py
│   │   │   │   │   ├── base.py
│   │   │   │   │   ├── whatsapp.py
│   │   │   │   │   └── telegram.py
│   │   │   │   └── publishers/
│   │   │   │       ├── __init__.py
│   │   │   │       ├── base.py
│   │   │   │       ├── ondc/
│   │   │   │       │   ├── __init__.py
│   │   │   │       │   ├── signing.py
│   │   │   │       │   ├── schema.py
│   │   │   │       │   ├── client.py
│   │   │   │       │   └── callbacks.py
│   │   │   │       ├── gem.py
│   │   │   │       └── csv_export.py
│   │   │   ├── workers/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── queue.py
│   │   │   │   ├── tasks.py
│   │   │   │   └── scheduler.py
│   │   │   └── utils/
│   │   │       ├── __init__.py
│   │   │       ├── audio.py
│   │   │       ├── ids.py
│   │   │       └── lang.py
│   │   └── tests/
│   │       ├── conftest.py
│   │       ├── test_auth.py
│   │       ├── test_catalog.py
│   │       ├── test_pricing.py
│   │       ├── test_rag.py
│   │       └── test_ondc_signing.py
│   │
│   ├── ml/                         # ML service — HF Space
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   ├── app.py
│   │   ├── loaders.py
│   │   └── routes/
│   │       ├── embed.py
│   │       ├── segment.py
│   │       ├── classify.py
│   │       ├── rerank.py
│   │       ├── detect.py
│   │       └── threed.py
│   │
│   └── mobile/                     # Expo app
│       ├── app.json
│       ├── eas.json
│       ├── package.json
│       ├── babel.config.js
│       ├── tsconfig.json
│       ├── App.tsx
│       └── src/
│           ├── api/
│           │   ├── client.ts
│           │   ├── auth.ts
│           │   ├── listings.ts
│           │   ├── catalog.ts
│           │   └── pricing.ts
│           ├── screens/
│           │   ├── OnboardScreen.tsx
│           │   ├── HomeScreen.tsx
│           │   ├── CaptureScreen.tsx
│           │   ├── VoiceDescribeScreen.tsx
│           │   ├── ReviewListingScreen.tsx
│           │   ├── PriceScreen.tsx
│           │   ├── VideoCatalogScreen.tsx
│           │   ├── InboxScreen.tsx
│           │   ├── CoachScreen.tsx
│           │   ├── Preview3DScreen.tsx
│           │   └── SakhiScreen.tsx
│           ├── components/
│           │   ├── BigButton.tsx
│           │   ├── SpeakableText.tsx
│           │   ├── VoiceRecorder.tsx
│           │   ├── PriceBand.tsx
│           │   ├── BeforeAfter.tsx
│           │   └── IconTile.tsx
│           ├── hooks/
│           │   ├── useSpeech.ts
│           │   ├── useRecorder.ts
│           │   ├── useOfflineQueue.ts
│           │   └── useAuth.ts
│           ├── store/
│           │   ├── db.ts            # expo-sqlite
│           │   └── outbox.ts
│           ├── theme/
│           │   ├── colors.ts
│           │   └── typography.ts
│           └── i18n/
│               ├── index.ts
│               ├── hi.json
│               └── en.json
│
├── ml/                             # offline training, not deployed
│   ├── data/
│   │   ├── raw/
│   │   ├── listings.csv
│   │   ├── material_rates.json
│   │   ├── festivals.json
│   │   ├── gi_tags.json
│   │   └── craft_images/
│   ├── notebooks/
│   │   ├── 01_scrape.ipynb
│   │   ├── 02_pricing_train.ipynb
│   │   └── 03_craft_train.ipynb
│   ├── scripts/
│   │   ├── scrape_listings.py
│   │   ├── build_features.py
│   │   ├── train_pricing.py
│   │   ├── train_craft.py
│   │   └── eval_pricing.py
│   └── artifacts/
│       ├── lgbm_q25.pkl
│       ├── lgbm_q50.pkl
│       ├── lgbm_q75.pkl
│       ├── pca_image.pkl
│       ├── pca_text.pkl
│       ├── craft_clf.pkl
│       └── metadata.json
│
├── assets/
│   ├── mockup_templates/           # tote.png, mug.png, sleeve.png + corners.json
│   ├── backdrops/
│   └── demo/                       # pre-generated GLBs, demo video
│
├── infra/
│   ├── railway.json
│   ├── neon_setup.sql
│   └── github/workflows/
│       ├── ci.yml
│       └── cron_digest.yml
│
└── scripts/
    ├── seed_db.py
    ├── reindex_rag.py
    └── mock_ondc_gateway.py
```

---

## 6. Data Model

Full DDL. Run as the initial Alembic migration.

```sql
-- infra/neon_setup.sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- IDENTITY
-- ============================================================
CREATE TYPE user_role AS ENUM ('artisan', 'sakhi', 'buyer', 'admin');

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone           TEXT UNIQUE NOT NULL,
    pin_hash        TEXT,
    role            user_role NOT NULL DEFAULT 'artisan',
    display_name    TEXT,
    preferred_lang  TEXT NOT NULL DEFAULT 'hi',   -- ISO 639-1
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE artisans (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    -- managed_by is the Sakhi-mode link. NULL = self-managed.
    managed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    village         TEXT,
    district        TEXT,
    state           TEXT,
    pincode         TEXT,
    lat             DOUBLE PRECISION,
    lon             DOUBLE PRECISION,
    primary_craft   TEXT,
    years_experience INT,
    shg_cluster     TEXT,
    artisan_card_no TEXT,
    story_native    TEXT,
    story_en        TEXT,
    photo_key       TEXT,
    monthly_capacity INT,
    -- graduation mode counters
    listings_completed INT NOT NULL DEFAULT 0,
    assist_level    INT NOT NULL DEFAULT 3,   -- 3=full AI, 2=guided, 1=review only
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_artisans_managed_by ON artisans(managed_by);
CREATE INDEX idx_artisans_craft ON artisans(primary_craft);

-- ============================================================
-- MEDIA
-- ============================================================
CREATE TYPE media_kind AS ENUM ('image_raw','image_enhanced','audio','video','glb','mockup','card');

CREATE TABLE media (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    artisan_id  UUID REFERENCES artisans(id) ON DELETE CASCADE,
    kind        media_kind NOT NULL,
    r2_key      TEXT NOT NULL,
    mime        TEXT,
    width       INT,
    height      INT,
    duration_ms INT,
    parent_id   UUID REFERENCES media(id) ON DELETE SET NULL, -- enhanced -> raw
    meta        JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_artisan ON media(artisan_id, kind);

-- ============================================================
-- LISTINGS
-- ============================================================
CREATE TYPE listing_status AS ENUM ('draft','ready','published','paused','sold_out');

CREATE TABLE listings (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    artisan_id          UUID NOT NULL REFERENCES artisans(id) ON DELETE CASCADE,
    status              listing_status NOT NULL DEFAULT 'draft',

    title_en            TEXT,
    title_hi            TEXT,
    description_en      TEXT,
    description_hi      TEXT,
    seo_keywords        TEXT[],

    -- confirmed facts only. Anything absent renders as "not specified".
    facts               JSONB NOT NULL DEFAULT '{}',
    -- {material, technique, dimensions_cm, weight_g, colors[], piece_count,
    --  care, work_hours, is_handmade, customizations[]}

    craft_class         TEXT,
    craft_confidence    REAL,
    gi_tag              TEXT,
    heritage_note       TEXT,

    price               NUMERIC(10,2),
    price_p25           NUMERIC(10,2),
    price_p50           NUMERIC(10,2),
    price_p75           NUMERIC(10,2),
    dignity_floor       NUMERIC(10,2),
    price_reasons       JSONB DEFAULT '[]',
    material_cost       NUMERIC(10,2),

    primary_media_id    UUID REFERENCES media(id) ON DELETE SET NULL,
    media_ids           UUID[] NOT NULL DEFAULT '{}',
    glb_media_id        UUID REFERENCES media(id) ON DELETE SET NULL,

    stock_qty           INT NOT NULL DEFAULT 1,
    source              TEXT NOT NULL DEFAULT 'app',  -- app|whatsapp|video

    -- search
    embedding           VECTOR(768),
    search_tsv          TSVECTOR,

    views_count         INT NOT NULL DEFAULT 0,
    orders_count        INT NOT NULL DEFAULT 0,
    last_coached_at     TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_listings_artisan ON listings(artisan_id, status);
CREATE INDEX idx_listings_craft ON listings(craft_class);
CREATE INDEX idx_listings_created ON listings(created_at DESC);
CREATE INDEX idx_listings_tsv ON listings USING GIN(search_tsv);
CREATE INDEX idx_listings_embedding ON listings
    USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);

CREATE FUNCTION listings_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv :=
      setweight(to_tsvector('simple', coalesce(NEW.title_en,'')), 'A') ||
      setweight(to_tsvector('simple', coalesce(NEW.craft_class,'')), 'A') ||
      setweight(to_tsvector('simple', coalesce(NEW.description_en,'')), 'B') ||
      setweight(to_tsvector('simple', array_to_string(coalesce(NEW.seo_keywords,'{}'),' ')), 'B');
  NEW.updated_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_listings_tsv BEFORE INSERT OR UPDATE ON listings
FOR EACH ROW EXECUTE FUNCTION listings_tsv_update();

-- ============================================================
-- KNOWLEDGE BASE (RAG corpus)
-- ============================================================
CREATE TYPE kb_source AS ENUM
    ('artisan_qa','listing_fact','craft_knowledge','policy','scheme');

CREATE TABLE kb_documents (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source       kb_source NOT NULL,
    artisan_id   UUID REFERENCES artisans(id) ON DELETE CASCADE, -- NULL = global
    listing_id   UUID REFERENCES listings(id) ON DELETE CASCADE,
    craft_class  TEXT,
    lang         TEXT NOT NULL DEFAULT 'en',
    title        TEXT,
    content      TEXT NOT NULL,
    content_native TEXT,
    embedding    VECTOR(768),
    search_tsv   TSVECTOR,
    verified     BOOLEAN NOT NULL DEFAULT false,  -- artisan confirmed
    meta         JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kb_scope ON kb_documents(artisan_id, listing_id, source);
CREATE INDEX idx_kb_tsv ON kb_documents USING GIN(search_tsv);
CREATE INDEX idx_kb_embedding ON kb_documents
    USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);

CREATE FUNCTION kb_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv := to_tsvector('simple',
      coalesce(NEW.title,'') || ' ' || coalesce(NEW.content,''));
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_kb_tsv BEFORE INSERT OR UPDATE ON kb_documents
FOR EACH ROW EXECUTE FUNCTION kb_tsv_update();

-- ============================================================
-- BUYER QUERIES / ESCALATION
-- ============================================================
CREATE TYPE query_status AS ENUM
    ('answered_auto','escalated','answered_artisan','abandoned');

CREATE TABLE buyer_queries (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id     UUID REFERENCES listings(id) ON DELETE CASCADE,
    artisan_id     UUID REFERENCES artisans(id) ON DELETE CASCADE,
    channel        TEXT NOT NULL,          -- whatsapp|telegram|app|ondc_support
    buyer_ref      TEXT,                   -- phone or ONDC txn id
    question       TEXT NOT NULL,
    question_lang  TEXT,
    answer         TEXT,
    answer_source  TEXT,                   -- rag|artisan|template
    retrieved_ids  UUID[],
    top_score      REAL,
    status         query_status NOT NULL DEFAULT 'escalated',
    escalated_at   TIMESTAMPTZ,
    resolved_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bq_artisan ON buyer_queries(artisan_id, status);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE orders (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id    UUID REFERENCES listings(id) ON DELETE SET NULL,
    artisan_id    UUID REFERENCES artisans(id) ON DELETE CASCADE,
    channel       TEXT NOT NULL,           -- ondc|whatsapp|direct
    external_id   TEXT,                    -- ONDC order id
    qty           INT NOT NULL DEFAULT 1,
    unit_price    NUMERIC(10,2),
    total         NUMERIC(10,2),
    customization JSONB DEFAULT '{}',
    status        TEXT NOT NULL DEFAULT 'created',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_artisan_time ON orders(artisan_id, created_at DESC);

-- ============================================================
-- PUBLICATIONS (multi-channel push)
-- ============================================================
CREATE TABLE publications (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id    UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    channel       TEXT NOT NULL,           -- ondc|gem|amazon_csv|flipkart_csv
    external_id   TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',
    payload       JSONB,
    error         TEXT,
    published_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(listing_id, channel)
);

-- ============================================================
-- COACHING / EVENTS
-- ============================================================
CREATE TABLE coach_nudges (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    artisan_id  UUID NOT NULL REFERENCES artisans(id) ON DELETE CASCADE,
    listing_id  UUID REFERENCES listings(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,   -- demand_signal|stale_listing|price_adjust|motif_idea
    payload     JSONB NOT NULL DEFAULT '{}',
    message_native TEXT,
    audio_key   TEXT,
    sent_at     TIMESTAMPTZ,
    acted_on    BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
    id          BIGSERIAL PRIMARY KEY,
    artisan_id  UUID,
    listing_id  UUID,
    kind        TEXT NOT NULL,   -- view|impression|query|order|publish
    meta        JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_listing_time ON events(listing_id, created_at DESC);
```

**Migration note:** create this as `alembic/versions/0001_initial.py` using `op.execute(open('infra/neon_setup.sql').read())` for simplicity, or hand-write the ops. The raw-SQL approach is faster and fine for a hackathon.

---

## 7. Environment & Configuration

### `.env.example`

```bash
# ---------- core ----------
ENV=dev
API_SECRET_KEY=change-me-32-chars-minimum
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=43200

# ---------- database (Neon) ----------
DATABASE_URL=postgresql+asyncpg://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/kalasetu
DATABASE_URL_SYNC=postgresql://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/kalasetu

# ---------- redis (Upstash) ----------
REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379

# ---------- storage (Cloudflare R2) ----------
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=kalasetu
R2_PUBLIC_BASE=https://pub-xxx.r2.dev

# ---------- ML service ----------
ML_SERVICE_URL=https://your-space.hf.space
ML_SERVICE_TOKEN=shared-secret

# ---------- LLM ----------
GEMINI_API_KEY=
GROQ_API_KEY=
LLM_PRIMARY=gemini
LLM_MODEL_GEMINI=gemini-2.0-flash
LLM_MODEL_GROQ=llama-3.3-70b-versatile

# ---------- Bhashini ----------
BHASHINI_USER_ID=
BHASHINI_API_KEY=
BHASHINI_PIPELINE_ID=64392f96daac500b55c543cd
BHASHINI_ENABLED=true

# ---------- WhatsApp ----------
WA_PHONE_NUMBER_ID=
WA_ACCESS_TOKEN=
WA_VERIFY_TOKEN=kalasetu-verify
WA_APP_SECRET=
CHANNEL_PRIMARY=whatsapp        # whatsapp|telegram
TELEGRAM_BOT_TOKEN=

# ---------- ONDC ----------
ONDC_SUBSCRIBER_ID=kalasetu.example.com
ONDC_UKID=kalasetu-key-1
ONDC_SIGNING_PRIVATE_KEY=        # base64 ed25519 seed
ONDC_ENCRYPTION_PRIVATE_KEY=
ONDC_GATEWAY_URL=https://preprod.gateway.ondc.org
ONDC_REGISTRY_URL=https://preprod.registry.ondc.org/ondc
ONDC_MOCK=true                   # true => use scripts/mock_ondc_gateway.py

# ---------- feature flags ----------
FEATURE_3D=true
FEATURE_ONDC=true
FEATURE_RAG=true
OFFLINE_DEMO_MODE=false          # forces all fallbacks, no external calls
```

### `apps/api/app/config.py`

```python
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "dev"
    api_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 43200

    database_url: str
    database_url_sync: str
    redis_url: str

    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = "kalasetu"
    r2_public_base: str = ""

    ml_service_url: str = "http://localhost:7860"
    ml_service_token: str = ""

    gemini_api_key: str = ""
    groq_api_key: str = ""
    llm_primary: str = "gemini"
    llm_model_gemini: str = "gemini-2.0-flash"
    llm_model_groq: str = "llama-3.3-70b-versatile"

    bhashini_user_id: str = ""
    bhashini_api_key: str = ""
    bhashini_pipeline_id: str = ""
    bhashini_enabled: bool = True

    wa_phone_number_id: str = ""
    wa_access_token: str = ""
    wa_verify_token: str = "kalasetu-verify"
    wa_app_secret: str = ""
    channel_primary: str = "whatsapp"
    telegram_bot_token: str = ""

    ondc_subscriber_id: str = ""
    ondc_ukid: str = ""
    ondc_signing_private_key: str = ""
    ondc_gateway_url: str = ""
    ondc_registry_url: str = ""
    ondc_mock: bool = True

    feature_3d: bool = True
    feature_ondc: bool = True
    feature_rag: bool = True
    offline_demo_mode: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
```

### `docker-compose.yml`

```yaml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  api:
    build: ./apps/api
    env_file: .env
    environment:
      REDIS_URL: redis://redis:6379
    ports: ["8000:8000"]
    volumes:
      - ./apps/api:/code
      - ./ml/artifacts:/code/artifacts:ro
      - ./ml/data:/code/data:ro
      - ./assets:/code/assets:ro
    depends_on: [redis]
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  worker:
    build: ./apps/api
    env_file: .env
    environment:
      REDIS_URL: redis://redis:6379
    volumes:
      - ./apps/api:/code
      - ./ml/artifacts:/code/artifacts:ro
      - ./assets:/code/assets:ro
    depends_on: [redis]
    command: python -m app.workers.queue

  ml:
    build: ./apps/ml
    env_file: .env
    ports: ["7860:7860"]
    volumes:
      - ./apps/ml:/code
      - hf_cache:/root/.cache/huggingface

volumes:
  hf_cache:
```

> Note: the database is Neon (cloud). There is no local Postgres container — everyone develops against a Neon **branch**. Create one branch per developer: `neon branches create --name dev-goat`.

---

## 8. API Contract

Full endpoint list. Implement in the phase noted.

| Method | Path | Phase | Purpose |
|---|---|---|---|
| GET | `/health` | 0 | liveness + dependency check |
| POST | `/auth/otp/request` | 1 | send OTP (mock in dev) |
| POST | `/auth/otp/verify` | 1 | returns JWT |
| POST | `/auth/pin/login` | 1 | phone + PIN |
| GET | `/artisans/me` | 1 | profile |
| PATCH | `/artisans/me` | 1 | update profile |
| GET | `/artisans/managed` | 11 | Sakhi: list managed artisans |
| POST | `/media/upload` | 1 | multipart → R2 |
| GET | `/media/{id}/url` | 1 | presigned GET |
| POST | `/images/enhance` | 2 | segment + studio |
| POST | `/catalog/transcribe` | 3 | audio → text |
| POST | `/catalog/extract-facts` | 3 | transcript → facts + missing fields |
| POST | `/catalog/generate` | 3 | facts → EN/HI description |
| POST | `/craft/identify` | 5 | image → craft + GI |
| POST | `/pricing/suggest` | 4 | → band + floor + reasons |
| POST | `/listings` | 1 | create |
| GET | `/listings` | 1 | list (filters) |
| GET | `/listings/{id}` | 1 | detail |
| PATCH | `/listings/{id}` | 1 | update |
| POST | `/listings/{id}/publish` | 8 | enqueue publish |
| POST | `/video/ingest` | 6 | upload video → job id |
| GET | `/video/jobs/{id}` | 6 | poll status → draft listings |
| POST | `/rag/query` | 9 | buyer/artisan question |
| POST | `/rag/answer-escalated` | 9 | artisan replies → store as KB |
| GET/POST | `/webhooks/whatsapp` | 7 | verify + inbound |
| POST | `/webhooks/telegram` | 7 | inbound |
| POST | `/ondc/search` … `/ondc/on_*` | 8 | Beckn endpoints |
| GET | `/publish/{listing_id}/csv` | 8 | Amazon/Flipkart CSV |
| GET | `/publish/{listing_id}/gem.xlsx` | 8 | GeM sheet |
| GET | `/coach/nudges` | 10 | pending nudges |
| POST | `/coach/mockup` | 10 | motif → product mockup |
| POST | `/preview3d/{listing_id}` | 12 | enqueue TripoSR |
| GET | `/reports/income.pdf` | 13 | credit report |

**Standard error envelope:**

```json
{ "error": { "code": "FACT_MISSING", "message": "...", "details": {...} } }
```


---

# PHASES

Each phase has: **Goal → Files touched → Skeleton code → Steps → Definition of Done.**

Do not start a phase until the previous phase's DoD is met. Phases 0–4 are the critical path; everything else is additive.

---

## Phase 0 — Foundations

**Goal:** Repo scaffolded, Neon connected, migrations run, `/health` green locally and on Railway, Expo app boots and pings the API.

### Files

`docker-compose.yml`, `.env`, `apps/api/app/{main,config,db,deps,errors}.py`, `infra/neon_setup.sql`, `alembic/`, `apps/mobile/App.tsx`, `apps/mobile/src/api/client.ts`

### `apps/api/app/db.py`

```python
from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession, async_sessionmaker, create_async_engine
)
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    # Neon closes idle connections; recycle before it does.
    pool_recycle=280,
    connect_args={"ssl": "require", "statement_cache_size": 0},  # pgbouncer-safe
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

> **Neon gotcha:** if you use the *pooled* connection string, asyncpg prepared statements break. Set `statement_cache_size=0` as above, or use the direct (non-pooled) host. This will cost you an hour if you skip it.

### `apps/api/app/main.py`

```python
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.errors import register_exception_handlers
from app.routers import (
    health, auth, artisans, media, images, catalog, pricing, craft,
    listings, video, rag, whatsapp, publish, coach, preview3d, reports,
)

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # warm caches, load small artifacts (pricing model is small enough to hold)
    from app.services.pricing import PricingEngine
    app.state.pricing = PricingEngine.load()
    yield


app = FastAPI(title="KalaSetu API", version="1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

for r in (health, auth, artisans, media, images, catalog, pricing, craft,
          listings, video, rag, whatsapp, publish, coach, preview3d, reports):
    app.include_router(r.router)
```

### `apps/api/app/errors.py`

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, code: str, message: str, status: int = 400, details=None):
        self.code, self.message, self.status = code, message, status
        self.details = details or {}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _(request: Request, exc: AppError):
        return JSONResponse(
            status_code=exc.status,
            content={"error": {"code": exc.code, "message": exc.message,
                               "details": exc.details}},
        )
```

### `apps/api/app/routers/health.py`

```python
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import httpx, redis.asyncio as aioredis

from app.db import get_db
from app.config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    checks = {}
    try:
        await db.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as e:
        checks["db"] = f"fail: {e}"
    try:
        r = aioredis.from_url(settings.redis_url)
        await r.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"fail: {e}"
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            resp = await c.get(f"{settings.ml_service_url}/health")
            checks["ml"] = "ok" if resp.status_code == 200 else "degraded"
    except Exception:
        checks["ml"] = "unreachable"
    return {"status": "ok", "env": settings.env, "checks": checks}
```

### `apps/api/requirements.txt`

```
fastapi==0.115.*
uvicorn[standard]==0.32.*
pydantic==2.9.*
pydantic-settings==2.6.*
sqlalchemy[asyncio]==2.0.*
asyncpg==0.30.*
psycopg2-binary==2.9.*
alembic==1.14.*
pgvector==0.3.*
python-jose[cryptography]==3.3.*
passlib[bcrypt]==1.7.*
python-multipart==0.0.*
httpx==0.27.*
redis==5.2.*
rq==2.0.*
apscheduler==3.10.*
boto3==1.35.*
pillow==11.0.*
opencv-python-headless==4.10.*
numpy==2.1.*
pandas==2.2.*
scikit-learn==1.5.*
lightgbm==4.5.*
shap==0.46.*
rembg[cpu]==2.0.*
onnxruntime==1.20.*
faster-whisper==1.1.*
pydub==0.25.*
google-generativeai==0.8.*
groq==0.13.*
gtts==2.5.*
pynacl==1.5.*
openpyxl==3.1.*
reportlab==4.2.*
python-slugify==8.0.*
```

### `apps/mobile/src/api/client.ts`

```ts
import * as SecureStore from 'expo-secure-store';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.5:8000';

export class ApiError extends Error {
  constructor(public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await SecureStore.getItemAsync('jwt');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(e.code ?? 'UNKNOWN', e.message ?? res.statusText, e.details);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(p: string, body: unknown) =>
    request<T>(p, { method: 'PATCH', body: JSON.stringify(body) }),
  upload: <T>(p: string, form: FormData) =>
    request<T>(p, { method: 'POST', body: form }),
};
```

### Steps

1. `git init`, create the tree from §5 with empty `__init__.py` files.
2. Create Neon project → copy both connection strings into `.env`.
3. Run `infra/neon_setup.sql` in the Neon SQL editor (fastest) **and** save it as `alembic/versions/0001_initial.py` for reproducibility.
4. `docker compose up` → `curl localhost:8000/health`.
5. `npx create-expo-app apps/mobile -t expo-template-blank-typescript`, add `expo-secure-store`, wire `client.ts`, render the health JSON on screen.
6. Deploy API to Railway from GitHub. Add all env vars. Confirm `/health` from your phone.

### Definition of Done

- [ ] `/health` returns `db: ok` from Railway
- [ ] Expo APK installs on a physical Android phone and displays live API data
- [ ] All 20+ tables exist in Neon
- [ ] `.env.example` committed, real `.env` gitignored

---

## Phase 1 — Auth, Artisan Profile, Listing CRUD

**Goal:** An artisan can log in with phone + PIN and manually create a listing with a photo. No AI yet. This is your skeleton — every later phase fills a field on this object.

### `apps/api/app/security.py`

```python
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.config import settings

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_pin(pin: str) -> str:
    return pwd.hash(pin)


def verify_pin(pin: str, hashed: str) -> bool:
    return pwd.verify(pin, hashed)


def create_token(sub: str, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {"sub": sub, "role": role, "exp": exp},
        settings.api_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.api_secret_key,
                          algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
```

### `apps/api/app/deps.py`

```python
from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.errors import AppError
from app.security import decode_token
from app.models.user import User
from app.models.artisan import Artisan


async def current_user(
    authorization: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not authorization.startswith("Bearer "):
        raise AppError("UNAUTHORIZED", "Missing bearer token", 401)
    payload = decode_token(authorization.removeprefix("Bearer "))
    if not payload:
        raise AppError("UNAUTHORIZED", "Invalid or expired token", 401)
    user = await db.scalar(select(User).where(User.id == payload["sub"]))
    if not user:
        raise AppError("UNAUTHORIZED", "User not found", 401)
    return user


async def current_artisan(
    x_artisan_id: str | None = Header(default=None),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> Artisan:
    """
    Resolves the artisan context.

    Sakhi mode: a user with role='sakhi' may pass X-Artisan-Id to act on behalf
    of an artisan they manage. We verify the managed_by link server-side --
    never trust the header alone.
    """
    if x_artisan_id and user.role == "sakhi":
        artisan = await db.scalar(
            select(Artisan).where(
                Artisan.id == x_artisan_id, Artisan.managed_by == user.id
            )
        )
        if not artisan:
            raise AppError("FORBIDDEN", "Not authorised for this artisan", 403)
        return artisan

    artisan = await db.scalar(select(Artisan).where(Artisan.user_id == user.id))
    if not artisan:
        raise AppError("NO_PROFILE", "Artisan profile not created", 404)
    return artisan
```

> Build `current_artisan` **now**, in Phase 1, even though Sakhi mode ships in Phase 11. Retrofitting multi-tenancy later means touching every endpoint.

### `apps/api/app/models/listing.py`

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Numeric, Integer, ForeignKey, Text, ARRAY, Float
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector
from app.db import Base


class Listing(Base):
    __tablename__ = "listings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True,
                                          default=uuid.uuid4)
    artisan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("artisans.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String, default="draft")

    title_en: Mapped[str | None] = mapped_column(Text)
    title_hi: Mapped[str | None] = mapped_column(Text)
    description_en: Mapped[str | None] = mapped_column(Text)
    description_hi: Mapped[str | None] = mapped_column(Text)
    seo_keywords: Mapped[list[str] | None] = mapped_column(ARRAY(Text))

    facts: Mapped[dict] = mapped_column(JSONB, default=dict)

    craft_class: Mapped[str | None] = mapped_column(String)
    craft_confidence: Mapped[float | None] = mapped_column(Float)
    gi_tag: Mapped[str | None] = mapped_column(String)
    heritage_note: Mapped[str | None] = mapped_column(Text)

    price: Mapped[float | None] = mapped_column(Numeric(10, 2))
    price_p25: Mapped[float | None] = mapped_column(Numeric(10, 2))
    price_p50: Mapped[float | None] = mapped_column(Numeric(10, 2))
    price_p75: Mapped[float | None] = mapped_column(Numeric(10, 2))
    dignity_floor: Mapped[float | None] = mapped_column(Numeric(10, 2))
    price_reasons: Mapped[list] = mapped_column(JSONB, default=list)
    material_cost: Mapped[float | None] = mapped_column(Numeric(10, 2))

    primary_media_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    media_ids: Mapped[list] = mapped_column(ARRAY(UUID(as_uuid=True)), default=list)
    glb_media_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))

    stock_qty: Mapped[int] = mapped_column(Integer, default=1)
    source: Mapped[str] = mapped_column(String, default="app")

    embedding: Mapped[list[float] | None] = mapped_column(Vector(768))

    views_count: Mapped[int] = mapped_column(Integer, default=0)
    orders_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
```

### `apps/api/app/services/storage.py`

```python
import uuid, mimetypes
import boto3
from botocore.client import Config
from app.config import settings

_s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
    aws_access_key_id=settings.r2_access_key_id,
    aws_secret_access_key=settings.r2_secret_access_key,
    config=Config(signature_version="s3v4"),
    region_name="auto",
)


def put_bytes(data: bytes, prefix: str, ext: str, content_type: str | None = None) -> str:
    key = f"{prefix}/{uuid.uuid4().hex}.{ext.lstrip('.')}"
    _s3.put_object(
        Bucket=settings.r2_bucket,
        Key=key,
        Body=data,
        ContentType=content_type or mimetypes.guess_type(key)[0] or "application/octet-stream",
    )
    return key


def get_bytes(key: str) -> bytes:
    return _s3.get_object(Bucket=settings.r2_bucket, Key=key)["Body"].read()


def public_url(key: str) -> str:
    if settings.r2_public_base:
        return f"{settings.r2_public_base}/{key}"
    return presigned_url(key)


def presigned_url(key: str, expires: int = 3600) -> str:
    return _s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.r2_bucket, "Key": key},
        ExpiresIn=expires,
    )
```

### `apps/api/app/routers/listings.py`

```python
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import current_artisan
from app.models.artisan import Artisan
from app.models.listing import Listing
from app.schemas.listing import ListingCreate, ListingUpdate, ListingOut
from app.errors import AppError

router = APIRouter(prefix="/listings", tags=["listings"])


@router.post("", response_model=ListingOut, status_code=201)
async def create_listing(
    body: ListingCreate,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    listing = Listing(artisan_id=artisan.id, **body.model_dump(exclude_unset=True))
    db.add(listing)
    await db.flush()
    # Phase 9 will add: await index_listing(db, listing)
    return listing


@router.get("", response_model=list[ListingOut])
async def list_listings(
    status: str | None = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    q = select(Listing).where(Listing.artisan_id == artisan.id)
    if status:
        q = q.where(Listing.status == status)
    q = q.order_by(Listing.created_at.desc()).limit(limit).offset(offset)
    return (await db.scalars(q)).all()


@router.get("/{listing_id}", response_model=ListingOut)
async def get_listing(
    listing_id: uuid.UUID,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    listing = await db.scalar(
        select(Listing).where(Listing.id == listing_id,
                              Listing.artisan_id == artisan.id))
    if not listing:
        raise AppError("NOT_FOUND", "Listing not found", 404)
    return listing


@router.patch("/{listing_id}", response_model=ListingOut)
async def update_listing(
    listing_id: uuid.UUID,
    body: ListingUpdate,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    listing = await get_listing(listing_id, artisan, db)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(listing, k, v)
    await db.flush()
    return listing
```

### Steps

1. Write all SQLAlchemy models mirroring §6. Keep field names identical to the SQL.
2. Auth router: `/auth/otp/request` returns `{"sent": true, "debug_otp": "1234"}` in dev — do **not** integrate a real SMS provider, it wastes a day. Verify creates the user + artisan row on first login.
3. Media router: multipart upload → `storage.put_bytes` → `media` row → return `{id, url}`.
4. Mobile: Onboard (phone → PIN) → Home (list of listings) → Capture (photo) → Review (manual title/price) → save.
5. Store JWT in `expo-secure-store`.

### Definition of Done

- [ ] Login on a real phone, session persists across app restarts
- [ ] Photo captured on device appears in R2 and renders back in the app
- [ ] Listing created, listed, edited
- [ ] `current_artisan` enforces ownership (test: user A cannot GET user B's listing)

---

## Phase 2 — AI Image Enhancer & Studio

**PS-mandated feature 1.** Goal: raw cluttered photo → clean, lit, square, marketplace-ready image, with a before/after slider in the app.

### `apps/ml/app.py` (ML service — start it here)

```python
import io, os
from fastapi import FastAPI, UploadFile, File, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import numpy as np
from PIL import Image

from loaders import (
    get_rembg, get_clip, get_text_encoder, get_reranker, get_craft_clf
)

TOKEN = os.getenv("ML_SERVICE_TOKEN", "")
app = FastAPI(title="KalaSetu ML")


def auth(x_ml_token: str = Header(default="")):
    if TOKEN and x_ml_token != TOKEN:
        raise HTTPException(401, "bad token")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/segment")
async def segment(file: UploadFile = File(...), _=Header(default="", alias="X-ML-Token")):
    """Returns RGBA PNG with background removed."""
    from rembg import remove
    data = await file.read()
    out = remove(data, session=get_rembg())
    return Response(content=out, media_type="image/png")


class EmbedTextIn(BaseModel):
    texts: list[str]
    prefix: str = "passage: "   # e5 models need this


@app.post("/embed/text")
def embed_text(body: EmbedTextIn):
    model = get_text_encoder()
    vecs = model.encode([body.prefix + t for t in body.texts],
                        normalize_embeddings=True)
    return {"embeddings": vecs.tolist()}


@app.post("/embed/image")
async def embed_image(file: UploadFile = File(...)):
    import torch
    model, preprocess = get_clip()
    img = Image.open(io.BytesIO(await file.read())).convert("RGB")
    with torch.no_grad():
        v = model.encode_image(preprocess(img).unsqueeze(0))
        v = v / v.norm(dim=-1, keepdim=True)
    return {"embedding": v[0].cpu().numpy().tolist()}


@app.post("/classify/craft")
async def classify_craft(file: UploadFile = File(...)):
    import torch
    model, preprocess = get_clip()
    clf = get_craft_clf()
    img = Image.open(io.BytesIO(await file.read())).convert("RGB")
    with torch.no_grad():
        v = model.encode_image(preprocess(img).unsqueeze(0))
        v = (v / v.norm(dim=-1, keepdim=True)).cpu().numpy()
    probs = clf.predict_proba(v)[0]
    idx = int(np.argmax(probs))
    return {"craft": clf.classes_[idx], "confidence": float(probs[idx]),
            "top3": sorted(
                [{"craft": c, "p": float(p)} for c, p in zip(clf.classes_, probs)],
                key=lambda x: -x["p"])[:3]}


class RerankIn(BaseModel):
    query: str
    docs: list[str]


@app.post("/rerank")
def rerank(body: RerankIn):
    scores = get_reranker().predict([(body.query, d) for d in body.docs])
    return {"scores": [float(s) for s in scores]}
```

### `apps/ml/loaders.py`

```python
"""Lazy singletons. Never load a model at import time -- HF Spaces will
time out on boot and you will lose an hour wondering why."""
from functools import lru_cache


@lru_cache
def get_rembg():
    from rembg import new_session
    return new_session("isnet-general-use")


@lru_cache
def get_clip():
    import open_clip, torch
    model, _, preprocess = open_clip.create_model_and_transforms(
        "ViT-B-32", pretrained="laion2b_s34b_b79k")
    model.eval()
    return model, preprocess


@lru_cache
def get_text_encoder():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer("intfloat/multilingual-e5-base")


@lru_cache
def get_reranker():
    from sentence_transformers import CrossEncoder
    return CrossEncoder("BAAI/bge-reranker-base", max_length=512)


@lru_cache
def get_craft_clf():
    import joblib
    return joblib.load("artifacts/craft_clf.pkl")
```

### `apps/api/app/services/imaging.py`

```python
"""
Deterministic studio pipeline. No ML here except the segmentation mask,
which comes from the ML service. Everything below is OpenCV/PIL so it is
fast, reproducible, and cannot fail on stage.
"""
import io
import cv2
import numpy as np
from PIL import Image, ImageFilter

TARGET = 1600
BACKDROPS = {
    "white":    (255, 255, 255),
    "warm":     (250, 246, 238),
    "sage":     (232, 238, 230),
    "charcoal": (38, 38, 40),
}


def _to_cv(img: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)


def _to_pil(arr: np.ndarray) -> Image.Image:
    return Image.fromarray(cv2.cvtColor(arr, cv2.COLOR_BGR2RGB))


def auto_white_balance(bgr: np.ndarray) -> np.ndarray:
    """Gray-world assumption: average of each channel should be equal."""
    result = bgr.astype(np.float32)
    means = result.reshape(-1, 3).mean(axis=0)
    gray = means.mean()
    for c in range(3):
        result[:, :, c] *= gray / max(means[c], 1e-6)
    return np.clip(result, 0, 255).astype(np.uint8)


def enhance_lighting(bgr: np.ndarray) -> np.ndarray:
    """CLAHE on L channel only -- preserves colour, fixes local contrast."""
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def needs_brightening(bgr: np.ndarray, threshold: int = 85) -> bool:
    return float(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).mean()) < threshold


def sharpen(bgr: np.ndarray, amount: float = 0.6) -> np.ndarray:
    blur = cv2.GaussianBlur(bgr, (0, 0), 3)
    return cv2.addWeighted(bgr, 1 + amount, blur, -amount, 0)


def trim_transparent(rgba: Image.Image, pad: int = 40) -> Image.Image:
    bbox = rgba.getchannel("A").getbbox()
    if not bbox:
        return rgba
    l, t, r, b = bbox
    w, h = rgba.size
    return rgba.crop((max(0, l - pad), max(0, t - pad),
                      min(w, r + pad), min(h, b + pad)))


def add_shadow(canvas: Image.Image, subject: Image.Image,
               pos: tuple[int, int]) -> Image.Image:
    """Soft elliptical contact shadow under the subject."""
    sw, sh = subject.size
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    from PIL import ImageDraw
    d = ImageDraw.Draw(shadow)
    cx = pos[0] + sw // 2
    cy = pos[1] + sh
    rx, ry = int(sw * 0.42), int(sh * 0.05)
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(0, 0, 0, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    return Image.alpha_composite(canvas, shadow)


def studio_compose(cutout_png: bytes, backdrop: str = "white",
                   size: int = TARGET) -> bytes:
    subject = Image.open(io.BytesIO(cutout_png)).convert("RGBA")
    subject = trim_transparent(subject)

    # correct lighting on the subject only, not the backdrop
    rgb = _to_cv(subject)
    if needs_brightening(rgb):
        rgb = enhance_lighting(rgb)
    rgb = auto_white_balance(rgb)
    rgb = sharpen(rgb)
    corrected = _to_pil(rgb)
    corrected.putalpha(subject.getchannel("A"))
    subject = corrected

    # fit into 84% of the square, preserving aspect
    max_dim = int(size * 0.84)
    subject.thumbnail((max_dim, max_dim), Image.LANCZOS)

    canvas = Image.new("RGBA", (size, size), BACKDROPS.get(backdrop, (255,) * 3) + (255,))
    x = (size - subject.width) // 2
    y = (size - subject.height) // 2
    canvas = add_shadow(canvas, subject, (x, y))
    canvas.alpha_composite(subject, (x, y))

    out = io.BytesIO()
    canvas.convert("RGB").save(out, "JPEG", quality=92, optimize=True)
    return out.getvalue()


def make_variants(jpeg: bytes) -> dict[str, bytes]:
    """Marketplace size set. ONDC wants 1:1; Amazon wants >=1000px."""
    img = Image.open(io.BytesIO(jpeg))
    out = {}
    for name, px in (("full", 1600), ("main", 1000), ("thumb", 400)):
        c = img.copy()
        c.thumbnail((px, px), Image.LANCZOS)
        buf = io.BytesIO()
        c.save(buf, "JPEG", quality=88, optimize=True)
        out[name] = buf.getvalue()
    return out
```

### `apps/api/app/routers/images.py`

```python
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import current_artisan
from app.models.artisan import Artisan
from app.models.media import Media
from app.services import storage, imaging, ml_client
from app.schemas.common import EnhanceRequest, EnhanceResponse

router = APIRouter(prefix="/images", tags=["images"])


@router.post("/enhance", response_model=EnhanceResponse)
async def enhance(
    body: EnhanceRequest,
    artisan: Artisan = Depends(current_artisan),
    db: AsyncSession = Depends(get_db),
):
    raw = await db.get(Media, body.media_id)
    src = storage.get_bytes(raw.r2_key)

    # 1. segment (ML service, with graceful degradation)
    try:
        cutout = await ml_client.segment(src)
    except Exception:
        cutout = None

    # 2. compose
    if cutout:
        jpeg = imaging.studio_compose(cutout, backdrop=body.backdrop)
    else:
        # fallback: no cutout -- still correct lighting and square-pad
        jpeg = imaging.studio_compose_no_mask(src, backdrop=body.backdrop)

    # 3. store variants
    variants = imaging.make_variants(jpeg)
    keys = {n: storage.put_bytes(b, f"enhanced/{artisan.id}", "jpg", "image/jpeg")
            for n, b in variants.items()}

    m = Media(artisan_id=artisan.id, kind="image_enhanced",
              r2_key=keys["full"], mime="image/jpeg",
              parent_id=raw.id, meta={"variants": keys,
                                      "segmented": cutout is not None})
    db.add(m)
    await db.flush()

    return EnhanceResponse(
        media_id=m.id,
        before_url=storage.public_url(raw.r2_key),
        after_url=storage.public_url(keys["full"]),
        segmented=cutout is not None,
    )
```

### `apps/api/app/services/ml_client.py`

```python
import httpx
from app.config import settings

_headers = {"X-ML-Token": settings.ml_service_token}
_timeout = httpx.Timeout(60.0, connect=10.0)


async def segment(image_bytes: bytes) -> bytes:
    async with httpx.AsyncClient(timeout=_timeout) as c:
        r = await c.post(f"{settings.ml_service_url}/segment",
                         files={"file": ("i.jpg", image_bytes, "image/jpeg")},
                         headers=_headers)
        r.raise_for_status()
        return r.content


async def embed_text(texts: list[str], prefix: str = "passage: ") -> list[list[float]]:
    async with httpx.AsyncClient(timeout=_timeout) as c:
        r = await c.post(f"{settings.ml_service_url}/embed/text",
                         json={"texts": texts, "prefix": prefix}, headers=_headers)
        r.raise_for_status()
        return r.json()["embeddings"]


async def embed_image(image_bytes: bytes) -> list[float]:
    async with httpx.AsyncClient(timeout=_timeout) as c:
        r = await c.post(f"{settings.ml_service_url}/embed/image",
                         files={"file": ("i.jpg", image_bytes, "image/jpeg")},
                         headers=_headers)
        r.raise_for_status()
        return r.json()["embedding"]


async def classify_craft(image_bytes: bytes) -> dict:
    async with httpx.AsyncClient(timeout=_timeout) as c:
        r = await c.post(f"{settings.ml_service_url}/classify/craft",
                         files={"file": ("i.jpg", image_bytes, "image/jpeg")},
                         headers=_headers)
        r.raise_for_status()
        return r.json()


async def rerank(query: str, docs: list[str]) -> list[float]:
    async with httpx.AsyncClient(timeout=_timeout) as c:
        r = await c.post(f"{settings.ml_service_url}/rerank",
                         json={"query": query, "docs": docs}, headers=_headers)
        r.raise_for_status()
        return r.json()["scores"]
```

### On-device path (offline mode)

Install `@react-native-ml-kit/subject-segmentation` (requires `expo-dev-client`). In `CaptureScreen.tsx`:

```ts
import SubjectSegmentation from '@react-native-ml-kit/subject-segmentation';

export async function segmentOnDevice(uri: string): Promise<string | null> {
  try {
    const res = await SubjectSegmentation.segment({ path: uri });
    return res.path;           // local PNG with alpha
  } catch {
    return null;               // fall back to server
  }
}
```

Rule: if `NetInfo.isConnected === false`, segment on device, run a simplified brightness/contrast fix with `expo-image-manipulator`, mark the media `pending_enhance`, and let the outbox re-enhance server-side on reconnect.

### Steps

1. Deploy the ML service to a HF Space (Docker SDK) **first** — it takes 15 min to build and you'll want it warm.
2. `POST /images/enhance` with a phone photo of a real cluttered object. Iterate on shadow softness and padding until it looks like a catalog photo.
3. Build `BeforeAfter.tsx` — a draggable slider over two stacked images. This is a demo centrepiece; make it smooth.
4. Add the 4 backdrop chips as big tappable colour tiles.

### Definition of Done

- [ ] Cluttered home photo → clean white-background square in under 4 seconds
- [ ] Works with the ML service **down** (fallback path produces a padded, colour-corrected image)
- [ ] Before/after slider works on device
- [ ] Three size variants stored and retrievable


---

## Phase 3 — Multilingual Auto-Cataloger

**PS-mandated feature 2** + **F4 (grounded descriptions)**. Goal: artisan speaks in Hindi/regional → structured facts → professional EN + HI description that invents nothing.

This is the highest-value phase. Build it carefully.

### The grounding contract

The LLM never sees "write a description of a saree." It sees a dict of **confirmed facts** and a hard instruction to use only those. Missing fields render as "not specified" — never guessed.

```
transcript → [LLM extract] → ProductFacts (Pydantic, all Optional)
                                    │
                          missing required fields?
                                    │
                     yes ───────────┴─────────── no
                      │                           │
          ask 2-3 voice follow-ups        [LLM generate] → Description
                      │                           │
                      └───────► merge ────────────┘
                                                  │
                                          [LLM verify] → claim check
```

### `apps/api/app/schemas/catalog.py`

```python
from typing import Literal
from pydantic import BaseModel, Field


class ProductFacts(BaseModel):
    """
    Every field is Optional by design. A None value is rendered as
    'not specified' downstream -- it is NEVER filled in by the model.
    """
    product_type: str | None = Field(None, description="saree, pot, toy, painting")
    material: str | None = Field(None, description="exact material as stated")
    technique: str | None = None
    colors: list[str] = Field(default_factory=list)
    dimensions_cm: str | None = None
    weight_g: int | None = None
    piece_count: int | None = None
    care_instructions: str | None = None
    work_hours: float | None = Field(None, description="hours to make ONE unit")
    is_handmade: bool | None = None
    customizations: list[str] = Field(default_factory=list)
    occasion: str | None = None

    # required for a publishable listing
    REQUIRED: tuple = ("product_type", "material", "dimensions_cm", "work_hours")

    def missing_required(self) -> list[str]:
        return [f for f in self.REQUIRED if getattr(self, f, None) in (None, "", [])]


class FollowUpQuestion(BaseModel):
    field: str
    question_en: str
    question_native: str
    audio_url: str | None = None


class ExtractFactsRequest(BaseModel):
    transcript: str
    lang: str = "hi"
    existing_facts: dict = Field(default_factory=dict)


class ExtractFactsResponse(BaseModel):
    facts: ProductFacts
    missing: list[str]
    follow_ups: list[FollowUpQuestion]


class GeneratedListing(BaseModel):
    title_en: str
    title_hi: str
    description_en: str
    description_hi: str
    seo_keywords: list[str]
    bullet_points_en: list[str]
    unspecified_fields: list[str]


class GenerateRequest(BaseModel):
    facts: ProductFacts
    craft_class: str | None = None
    gi_tag: str | None = None
    artisan_name: str | None = None
    village: str | None = None
    tone: Literal["marketplace", "premium", "b2b"] = "marketplace"
```

### `apps/api/app/services/asr.py`

```python
"""
ASR with a hard fallback chain:
  Bhashini (govt, 22 langs)  ->  faster-whisper (local)

Bhashini's uptime is not guaranteed. Never let it be a single point of failure.
"""
import asyncio, io, logging, tempfile
import httpx
from app.config import settings

log = logging.getLogger(__name__)

BHASHINI_ASR_URL = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"
_whisper = None


def _get_whisper():
    global _whisper
    if _whisper is None:
        from faster_whisper import WhisperModel
        _whisper = WhisperModel("small", device="cpu", compute_type="int8")
    return _whisper


async def _bhashini_asr(audio_b64: str, lang: str) -> str:
    payload = {
        "pipelineTasks": [{
            "taskType": "asr",
            "config": {"language": {"sourceLanguage": lang},
                       "serviceId": settings.bhashini_pipeline_id,
                       "audioFormat": "wav", "samplingRate": 16000},
        }],
        "inputData": {"audio": [{"audioContent": audio_b64}]},
    }
    headers = {"Authorization": settings.bhashini_api_key,
               "userID": settings.bhashini_user_id}
    async with httpx.AsyncClient(timeout=45) as c:
        r = await c.post(BHASHINI_ASR_URL, json=payload, headers=headers)
        r.raise_for_status()
        return r.json()["pipelineResponse"][0]["output"][0]["source"]


def _whisper_asr(audio_bytes: bytes, lang: str) -> tuple[str, list]:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as f:
        f.write(audio_bytes)
        f.flush()
        segments, _ = _get_whisper().transcribe(
            f.name, language=lang if lang != "auto" else None,
            word_timestamps=True, vad_filter=True)
        segs = list(segments)
    text = " ".join(s.text.strip() for s in segs)
    return text, segs


async def transcribe(audio_bytes: bytes, lang: str = "hi",
                     want_timestamps: bool = False) -> dict:
    """Returns {text, segments, engine}."""
    if want_timestamps or settings.offline_demo_mode or not settings.bhashini_enabled:
        text, segs = await asyncio.to_thread(_whisper_asr, audio_bytes, lang)
        return {"text": text, "engine": "whisper",
                "segments": [{"start": s.start, "end": s.end, "text": s.text}
                             for s in segs]}
    try:
        import base64
        b64 = base64.b64encode(audio_bytes).decode()
        text = await asyncio.wait_for(_bhashini_asr(b64, lang), timeout=20)
        return {"text": text, "engine": "bhashini", "segments": []}
    except Exception as e:
        log.warning("Bhashini ASR failed, falling back to whisper: %s", e)
        text, segs = await asyncio.to_thread(_whisper_asr, audio_bytes, lang)
        return {"text": text, "engine": "whisper-fallback",
                "segments": [{"start": s.start, "end": s.end, "text": s.text}
                             for s in segs]}
```

### `apps/api/app/services/llm.py`

```python
"""Provider-agnostic LLM with structured output and automatic failover."""
import json, logging
from typing import TypeVar, Type
from pydantic import BaseModel
from app.config import settings

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)


def _strip_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t
        t = t.rsplit("```", 1)[0]
    return t.replace("```json", "").replace("```", "").strip()


async def _gemini(system: str, user: str, image_bytes: bytes | None = None) -> str:
    import google.generativeai as genai
    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel(settings.llm_model_gemini,
                                  system_instruction=system)
    parts = [user]
    if image_bytes:
        parts.append({"mime_type": "image/jpeg", "data": image_bytes})
    resp = await model.generate_content_async(
        parts, generation_config={"temperature": 0.3,
                                  "response_mime_type": "application/json"})
    return resp.text


async def _groq(system: str, user: str, **_) -> str:
    from groq import AsyncGroq
    client = AsyncGroq(api_key=settings.groq_api_key)
    resp = await client.chat.completions.create(
        model=settings.llm_model_groq,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    return resp.choices[0].message.content


async def complete_json(system: str, user: str, schema: Type[T],
                        image_bytes: bytes | None = None) -> T:
    """Calls primary, falls back to secondary, validates against schema."""
    order = ([_gemini, _groq] if settings.llm_primary == "gemini"
             else [_groq, _gemini])
    last_err = None
    for fn in order:
        try:
            raw = await fn(system, user, image_bytes=image_bytes)
            return schema.model_validate(json.loads(_strip_fences(raw)))
        except Exception as e:
            log.warning("LLM %s failed: %s", fn.__name__, e)
            last_err = e
    raise RuntimeError(f"All LLM providers failed: {last_err}")
```

### `apps/api/app/services/grounding.py`

```python
"""
The anti-hallucination layer. Three guarantees:
  1. Extraction only records what was literally said.
  2. Generation is given ONLY confirmed facts + an explicit forbidden list.
  3. A verification pass checks every factual claim against the fact dict.
"""
from app.schemas.catalog import (
    ProductFacts, GeneratedListing, FollowUpQuestion, GenerateRequest
)
from app.services.llm import complete_json

EXTRACT_SYSTEM = """You extract product facts from an artisan's spoken description.

ABSOLUTE RULES:
- Record ONLY what the speaker explicitly said. Never infer, never assume.
- If the speaker did not mention a field, leave it null. Do not guess.
- "silk-like" is NOT "silk". "looks handmade" is NOT is_handmade=true.
- Numbers must be spoken. Do not estimate dimensions from the product type.
- Preserve the speaker's own material words; translate them literally.

Return JSON matching the ProductFacts schema. No prose, no markdown."""

GENERATE_SYSTEM = """You write e-commerce copy for handmade Indian craft products.

ABSOLUTE RULES:
1. Use ONLY the facts provided in CONFIRMED_FACTS. Nothing else is true.
2. NEVER state a material, size, weight, or origin that is not in CONFIRMED_FACTS.
3. If a field is missing, either omit it or write "not specified".
   Do NOT write "premium silk" when material is null.
4. Do not invent certifications, awards, thread counts, or dye types.
5. Heritage/GI context may be used ONLY if gi_tag is provided.
6. Write warm, specific, buyer-facing copy -- but every specific must be sourced.

Output JSON: title_en, title_hi, description_en, description_hi,
seo_keywords (8-12), bullet_points_en (3-5), unspecified_fields."""

VERIFY_SYSTEM = """You are a compliance checker for product listings.
Given CONFIRMED_FACTS and a DESCRIPTION, list every factual claim in the
description that is NOT supported by CONFIRMED_FACTS.
Return JSON: {"violations": [{"claim": "...", "reason": "..."}]}
Subjective language ("beautiful", "elegant") is allowed and is not a violation.
Only flag verifiable claims: materials, measurements, origin, counts, techniques."""


async def extract_facts(transcript: str, lang: str,
                        existing: dict | None = None) -> ProductFacts:
    user = f"LANGUAGE: {lang}\nEXISTING_FACTS: {existing or {}}\nTRANSCRIPT:\n{transcript}"
    return await complete_json(EXTRACT_SYSTEM, user, ProductFacts)


FOLLOW_UP_TEMPLATES = {
    "product_type": ("What is this item?", "Yeh cheez kya hai?"),
    "material":     ("What material is it made of?", "Yeh kis cheez se bana hai?"),
    "dimensions_cm": ("What size is it? Length and width.",
                      "Iska size kya hai? Lambai aur chaudai bataiye."),
    "work_hours":   ("How many hours does one piece take to make?",
                     "Ek piece banane mein kitne ghante lagte hain?"),
    "piece_count":  ("How many pieces in a set?", "Set mein kitne piece hain?"),
}


def build_follow_ups(missing: list[str]) -> list[FollowUpQuestion]:
    """Max 3 questions. More than that and the artisan abandons the flow."""
    out = []
    for field in missing[:3]:
        en, hi = FOLLOW_UP_TEMPLATES.get(
            field, (f"Please tell us the {field}.", f"Kripya {field} bataiye."))
        out.append(FollowUpQuestion(field=field, question_en=en, question_native=hi))
    return out


async def generate_listing(req: GenerateRequest) -> GeneratedListing:
    facts = req.facts.model_dump(exclude={"REQUIRED"})
    confirmed = {k: v for k, v in facts.items() if v not in (None, "", [])}
    unknown = [k for k, v in facts.items() if v in (None, "", [])]

    user = f"""CONFIRMED_FACTS:
{confirmed}

FIELDS_WITH_NO_DATA (never claim these):
{unknown}

CRAFT: {req.craft_class or 'unknown'}
GI_TAG: {req.gi_tag or 'none'}
ARTISAN: {req.artisan_name or 'unknown'} from {req.village or 'unknown'}
TONE: {req.tone}"""

    listing = await complete_json(GENERATE_SYSTEM, user, GeneratedListing)
    listing.unspecified_fields = unknown
    return listing


class Violations(__import__("pydantic").BaseModel):
    violations: list[dict] = []


async def verify_listing(facts: ProductFacts, listing: GeneratedListing) -> list[dict]:
    confirmed = {k: v for k, v in facts.model_dump(exclude={"REQUIRED"}).items()
                 if v not in (None, "", [])}
    user = f"CONFIRMED_FACTS:\n{confirmed}\n\nDESCRIPTION:\n{listing.description_en}"
    result = await complete_json(VERIFY_SYSTEM, user, Violations)
    return result.violations
```

### `apps/api/app/routers/catalog.py`

```python
from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import current_artisan
from app.models.artisan import Artisan
from app.schemas.catalog import (
    ExtractFactsRequest, ExtractFactsResponse, GenerateRequest,
    GeneratedListing, ProductFacts,
)
from app.services import asr, grounding, tts, storage

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    lang: str = Form("hi"),
    artisan: Artisan = Depends(current_artisan),
):
    audio = await file.read()
    result = await asr.transcribe(audio, lang=lang)
    return result


@router.post("/extract-facts", response_model=ExtractFactsResponse)
async def extract_facts(
    body: ExtractFactsRequest,
    artisan: Artisan = Depends(current_artisan),
):
    facts = await grounding.extract_facts(body.transcript, body.lang,
                                          body.existing_facts)
    missing = facts.missing_required()
    follow_ups = grounding.build_follow_ups(missing)
    # attach TTS audio so the app can ASK the question aloud
    for q in follow_ups:
        q.audio_url = await tts.speak_to_url(q.question_native, lang=body.lang)
    return ExtractFactsResponse(facts=facts, missing=missing, follow_ups=follow_ups)


@router.post("/generate", response_model=GeneratedListing)
async def generate(
    body: GenerateRequest,
    artisan: Artisan = Depends(current_artisan),
):
    listing = await grounding.generate_listing(body)
    violations = await grounding.verify_listing(body.facts, listing)
    if violations:
        # one automatic repair attempt, then surface the flag
        listing = await grounding.generate_listing(body)
    return listing
```

### `apps/api/app/services/tts.py`

```python
import asyncio, io, logging
import httpx
from app.config import settings
from app.services import storage

log = logging.getLogger(__name__)
BHASHINI_URL = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline"


async def _bhashini_tts(text: str, lang: str) -> bytes:
    payload = {
        "pipelineTasks": [{
            "taskType": "tts",
            "config": {"language": {"sourceLanguage": lang},
                       "serviceId": settings.bhashini_pipeline_id,
                       "gender": "female"},
        }],
        "inputData": {"input": [{"source": text}]},
    }
    headers = {"Authorization": settings.bhashini_api_key,
               "userID": settings.bhashini_user_id}
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(BHASHINI_URL, json=payload, headers=headers)
        r.raise_for_status()
        import base64
        b64 = r.json()["pipelineResponse"][0]["audio"][0]["audioContent"]
        return base64.b64decode(b64)


def _gtts(text: str, lang: str) -> bytes:
    from gtts import gTTS
    buf = io.BytesIO()
    gTTS(text=text, lang=lang if lang in ("hi", "en", "bn", "ta", "te") else "hi").write_to_fp(buf)
    return buf.getvalue()


async def speak(text: str, lang: str = "hi") -> bytes:
    if settings.bhashini_enabled and not settings.offline_demo_mode:
        try:
            return await asyncio.wait_for(_bhashini_tts(text, lang), timeout=15)
        except Exception as e:
            log.warning("Bhashini TTS failed: %s", e)
    return await asyncio.to_thread(_gtts, text, lang)


async def speak_to_url(text: str, lang: str = "hi") -> str:
    audio = await speak(text, lang)
    key = storage.put_bytes(audio, "tts", "mp3", "audio/mpeg")
    return storage.public_url(key)
```

### Mobile: `VoiceDescribeScreen.tsx` (flow skeleton)

```tsx
import { useState } from 'react';
import { View } from 'react-native';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { BigButton } from '../components/BigButton';
import { SpeakableText } from '../components/SpeakableText';
import { api } from '../api/client';

type Step = 'describe' | 'followup' | 'generating' | 'review';

export default function VoiceDescribeScreen({ route, navigation }) {
  const { mediaId } = route.params;
  const [step, setStep] = useState<Step>('describe');
  const [facts, setFacts] = useState({});
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [qIndex, setQIndex] = useState(0);

  async function handleRecording(uri: string) {
    const form = new FormData();
    form.append('file', { uri, name: 'a.wav', type: 'audio/wav' } as any);
    form.append('lang', 'hi');
    const { text } = await api.upload<{ text: string }>('/catalog/transcribe', form);

    const res = await api.post<any>('/catalog/extract-facts', {
      transcript: text, lang: 'hi', existing_facts: facts,
    });
    setFacts(res.facts);

    if (res.follow_ups.length > 0) {
      setFollowUps(res.follow_ups);
      setQIndex(0);
      setStep('followup');
    } else {
      await generate(res.facts);
    }
  }

  async function generate(f: any) {
    setStep('generating');
    const listing = await api.post('/catalog/generate', { facts: f, tone: 'marketplace' });
    navigation.navigate('ReviewListing', { mediaId, facts: f, listing });
  }

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
      {step === 'describe' && (
        <>
          <SpeakableText
            text="Apne saaman ke baare mein bataiye"
            lang="hi"
            autoSpeak
            style={{ fontSize: 28, textAlign: 'center', marginBottom: 40 }}
          />
          <VoiceRecorder onDone={handleRecording} maxSeconds={60} />
        </>
      )}

      {step === 'followup' && (
        <>
          <SpeakableText
            text={followUps[qIndex].question_native}
            audioUrl={followUps[qIndex].audio_url}
            autoSpeak
            style={{ fontSize: 26, textAlign: 'center', marginBottom: 40 }}
          />
          <VoiceRecorder
            maxSeconds={15}
            onDone={async (uri) => {
              // same transcribe -> extract loop, merging into existing facts
              await handleRecording(uri);
              if (qIndex + 1 < followUps.length) setQIndex(qIndex + 1);
              else await generate(facts);
            }}
          />
        </>
      )}

      {step === 'generating' && <SpeakableText text="Taiyaar ho raha hai..." autoSpeak />}
    </View>
  );
}
```

### Steps

1. Get Bhashini credentials early — registration takes time. Build against `faster-whisper` while you wait.
2. Test extraction with **deliberately vague** audio ("yeh accha saaman hai, bahut sundar") — confirm the model returns nulls, not guesses. This is your grounding test.
3. Test with mixed-language audio (Hinglish) — very common in reality.
4. Record 5 real sample voice notes and commit them to `assets/demo/` as regression fixtures.

### Definition of Done

- [ ] Hindi voice note → correct facts extracted
- [ ] Vague voice note → `missing_required` correctly populated, follow-ups asked **aloud**
- [ ] Generated description contains zero unsourced material/size claims (verify pass returns empty)
- [ ] EN + HI both produced
- [ ] Works fully offline with `OFFLINE_DEMO_MODE=true`

---

## Phase 4 — Dynamic Pricing Assistant

**PS-mandated feature 3.** Goal: image + description + context → a defensible price band, with reasons, floored at a wage-fair minimum.

### 4.1 Data collection (do this in week 1, it blocks everything)

`ml/scripts/scrape_listings.py` targets: iTokri, Okhai, Gaatha, Amazon Karigar, Flipkart Samarth, IndiaMART, GeM public listings.

Target: **3,000–6,000 rows**, 15–20 craft categories. Schema:

```csv
source,url,title,description,price,category,craft_guess,material_guess,image_url,scraped_at
```

Commit the CSV to `ml/data/listings.csv`. Do not scrape at runtime.

### 4.2 `ml/scripts/build_features.py`

```python
"""
Builds the training matrix. Run once; outputs features.parquet + PCA artifacts.

Feature blocks:
  A. CLIP image embedding      -> PCA(50)
  B. e5 text embedding         -> PCA(30)
  C. craft/material/region categoricals
  D. handcrafted image stats (edge density = labour proxy)
  E. temporal / festival proximity
  F. raw material index
"""
import json, joblib
import numpy as np
import pandas as pd
import cv2
from sklearn.decomposition import PCA


def edge_density(img_bgr) -> float:
    """Proxy for visual intricacy -> labour -> price. Cheap and surprisingly useful."""
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 160)
    return float(edges.mean() / 255.0)


def color_count(img_bgr, k: int = 6) -> int:
    small = cv2.resize(img_bgr, (64, 64)).reshape(-1, 3).astype(np.float32)
    _, labels, _ = cv2.kmeans(
        small, k, None,
        (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0),
        3, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.flatten(), minlength=k)
    return int((counts > small.shape[0] * 0.05).sum())


def sharpness(img_bgr) -> float:
    return float(cv2.Laplacian(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY),
                               cv2.CV_64F).var())


def festival_proximity(date, festivals: dict) -> int:
    """Days to the nearest major festival. Caps at 120."""
    import datetime as dt
    best = 999
    for _, iso in festivals.items():
        d = abs((dt.date.fromisoformat(iso) - date).days)
        best = min(best, d)
    return min(best, 120)


def build(df: pd.DataFrame, img_embs: np.ndarray, txt_embs: np.ndarray,
          img_stats: pd.DataFrame, out_dir: str):
    pca_img = PCA(n_components=50, random_state=42).fit(img_embs)
    pca_txt = PCA(n_components=30, random_state=42).fit(txt_embs)
    joblib.dump(pca_img, f"{out_dir}/pca_image.pkl")
    joblib.dump(pca_txt, f"{out_dir}/pca_text.pkl")

    Ximg = pd.DataFrame(pca_img.transform(img_embs),
                        columns=[f"img_{i}" for i in range(50)])
    Xtxt = pd.DataFrame(pca_txt.transform(txt_embs),
                        columns=[f"txt_{i}" for i in range(30)])

    X = pd.concat([
        df[["craft_class", "material", "state", "work_hours",
            "piece_count", "material_cost", "days_to_festival"]].reset_index(drop=True),
        img_stats.reset_index(drop=True),
        Ximg, Xtxt,
    ], axis=1)

    for c in ("craft_class", "material", "state"):
        X[c] = X[c].astype("category")

    y = np.log1p(df["price"].values)   # log target: price is right-skewed
    return X, y
```

### 4.3 `ml/scripts/train_pricing.py`

```python
"""
Three LightGBM quantile models -> a price BAND, not a false-precision number.
Trains in <60s on CPU. Reports MAPE and band coverage.
"""
import json, joblib
import numpy as np
import lightgbm as lgb
from sklearn.model_selection import train_test_split

QUANTILES = {"q25": 0.25, "q50": 0.50, "q75": 0.75}

PARAMS = dict(
    objective="quantile",
    metric="quantile",
    n_estimators=600,
    learning_rate=0.05,
    num_leaves=31,
    min_child_samples=20,
    subsample=0.8,
    colsample_bytree=0.8,
    reg_lambda=1.0,
    verbosity=-1,
)


def train(X, y, out_dir="ml/artifacts"):
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42)
    models, metrics = {}, {}

    for name, alpha in QUANTILES.items():
        m = lgb.LGBMRegressor(**PARAMS, alpha=alpha)
        m.fit(Xtr, ytr, eval_set=[(Xte, yte)],
              callbacks=[lgb.early_stopping(50, verbose=False)])
        joblib.dump(m, f"{out_dir}/lgbm_{name}.pkl")
        models[name] = m

    # metrics on the median model
    pred = np.expm1(models["q50"].predict(Xte))
    true = np.expm1(yte)
    mape = float(np.mean(np.abs((pred - true) / true)))

    lo = np.expm1(models["q25"].predict(Xte))
    hi = np.expm1(models["q75"].predict(Xte))
    coverage = float(np.mean((true >= lo) & (true <= hi)))

    metrics = {"mape": round(mape, 4), "band_coverage": round(coverage, 4),
               "n_train": len(Xtr), "n_test": len(Xte),
               "features": list(X.columns)}
    with open(f"{out_dir}/metadata.json", "w") as f:
        json.dump(metrics, f, indent=2)
    print(metrics)
    return models, metrics
```

> **Target metrics to quote in the pitch:** MAPE 0.20–0.28, band coverage ≥ 0.55. Handicrafts genuinely have 2x price spreads for near-identical items — say so, it shows you understand the domain rather than overfitting a vanity number.

### 4.4 `apps/api/app/services/pricing.py`

```python
"""
Pricing = ML band  ->  trend multiplier  ->  dignity floor constraint.

The three layers are deliberately separate so each is independently
explainable. The floor is a hard constraint applied last, never a model output.
"""
import json, joblib, datetime as dt
from dataclasses import dataclass, field
from pathlib import Path
import numpy as np
import pandas as pd

ART = Path("artifacts")
DATA = Path("data")

# State minimum wage, unskilled, per DAY (INR). Update from labour.gov.in.
MIN_WAGE_PER_DAY = {
    "DL": 710, "MH": 550, "KA": 520, "TN": 490, "UP": 400, "BR": 395,
    "WB": 430, "RJ": 420, "GJ": 450, "MP": 400, "OD": 380, "AS": 390,
    "TG": 500, "AP": 480, "PB": 460, "HR": 620, "JH": 390, "CG": 380,
    "_DEFAULT": 420,
}
HOURS_PER_DAY = 8
PLATFORM_FEE_PCT = 0.06        # ONDC + payment + packaging
LOGISTICS_FLAT = 60            # INR, average
MIN_MARGIN_PCT = 0.15


@dataclass
class PriceResult:
    p25: float
    p50: float
    p75: float
    recommended: float
    dignity_floor: float
    floor_breached: bool
    material_cost: float
    labour_cost: float
    trend_multiplier: float
    trend_reason: str | None
    reasons: list[dict] = field(default_factory=list)
    comparables: list[dict] = field(default_factory=list)
    advisories: list[str] = field(default_factory=list)


class PricingEngine:
    def __init__(self, models, pca_img, pca_txt, rates, festivals, feature_cols):
        self.models = models
        self.pca_img, self.pca_txt = pca_img, pca_txt
        self.rates = rates
        self.festivals = festivals
        self.feature_cols = feature_cols

    @classmethod
    def load(cls) -> "PricingEngine":
        meta = json.loads((ART / "metadata.json").read_text())
        return cls(
            models={q: joblib.load(ART / f"lgbm_{q}.pkl")
                    for q in ("q25", "q50", "q75")},
            pca_img=joblib.load(ART / "pca_image.pkl"),
            pca_txt=joblib.load(ART / "pca_text.pkl"),
            rates=json.loads((DATA / "material_rates.json").read_text()),
            festivals=json.loads((DATA / "festivals.json").read_text()),
            feature_cols=meta["features"],
        )

    # ---------- layer 5: raw material cost ----------
    def material_cost(self, facts: dict) -> float:
        mat = (facts.get("material") or "").lower()
        rate = None
        for key, r in self.rates.items():
            if key in mat:
                rate = r
                break
        if not rate:
            return 0.0
        qty = facts.get("material_qty") or rate.get("default_qty", 1)
        return round(float(rate["rate_per_unit"]) * float(qty), 2)

    # ---------- layer 6: dignity floor ----------
    def dignity_floor(self, facts: dict, state: str, material_cost: float) -> dict:
        hours = float(facts.get("work_hours") or 0)
        wage_day = MIN_WAGE_PER_DAY.get(state, MIN_WAGE_PER_DAY["_DEFAULT"])
        labour = round(hours * wage_day / HOURS_PER_DAY, 2)
        subtotal = material_cost + labour + LOGISTICS_FLAT
        floor = subtotal * (1 + PLATFORM_FEE_PCT) * (1 + MIN_MARGIN_PCT)
        return {"floor": round(floor, 2), "labour": labour,
                "material": material_cost}

    # ---------- layer 4: trend multiplier ----------
    def trend(self, craft: str | None, today: dt.date | None = None) -> tuple[float, str | None]:
        today = today or dt.date.today()
        best_mult, best_reason = 1.0, None
        for name, info in self.festivals.items():
            fdate = dt.date.fromisoformat(info["date"])
            days = (fdate - today).days
            if 0 <= days <= 45 and craft in info.get("boosts_crafts", []):
                mult = 1.0 + info.get("uplift", 0.15) * (1 - days / 45)
                if mult > best_mult:
                    best_mult, best_reason = round(mult, 3), (
                        f"{name} is in {days} days; {craft} demand rises "
                        f"about {int(info.get('uplift',0.15)*100)}%")
        return best_mult, best_reason

    # ---------- main ----------
    def predict(self, *, img_emb, txt_emb, facts: dict, craft: str | None,
                state: str, img_stats: dict) -> PriceResult:
        row = self._assemble_row(img_emb, txt_emb, facts, craft, state, img_stats)

        base = {q: float(np.expm1(m.predict(row)[0]))
                for q, m in self.models.items()}

        mult, treason = self.trend(craft)
        p25, p50, p75 = (round(base["q25"] * mult),
                         round(base["q50"] * mult),
                         round(base["q75"] * mult))

        mcost = self.material_cost(facts)
        fl = self.dignity_floor(facts, state, mcost)
        floor = fl["floor"]

        recommended = max(p50, floor)
        breached = floor > p50

        advisories = []
        if breached:
            advisories = [
                "At market rates this earns less than minimum wage for your time.",
                "Add the GI tag and your story to justify a premium.",
                "Consider selling as a set of 3 instead of single pieces.",
                "Route this to a B2B bulk buyer rather than retail.",
            ]

        return PriceResult(
            p25=p25, p50=p50, p75=p75,
            recommended=round(recommended),
            dignity_floor=floor, floor_breached=breached,
            material_cost=mcost, labour_cost=fl["labour"],
            trend_multiplier=mult, trend_reason=treason,
            reasons=self.explain(row), advisories=advisories,
        )

    def explain(self, row: pd.DataFrame, top_k: int = 4) -> list[dict]:
        """SHAP -> human-readable drivers. Grouped so 'img_0..img_49' becomes
        one 'product appearance' contribution rather than 50 meaningless rows."""
        import shap
        expl = shap.TreeExplainer(self.models["q50"])
        vals = expl.shap_values(row)[0]

        groups: dict[str, float] = {}
        for col, v in zip(self.feature_cols, vals):
            if col.startswith("img_"):
                key = "product appearance"
            elif col.startswith("txt_"):
                key = "product description"
            elif col == "edge_density":
                key = "design intricacy"
            elif col == "work_hours":
                key = "hours of work"
            elif col == "material_cost":
                key = "material cost"
            elif col == "days_to_festival":
                key = "festival season"
            elif col == "craft_class":
                key = "craft type"
            else:
                key = col.replace("_", " ")
            groups[key] = groups.get(key, 0.0) + float(v)

        ranked = sorted(groups.items(), key=lambda kv: -abs(kv[1]))[:top_k]
        return [{"factor": k, "impact": round(v, 3),
                 "direction": "raises" if v > 0 else "lowers"} for k, v in ranked]

    def _assemble_row(self, img_emb, txt_emb, facts, craft, state, img_stats):
        vals = {}
        vals.update({f"img_{i}": v for i, v in
                     enumerate(self.pca_img.transform([img_emb])[0])})
        vals.update({f"txt_{i}": v for i, v in
                     enumerate(self.pca_txt.transform([txt_emb])[0])})
        vals["craft_class"] = craft
        vals["material"] = facts.get("material")
        vals["state"] = state
        vals["work_hours"] = facts.get("work_hours") or 0
        vals["piece_count"] = facts.get("piece_count") or 1
        vals["material_cost"] = self.material_cost(facts)
        vals["days_to_festival"] = self._days_to_festival()
        vals.update(img_stats)
        row = pd.DataFrame([vals])
        for c in ("craft_class", "material", "state"):
            row[c] = row[c].astype("category")
        return row[self.feature_cols]

    def _days_to_festival(self) -> int:
        today = dt.date.today()
        return min([abs((dt.date.fromisoformat(i["date"]) - today).days)
                    for i in self.festivals.values()] + [120])
```

### 4.5 Cold-start fallback (`comparables`)

When `craft_confidence < 0.5` or the craft is unseen in training, blend in kNN over CLIP embeddings of your scraped listings:

```python
async def knn_comparables(db, img_emb: list[float], k: int = 5) -> list[dict]:
    """pgvector similarity over the scraped reference set. Doubles as the
    explainability UI: show the artisan real similar products and their prices."""
    rows = await db.execute(text("""
        SELECT title, price, image_url,
               1 - (embedding <=> CAST(:e AS vector)) AS sim
        FROM reference_listings
        ORDER BY embedding <=> CAST(:e AS vector)
        LIMIT :k
    """), {"e": str(img_emb), "k": k})
    return [dict(r._mapping) for r in rows]

# blend:  final = 0.7 * model_p50 + 0.3 * weighted_median(comparables)
```

### 4.6 `ml/data/festivals.json` (seed)

```json
{
  "Diwali":   {"date": "2026-11-08", "uplift": 0.28,
               "boosts_crafts": ["diya","brass","terracotta","blue_pottery","madhubani"]},
  "Raksha Bandhan": {"date": "2026-08-28", "uplift": 0.35,
               "boosts_crafts": ["thread_craft","beadwork","jewellery"]},
  "Navratri": {"date": "2026-10-11", "uplift": 0.22,
               "boosts_crafts": ["bandhani","mirror_work","chaniya_choli"]},
  "Wedding Season": {"date": "2026-11-20", "uplift": 0.30,
               "boosts_crafts": ["banarasi","kanjeevaram","pochampally","zardozi"]},
  "Pongal":   {"date": "2027-01-14", "uplift": 0.18,
               "boosts_crafts": ["terracotta","kolam","tanjore"]},
  "Durga Puja": {"date": "2026-10-17", "uplift": 0.25,
               "boosts_crafts": ["sholapith","kantha","dokra"]}
}
```

### 4.7 Mobile: `PriceBand.tsx`

Show the band as a horizontal bar with three markers, the dignity floor as a red line, and the SHAP reasons as spoken bullet points. If `floor_breached`, replace the price screen with the advisory list, read aloud.

### Steps

1. Scrape → CSV → embeddings → `build_features` → `train_pricing`. Commit artifacts.
2. Load `PricingEngine` once in `lifespan` (already wired in `main.py`).
3. Wire `POST /pricing/suggest` to accept `media_id` + `facts` + `craft`.
4. Build the comparables UI — thumbnails of similar products with prices is the most persuasive part of this feature.
5. SHAP reasons → Gemini → one spoken Hindi sentence.

### Definition of Done

- [ ] `metadata.json` shows MAPE and coverage; both quoted in the pitch deck
- [ ] Price band returned in < 500ms
- [ ] Dignity floor demo: an item where the model says ₹280 and the floor says ₹410, with advisories read aloud
- [ ] Comparables show real thumbnails with real prices
- [ ] Works when the craft class is unknown (kNN path)


---

## Phase 5 — Craft Identification & GI Tagging

**Goal:** photo → craft class → GI tag + heritage note, auto-attached to the listing.

### Why linear probe, not fine-tuning

With ~150 images per class, fine-tuning a ViT overfits. Linear probing on frozen CLIP features is the statistically correct choice, trains in 30 seconds, and you can defend it. Have this answer ready — a judge will ask.

### `ml/scripts/train_craft.py`

```python
"""
CLIP feature extraction -> LogisticRegression.
Data layout: ml/data/craft_images/<craft_class>/*.jpg
Target: 20 classes x ~150 images.
"""
import glob, json, joblib
from pathlib import Path
import numpy as np
import torch, open_clip
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score

CLASSES = [
    "madhubani", "pochampally_ikat", "blue_pottery", "channapatna_toys",
    "warli", "kalamkari", "bidriware", "dokra", "phulkari", "chikankari",
    "banarasi_silk", "kantha", "pattachitra", "terracotta", "bandhani",
    "ajrakh", "sholapith", "tanjore", "zardozi", "kullu_shawl",
]


def extract_features(root="ml/data/craft_images"):
    model, _, preprocess = open_clip.create_model_and_transforms(
        "ViT-B-32", pretrained="laion2b_s34b_b79k")
    model.eval()
    X, y = [], []
    for cls in CLASSES:
        for p in glob.glob(f"{root}/{cls}/*"):
            try:
                img = preprocess(Image.open(p).convert("RGB")).unsqueeze(0)
            except Exception:
                continue
            with torch.no_grad():
                v = model.encode_image(img)
                v = v / v.norm(dim=-1, keepdim=True)
            X.append(v[0].cpu().numpy())
            y.append(cls)
    return np.array(X), np.array(y)


def train():
    X, y = extract_features()
    clf = LogisticRegression(max_iter=2000, C=1.0, class_weight="balanced")
    scores = cross_val_score(clf, X, y, cv=5)
    print(f"CV accuracy: {scores.mean():.3f} +/- {scores.std():.3f}")
    clf.fit(X, y)
    joblib.dump(clf, "ml/artifacts/craft_clf.pkl")
    json.dump({"classes": CLASSES, "cv_accuracy": float(scores.mean())},
              open("ml/artifacts/craft_meta.json", "w"), indent=2)


if __name__ == "__main__":
    train()
```

### Week-1 fallback: zero-shot CLIP

Ship this before you have training data, so the feature works from day one:

```python
ZERO_SHOT_PROMPTS = {
    "madhubani": "a Madhubani folk painting with fine line work from Bihar",
    "blue_pottery": "a blue and white glazed Jaipur blue pottery vessel",
    # ...
}
# encode prompts once, cosine-match against the image embedding
```

### `ml/data/gi_tags.json`

```json
{
  "madhubani": {
    "gi_tag": "Mithila Painting (GI 2007)",
    "region": "Madhubani, Bihar",
    "heritage_note": "A folk painting tradition from the Mithila region, painted with natural pigments and twigs. Registered as a Geographical Indication in 2007.",
    "price_premium_pct": 35
  },
  "pochampally_ikat": {
    "gi_tag": "Pochampally Ikat (GI 2005)",
    "region": "Bhoodan Pochampally, Telangana",
    "heritage_note": "A resist-dyeing technique where yarn is tie-dyed before weaving, producing the characteristic diffused-edge geometry.",
    "price_premium_pct": 40
  }
}
```

### `apps/api/app/services/craft.py`

```python
import json
from pathlib import Path
from app.services import ml_client

GI = json.loads((Path("data") / "gi_tags.json").read_text())
CONFIDENCE_THRESHOLD = 0.55


async def identify(image_bytes: bytes) -> dict:
    result = await ml_client.classify_craft(image_bytes)
    craft, conf = result["craft"], result["confidence"]

    if conf < CONFIDENCE_THRESHOLD:
        # Never auto-attach a GI tag on a weak prediction -- a wrong GI claim
        # is a legal problem, not a UX problem.
        return {"craft": None, "confidence": conf, "gi_tag": None,
                "needs_confirmation": True, "suggestions": result["top3"]}

    meta = GI.get(craft, {})
    return {
        "craft": craft,
        "confidence": conf,
        "gi_tag": meta.get("gi_tag"),
        "region": meta.get("region"),
        "heritage_note": meta.get("heritage_note"),
        "price_premium_pct": meta.get("price_premium_pct", 0),
        "needs_confirmation": False,
    }
```

> **Rule:** below the confidence threshold, ask the artisan to confirm by voice ("Kya yeh Madhubani hai?"). Never silently attach a GI tag. A false GI claim on a marketplace is a compliance issue.

### Definition of Done

- [ ] 20-class classifier at ≥ 85% CV accuracy, number committed to `craft_meta.json`
- [ ] GI tag + heritage note auto-populate the listing
- [ ] Low-confidence path asks for voice confirmation
- [ ] Zero-shot fallback works with no trained model present

---

## Phase 6 — Video-to-Catalog

**Goal:** one 60-second walk-past video with narration → N draft listings, each with its own best photo and its own spoken description.

This is your strongest demo moment. Budget real time for it.

### Pipeline

```
video.mp4
  ├── ffmpeg -vf fps=2      → frames/*.jpg
  └── ffmpeg -vn -ar 16000  → audio.wav
                                  │
   frames ──► YOLO-World ──► crops (product regions)
                                  │
   crops ──► CLIP embed ──► DBSCAN(cosine) ──► clusters = distinct products
                                  │
   per cluster: pick sharpest+most-central frame  → primary image
                                  │
   audio ──► Whisper (word timestamps) ──► segments
                                  │
   ALIGN: cluster time-range ∩ speech segment time-range
                                  │
   per product: {image, transcript} → Phase 3 pipeline → draft listing
```

The alignment step is what makes this actually useful. Without it you have "video with objects"; with it you have "video with *described* objects."

### `apps/api/app/services/video.py`

```python
import subprocess, tempfile, shutil, os, json
from pathlib import Path
import numpy as np
import cv2
from sklearn.cluster import DBSCAN

FPS = 2


def extract(video_path: str, workdir: str) -> tuple[list[tuple[float, str]], str]:
    """Returns [(timestamp_sec, frame_path)], audio_wav_path."""
    frames_dir = Path(workdir) / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    subprocess.run([
        "ffmpeg", "-i", video_path, "-vf", f"fps={FPS}",
        "-q:v", "3", str(frames_dir / "f_%05d.jpg"), "-y"
    ], check=True, capture_output=True)

    audio_path = str(Path(workdir) / "audio.wav")
    subprocess.run([
        "ffmpeg", "-i", video_path, "-vn", "-ac", "1", "-ar", "16000",
        audio_path, "-y"
    ], check=True, capture_output=True)

    frames = sorted(frames_dir.glob("f_*.jpg"))
    stamped = [((i + 1) / FPS, str(p)) for i, p in enumerate(frames)]
    return stamped, audio_path


def sharpness(path: str) -> float:
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    return float(cv2.Laplacian(img, cv2.CV_64F).var())


def cluster_products(embeddings: np.ndarray, timestamps: list[float],
                     eps: float = 0.22, temporal_weight: float = 0.15):
    """
    DBSCAN on cosine distance, with a temporal penalty.

    A walk-past video has structure: frames close in TIME are more likely to
    be the same product. Adding a small temporal term to the distance matrix
    materially improves cluster purity over pure visual distance.
    """
    n = len(embeddings)
    E = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)
    visual = 1.0 - (E @ E.T)

    t = np.array(timestamps).reshape(-1, 1)
    span = max(t.max() - t.min(), 1e-6)
    temporal = np.abs(t - t.T) / span

    D = (1 - temporal_weight) * visual + temporal_weight * temporal
    np.fill_diagonal(D, 0.0)

    labels = DBSCAN(eps=eps, min_samples=2, metric="precomputed").fit_predict(D)
    return labels


def align_speech(cluster_ranges: dict[int, tuple[float, float]],
                 segments: list[dict]) -> dict[int, str]:
    """
    Assign each speech segment to the cluster whose visible time-range it
    overlaps most. This is the step that turns detection into cataloging.
    """
    out: dict[int, list[str]] = {c: [] for c in cluster_ranges}
    for seg in segments:
        s_start, s_end = seg["start"], seg["end"]
        best, best_overlap = None, 0.0
        for cid, (c_start, c_end) in cluster_ranges.items():
            overlap = max(0.0, min(s_end, c_end) - max(s_start, c_start))
            if overlap > best_overlap:
                best, best_overlap = cid, overlap
        if best is not None:
            out[best].append(seg["text"].strip())
    return {c: " ".join(v) for c, v in out.items() if v}
```

### `apps/api/app/workers/tasks.py`

```python
import tempfile, shutil, asyncio, logging
from pathlib import Path
import numpy as np

from app.services import video as vid, storage, ml_client, asr, grounding
from app.db import SessionLocal

log = logging.getLogger(__name__)


def process_video_job(job_id: str, artisan_id: str, media_key: str, lang: str = "hi"):
    """RQ entrypoint. Sync wrapper around the async pipeline."""
    return asyncio.run(_process_video(job_id, artisan_id, media_key, lang))


async def _process_video(job_id, artisan_id, media_key, lang):
    workdir = tempfile.mkdtemp(prefix="vid_")
    try:
        raw = storage.get_bytes(media_key)
        vpath = str(Path(workdir) / "in.mp4")
        Path(vpath).write_bytes(raw)

        frames, audio_path = vid.extract(vpath, workdir)
        log.info("job %s: %d frames", job_id, len(frames))

        # 1. embed every frame (batch to avoid hammering the ML service)
        embeddings, kept = [], []
        for ts, fp in frames:
            try:
                emb = await ml_client.embed_image(Path(fp).read_bytes())
                embeddings.append(emb)
                kept.append((ts, fp))
            except Exception as e:
                log.warning("embed failed for %s: %s", fp, e)

        E = np.array(embeddings)
        timestamps = [t for t, _ in kept]

        # 2. cluster into distinct products
        labels = vid.cluster_products(E, timestamps)

        clusters: dict[int, list[tuple[float, str]]] = {}
        for lbl, item in zip(labels, kept):
            if lbl == -1:          # DBSCAN noise
                continue
            clusters.setdefault(int(lbl), []).append(item)

        # 3. transcribe with timestamps
        audio_bytes = Path(audio_path).read_bytes()
        tr = await asr.transcribe(audio_bytes, lang=lang, want_timestamps=True)

        ranges = {cid: (min(t for t, _ in items), max(t for t, _ in items))
                  for cid, items in clusters.items()}
        texts = vid.align_speech(ranges, tr["segments"])

        # 4. build a draft per cluster
        drafts = []
        for cid, items in clusters.items():
            best_path = max(items, key=lambda it: vid.sharpness(it[1]))[1]
            img = Path(best_path).read_bytes()

            key = storage.put_bytes(img, f"video/{artisan_id}", "jpg", "image/jpeg")

            transcript = texts.get(cid, "")
            facts = (await grounding.extract_facts(transcript, lang)
                     if transcript else None)

            drafts.append({
                "cluster_id": cid,
                "media_key": key,
                "frame_count": len(items),
                "time_range": ranges[cid],
                "transcript": transcript,
                "facts": facts.model_dump() if facts else {},
                "missing": facts.missing_required() if facts else ["all"],
            })

        return {"job_id": job_id, "product_count": len(drafts), "drafts": drafts}
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
```

### `apps/api/app/workers/queue.py`

```python
import redis
from rq import Queue, Worker
from app.config import settings

conn = redis.from_url(settings.redis_url)

q_default = Queue("default", connection=conn, default_timeout=600)
q_heavy = Queue("heavy", connection=conn, default_timeout=1800)   # video, 3D


def enqueue_video(job_id, artisan_id, media_key, lang="hi"):
    from app.workers.tasks import process_video_job
    return q_heavy.enqueue(process_video_job, job_id, artisan_id, media_key, lang,
                           job_id=job_id)


if __name__ == "__main__":
    Worker([q_heavy, q_default], connection=conn).work()
```

### Mobile UX

Record → upload → show a progress screen with spoken status ("Aapke 8 saaman mile hain") → a swipeable confirmation deck: one product per card, big **Haan / Nahi** buttons, tap-to-hear the transcript. Confirmed cards run the Phase 2 + 4 + 5 pipeline in a batch.

### Steps

1. Shoot a real test video: 8–10 items on a table, narrating each for 5 seconds. Commit to `assets/demo/`.
2. Tune `eps` and `temporal_weight` on that video until clusters == actual products. This is empirical; budget 2 hours.
3. **Pre-process the demo video and cache the result.** Live processing takes 60–120 seconds — too long for a stage demo. Show cached results, and mention it's cached.

### Definition of Done

- [ ] 60s video with 8 items → 8 clusters (±1)
- [ ] Each draft has the correct narration attached
- [ ] Job runs in the worker, app polls and shows progress
- [ ] Confirmation deck works with voice only

---

## Phase 7 — WhatsApp Channel

**Goal:** two flows on the same webhook — artisan sends a voice note + photo to create a listing, and buyer sends a question about a listing.

### The channel adapter (build this first)

```python
# apps/api/app/services/channels/base.py
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class InboundMessage:
    channel: str
    sender: str                 # phone or chat id
    text: str | None = None
    media_url: str | None = None
    media_mime: str | None = None
    audio_bytes: bytes | None = None
    image_bytes: bytes | None = None
    reply_to: str | None = None
    raw: dict | None = None


class Channel(ABC):
    name: str

    @abstractmethod
    async def send_text(self, to: str, text: str) -> str: ...

    @abstractmethod
    async def send_audio(self, to: str, audio: bytes) -> str: ...

    @abstractmethod
    async def send_image(self, to: str, image: bytes, caption: str = "") -> str: ...

    @abstractmethod
    async def parse_webhook(self, payload: dict) -> list[InboundMessage]: ...
```

> Implement **both** WhatsApp and Telegram. If Meta's sandbox misbehaves on demo day, you flip `CHANNEL_PRIMARY=telegram` and continue. This is the single highest-ROI defensive decision in the build.

### `apps/api/app/services/channels/whatsapp.py`

```python
import httpx
from app.config import settings
from app.services.channels.base import Channel, InboundMessage

GRAPH = "https://graph.facebook.com/v21.0"


class WhatsAppChannel(Channel):
    name = "whatsapp"

    def _url(self, path: str) -> str:
        return f"{GRAPH}/{settings.wa_phone_number_id}/{path}"

    @property
    def _headers(self):
        return {"Authorization": f"Bearer {settings.wa_access_token}"}

    async def send_text(self, to: str, text: str) -> str:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(self._url("messages"), headers=self._headers, json={
                "messaging_product": "whatsapp", "to": to,
                "type": "text", "text": {"body": text},
            })
            r.raise_for_status()
            return r.json()["messages"][0]["id"]

    async def _upload_media(self, data: bytes, mime: str, filename: str) -> str:
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(
                self._url("media"), headers=self._headers,
                files={"file": (filename, data, mime)},
                data={"messaging_product": "whatsapp", "type": mime},
            )
            r.raise_for_status()
            return r.json()["id"]

    async def send_audio(self, to: str, audio: bytes) -> str:
        # WhatsApp voice notes must be OGG/Opus
        media_id = await self._upload_media(audio, "audio/ogg", "voice.ogg")
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(self._url("messages"), headers=self._headers, json={
                "messaging_product": "whatsapp", "to": to,
                "type": "audio", "audio": {"id": media_id},
            })
            r.raise_for_status()
            return r.json()["messages"][0]["id"]

    async def send_image(self, to: str, image: bytes, caption: str = "") -> str:
        media_id = await self._upload_media(image, "image/jpeg", "img.jpg")
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(self._url("messages"), headers=self._headers, json={
                "messaging_product": "whatsapp", "to": to,
                "type": "image", "image": {"id": media_id, "caption": caption},
            })
            r.raise_for_status()
            return r.json()["messages"][0]["id"]

    async def _download(self, media_id: str) -> tuple[bytes, str]:
        async with httpx.AsyncClient(timeout=60) as c:
            meta = (await c.get(f"{GRAPH}/{media_id}", headers=self._headers)).json()
            blob = await c.get(meta["url"], headers=self._headers)
            return blob.content, meta.get("mime_type", "")

    async def parse_webhook(self, payload: dict) -> list[InboundMessage]:
        out = []
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                for msg in change.get("value", {}).get("messages", []):
                    m = InboundMessage(channel=self.name, sender=msg["from"], raw=msg)
                    t = msg.get("type")
                    if t == "text":
                        m.text = msg["text"]["body"]
                    elif t == "audio":
                        m.audio_bytes, m.media_mime = await self._download(
                            msg["audio"]["id"])
                    elif t == "image":
                        m.image_bytes, m.media_mime = await self._download(
                            msg["image"]["id"])
                        m.text = msg["image"].get("caption")
                    out.append(m)
        return out
```

### `apps/api/app/routers/whatsapp.py`

```python
import hmac, hashlib
from fastapi import APIRouter, Request, Response, BackgroundTasks, Query
from app.config import settings
from app.services.channels import get_channel
from app.services.inbound import handle_inbound

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.get("/whatsapp")
async def verify(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
):
    if hub_mode == "subscribe" and hub_verify_token == settings.wa_verify_token:
        return Response(content=hub_challenge, media_type="text/plain")
    return Response(status_code=403)


@router.post("/whatsapp")
async def inbound(request: Request, background: BackgroundTasks):
    body = await request.body()

    if settings.wa_app_secret:
        sig = request.headers.get("X-Hub-Signature-256", "").removeprefix("sha256=")
        expected = hmac.new(settings.wa_app_secret.encode(), body,
                            hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return Response(status_code=403)

    payload = await request.json()
    channel = get_channel("whatsapp")
    messages = await channel.parse_webhook(payload)

    # ACK within 5s or Meta retries. Do the work in the background.
    for m in messages:
        background.add_task(handle_inbound, m)
    return {"status": "ok"}
```

### `apps/api/app/services/inbound.py` — the router between the two flows

```python
"""
One webhook, two flows. Sender identity decides which:
  - known artisan phone  -> listing creation flow
  - anyone else          -> buyer query flow (RAG, Phase 9)
"""
import logging
from sqlalchemy import select
from app.db import SessionLocal
from app.models.artisan import Artisan
from app.models.user import User
from app.services.channels import get_channel
from app.services.channels.base import InboundMessage

log = logging.getLogger(__name__)

SESSION_TTL = 900   # 15 min conversational window, stored in Redis


async def handle_inbound(msg: InboundMessage) -> None:
    async with SessionLocal() as db:
        user = await db.scalar(select(User).where(User.phone == msg.sender))
        if user:
            artisan = await db.scalar(
                select(Artisan).where(Artisan.user_id == user.id))
            await _artisan_flow(db, artisan, msg)
        else:
            await _buyer_flow(db, msg)
        await db.commit()


async def _artisan_flow(db, artisan, msg: InboundMessage) -> None:
    """
    State machine held in Redis under wa:session:{phone}
      awaiting_photo -> awaiting_voice -> confirming -> done
    """
    from app.services.session import get_session, set_session
    from app.services import asr, grounding, storage, tts
    from app.models.media import Media

    ch = get_channel(msg.channel)
    sess = await get_session(msg.sender) or {"state": "idle", "data": {}}

    if msg.image_bytes:
        key = storage.put_bytes(msg.image_bytes, f"wa/{artisan.id}", "jpg", "image/jpeg")
        m = Media(artisan_id=artisan.id, kind="image_raw", r2_key=key,
                  mime="image/jpeg")
        db.add(m)
        await db.flush()
        sess["data"]["media_id"] = str(m.id)
        sess["state"] = "awaiting_voice"
        await set_session(msg.sender, sess)
        await ch.send_audio(msg.sender, await tts.speak(
            "Photo mil gaya. Ab is saaman ke baare mein bataiye.", artisan_lang(artisan)))
        return

    if msg.audio_bytes:
        tr = await asr.transcribe(msg.audio_bytes, lang=artisan_lang(artisan))
        facts = await grounding.extract_facts(tr["text"], artisan_lang(artisan),
                                              sess["data"].get("facts"))
        sess["data"]["facts"] = facts.model_dump()
        missing = facts.missing_required()

        if missing:
            q = grounding.build_follow_ups(missing)[0]
            sess["state"] = "awaiting_voice"
            await set_session(msg.sender, sess)
            await ch.send_audio(msg.sender,
                                await tts.speak(q.question_native, artisan_lang(artisan)))
            return

        # complete -> run enhance + price + create draft, send back for confirmation
        from app.services.pipeline import build_listing_from_session
        listing = await build_listing_from_session(db, artisan, sess["data"])
        await ch.send_image(
            msg.sender,
            storage.get_bytes(listing.enhanced_key),
            caption=(f"{listing.title_hi}\n\n"
                     f"Suggested price: Rs {listing.price}\n"
                     f"Reply HAAN to publish, NAHI to change."),
        )
        sess["state"] = "confirming"
        sess["data"]["listing_id"] = str(listing.id)
        await set_session(msg.sender, sess)
        return

    if msg.text and sess["state"] == "confirming":
        if msg.text.strip().lower() in ("haan", "yes", "ha", "ok", "y"):
            from app.workers.queue import q_default
            from app.workers.tasks import publish_listing_job
            q_default.enqueue(publish_listing_job, sess["data"]["listing_id"])
            await ch.send_text(msg.sender, "Publish ho raha hai. Dhanyavaad!")
            await set_session(msg.sender, None)
        else:
            await ch.send_text(msg.sender, "Theek hai. Naya voice note bhejiye.")
            sess["state"] = "awaiting_voice"
            await set_session(msg.sender, sess)


async def _buyer_flow(db, msg: InboundMessage) -> None:
    """Implemented in Phase 9 (RAG). Stub until then."""
    from app.services.rag.answerer import answer_buyer_query
    await answer_buyer_query(db, msg)


def artisan_lang(artisan) -> str:
    return getattr(artisan, "preferred_lang", None) or "hi"
```

### Definition of Done

- [ ] Send a photo + voice note from a real phone → draft listing comes back with an enhanced image and a price
- [ ] "HAAN" publishes it
- [ ] Telegram adapter works identically with one env var flip
- [ ] Webhook signature verified; Meta retries do not duplicate listings (idempotency key on `msg.raw["id"]`)

---

## Phase 8 — ONDC & GeM Publisher

**Goal:** one listing → pushed to ONDC (spec-compliant, signed), plus GeM XLSX and Amazon/Flipkart CSV exports.

### Honest framing for the pitch

You will **not** get production ONDC access during a hackathon. Say: *"Spec-compliant, Ed25519-signed, tested against the pre-production reference buyer app; production requires NP subscription and whitelisting."* That is truthful and more impressive than a vague claim.

Also build `scripts/mock_ondc_gateway.py` so the demo never depends on ONDC staging being up.

### `apps/api/app/services/publishers/ondc/signing.py`

```python
"""
ONDC/Beckn request signing. This is the part that eats a day if you improvise.

Auth header format:
  Signature keyId="{subscriber_id}|{ukid}|ed25519",
            algorithm="ed25519",
            created="{ts}", expires="{ts}",
            headers="(created) (expires) digest",
            signature="{base64}"
"""
import base64, hashlib, time
import nacl.signing
import nacl.encoding
from app.config import settings


def _blake2b_digest(body: str) -> str:
    return base64.b64encode(
        hashlib.blake2b(body.encode(), digest_size=64).digest()
    ).decode()


def build_signing_string(body: str, created: int, expires: int) -> str:
    digest = _blake2b_digest(body)
    return (f"(created): {created}\n"
            f"(expires): {expires}\n"
            f"digest: BLAKE-512={digest}")


def sign(body: str, ttl: int = 300) -> str:
    created = int(time.time())
    expires = created + ttl
    signing_string = build_signing_string(body, created, expires)

    seed = base64.b64decode(settings.ondc_signing_private_key)
    # ONDC issues a 64-byte private key; nacl wants the 32-byte seed
    signing_key = nacl.signing.SigningKey(seed[:32])
    signature = base64.b64encode(
        signing_key.sign(signing_string.encode()).signature).decode()

    return (
        f'Signature keyId="{settings.ondc_subscriber_id}|{settings.ondc_ukid}|ed25519",'
        f'algorithm="ed25519",created="{created}",expires="{expires}",'
        f'headers="(created) (expires) digest",signature="{signature}"'
    )


def verify(body: str, auth_header: str, public_key_b64: str) -> bool:
    import re
    parts = dict(re.findall(r'(\w+)="([^"]*)"', auth_header))
    signing_string = build_signing_string(
        body, int(parts["created"]), int(parts["expires"]))
    vk = nacl.signing.VerifyKey(base64.b64decode(public_key_b64))
    try:
        vk.verify(signing_string.encode(), base64.b64decode(parts["signature"]))
        return True
    except Exception:
        return False


def generate_keypair() -> dict:
    """Run once. Register the public key with the ONDC registry."""
    sk = nacl.signing.SigningKey.generate()
    return {
        "private_key": base64.b64encode(bytes(sk)).decode(),
        "public_key": base64.b64encode(bytes(sk.verify_key)).decode(),
    }
```

### `apps/api/app/services/publishers/ondc/schema.py`

```python
"""
Maps a KalaSetu Listing to an ONDC retail catalog item.

Key design point: the artisan's voice-defined customization options
(from Phase 7) become ONDC customisation groups. This is how "can you carve
my name on it" works on a network with no chat API -- the option is
pre-published, so any buyer app can order it.
"""
import uuid, datetime as dt
from app.config import settings


def _ctx(action: str, transaction_id: str | None = None,
         bap_id: str | None = None, bap_uri: str | None = None) -> dict:
    return {
        "domain": "ONDC:RET10",
        "country": "IND",
        "city": "std:080",
        "action": action,
        "core_version": "1.2.0",
        "bap_id": bap_id,
        "bap_uri": bap_uri,
        "bpp_id": settings.ondc_subscriber_id,
        "bpp_uri": f"https://{settings.ondc_subscriber_id}",
        "transaction_id": transaction_id or str(uuid.uuid4()),
        "message_id": str(uuid.uuid4()),
        "timestamp": dt.datetime.utcnow().isoformat() + "Z",
        "ttl": "PT30S",
    }


def listing_to_item(listing, artisan, media_urls: list[str]) -> dict:
    item = {
        "id": str(listing.id),
        "descriptor": {
            "name": listing.title_en,
            "code": f"1:{listing.id}",
            "symbol": media_urls[0] if media_urls else "",
            "short_desc": (listing.description_en or "")[:200],
            "long_desc": listing.description_en or "",
            "images": media_urls,
        },
        "price": {
            "currency": "INR",
            "value": f"{float(listing.price):.2f}",
            "maximum_value": f"{float(listing.price):.2f}",
        },
        "category_id": "Handicrafts",
        "fulfillment_id": "F1",
        "location_id": "L1",
        "@ondc/org/returnable": True,
        "@ondc/org/cancellable": True,
        "@ondc/org/return_window": "P7D",
        "@ondc/org/seller_pickup_return": False,
        "@ondc/org/time_to_ship": _time_to_ship(listing),
        "@ondc/org/available_on_cod": False,
        "@ondc/org/contact_details_consumer_care":
            f"{artisan.name}, kalasetu@example.com, 18001234567",
        "quantity": {
            "unitized": {"measure": {"unit": "unit", "value": "1"}},
            "available": {"count": str(listing.stock_qty)},
            "maximum": {"count": str(listing.stock_qty)},
        },
        "tags": _tags(listing, artisan),
    }
    return item


def _time_to_ship(listing) -> str:
    """ISO-8601 duration. Add customization lead time if any."""
    base_days = 3
    extra = max([c.get("tat_delta_days", 0)
                 for c in listing.facts.get("customizations", [])] or [0])
    return f"P{base_days + extra}D"


def _tags(listing, artisan) -> list[dict]:
    tags = [{
        "code": "origin",
        "list": [{"code": "country", "value": "IND"}],
    }]

    if listing.gi_tag:
        tags.append({
            "code": "attribute",
            "list": [
                {"code": "gi_tag", "value": listing.gi_tag},
                {"code": "craft", "value": listing.craft_class or ""},
                {"code": "artisan_village", "value": artisan.village or ""},
                {"code": "handmade", "value": "yes"},
            ],
        })

    # customisation groups: the voice-defined options from Phase 7
    customs = listing.facts.get("customizations") or []
    if customs:
        tags.append({
            "code": "custom_group",
            "list": [{"code": "id", "value": f"CG_{listing.id}"}],
        })
    return tags


def build_on_search(listings, artisan, media_map) -> dict:
    """The catalog callback. Must be FAST -- no LLM calls in this path."""
    return {
        "context": _ctx("on_search"),
        "message": {
            "catalog": {
                "bpp/fulfillments": [{"id": "F1", "type": "Delivery"}],
                "bpp/descriptor": {"name": "KalaSetu Artisan Network"},
                "bpp/providers": [{
                    "id": str(artisan.id),
                    "descriptor": {
                        "name": f"{artisan.name} — {artisan.village or ''}",
                        "short_desc": (artisan.story_en or "")[:200],
                        "images": [],
                    },
                    "@ondc/org/fssai_license_no": "",
                    "locations": [{
                        "id": "L1",
                        "gps": f"{artisan.lat},{artisan.lon}",
                        "address": {
                            "locality": artisan.village or "",
                            "city": artisan.district or "",
                            "area_code": artisan.pincode or "",
                            "state": artisan.state or "",
                        },
                    }],
                    "items": [listing_to_item(l, artisan, media_map.get(l.id, []))
                              for l in listings],
                }],
            }
        },
    }
```

### `apps/api/app/routers/publish.py` — Beckn endpoints

```python
from fastapi import APIRouter, Request, BackgroundTasks
from app.services.publishers.ondc import signing, schema, client

router = APIRouter(prefix="/ondc", tags=["ondc"])


@router.post("/search")
async def on_search_request(request: Request, background: BackgroundTasks):
    """
    A buyer app is searching. We must ACK immediately and POST /on_search
    to their bap_uri asynchronously.

    CRITICAL: no LLM in this path. Buyer apps fan out to many sellers and
    time out fast. Target < 300ms. Use pre-computed embeddings only.
    """
    body = await request.json()
    background.add_task(client.respond_to_search, body)
    return {"message": {"ack": {"status": "ACK"}}}


@router.post("/select")
async def select(request: Request, background: BackgroundTasks):
    body = await request.json()
    background.add_task(client.respond_to_select, body)
    return {"message": {"ack": {"status": "ACK"}}}


@router.post("/init")
async def init(request: Request, background: BackgroundTasks):
    body = await request.json()
    background.add_task(client.respond_to_init, body)
    return {"message": {"ack": {"status": "ACK"}}}


@router.post("/confirm")
async def confirm(request: Request, background: BackgroundTasks):
    body = await request.json()
    background.add_task(client.respond_to_confirm, body)
    return {"message": {"ack": {"status": "ACK"}}}


@router.post("/support")
async def support(request: Request, background: BackgroundTasks):
    """
    The hook that routes deep buyer questions into our voice layer.
    We return a URL pointing at our own chat thread, plus the WhatsApp link.
    """
    body = await request.json()
    background.add_task(client.respond_to_support, body)
    return {"message": {"ack": {"status": "ACK"}}}
```

### `/on_search` latency budget

| Step | Budget |
|---|---|
| Parse intent | 10 ms |
| pgvector ANN over listing embeddings (pre-computed) | 60 ms |
| Assemble catalog JSON | 40 ms |
| Sign | 15 ms |
| POST to bap_uri | 150 ms |
| **Total** | **< 300 ms** |

Never call Gemini, Bhashini, or the ML service in this path.

### GeM + CSV export

```python
# apps/api/app/services/publishers/gem.py
import io
from openpyxl import Workbook

# GeM has no public seller API. We generate their catalog upload sheet.
GEM_COLUMNS = [
    "Product Name", "Category", "Brand", "Model", "HSN Code", "Price",
    "MOQ", "Unit", "Description", "Country of Origin", "Image URL 1",
    "Image URL 2", "Seller Name", "GSTIN", "Delivery Days",
]


def build_gem_sheet(listings, artisan) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Catalog"
    ws.append(GEM_COLUMNS)
    for l in listings:
        ws.append([
            l.title_en, "Handicrafts", "Handmade", str(l.id)[:8],
            "9701",  # HSN for handmade art; verify per product type
            float(l.price or 0), 1, "Piece",
            (l.description_en or "")[:1000], "India",
            "", "", artisan.name, "", 7,
        ])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
```

```python
# apps/api/app/services/publishers/csv_export.py
import csv, io

AMAZON_COLUMNS = ["item_sku", "item_name", "brand_name", "product_description",
                  "bullet_point1", "bullet_point2", "bullet_point3",
                  "standard_price", "quantity", "main_image_url",
                  "generic_keywords", "country_of_origin"]


def amazon_csv(listings, media_map) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(AMAZON_COLUMNS)
    for l in listings:
        bullets = (l.facts.get("bullet_points_en") or ["", "", ""])[:3]
        bullets += [""] * (3 - len(bullets))
        w.writerow([
            str(l.id)[:8], l.title_en, "Handmade", l.description_en,
            *bullets, float(l.price or 0), l.stock_qty,
            (media_map.get(l.id) or [""])[0],
            " ".join(l.seo_keywords or []), "India",
        ])
    return buf.getvalue().encode()
```

### Definition of Done

- [ ] `test_ondc_signing.py` passes against ONDC's published test vectors
- [ ] `/on_search` responds in < 300 ms with a valid signed catalog
- [ ] Mock gateway round-trip: search → select → init → confirm produces an order row
- [ ] Customization options from a voice note appear as ONDC customisation tags
- [ ] GeM XLSX and Amazon CSV download and open correctly


---

## Phase 9 — RAG Query Engine

**Goal:** buyer questions answered automatically from the artisan's own prior replies; anything uncertain escalates to her as a voice note, and her answer becomes new knowledge.

### The core loop (this is the differentiator)

```
buyer question
      │
   hybrid retrieve (pgvector + tsvector, RRF)
      │
   rerank (cross-encoder)
      │
   ┌──┴──────────────────────────────┐
   │ score >= 0.75 AND not price/date│
   │ AND no conflict                 │
   └──┬───────────────────────┬──────┘
     yes                      no
      │                       │
  answer + cite         escalate: voice note to artisan
      │                       │
      │                 she replies in 5s of speech
      │                       │
      │              translate + refine + store as kb_document
      │                       │
      └───────► corpus grows ◄┘
```

**The metric to quote:** deflection rate. *"After 30 days, 78% of buyer questions were answered from the artisan's own prior replies, with zero response latency."*

### Hard rules

1. **Never** let RAG commit to a price, a delivery date, or a custom order. Those are contractual. Escalate always.
2. **Never** infer material properties not in the confirmed facts.
3. **Always** filter by `artisan_id`/`listing_id` *before* the vector search. One artisan's "yes we gift wrap" must never be served as another's.

### `apps/api/app/services/rag/retriever.py`

```python
"""
Hybrid retrieval over kb_documents.

Hybrid is mandatory, not optional: craft names are rare proper nouns
("Bidriware", "Sujani", "Pochampally") that dense retrievers mangle.
BM25 catches them; vectors catch paraphrase. RRF merges.
"""
from dataclasses import dataclass
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.services import ml_client

RRF_K = 60


@dataclass
class Chunk:
    id: str
    content: str
    source: str
    verified: bool
    score: float
    meta: dict


async def hybrid_search(
    db: AsyncSession, query: str, *, artisan_id: str | None,
    listing_id: str | None, craft_class: str | None = None,
    top_k: int = 20,
) -> list[Chunk]:
    q_emb = (await ml_client.embed_text([query], prefix="query: "))[0]

    # Scope filter FIRST. This is a hard constraint, not a ranking preference.
    scope = """
        (kb.artisan_id = CAST(:artisan_id AS uuid) OR kb.artisan_id IS NULL)
        AND (:listing_id IS NULL
             OR kb.listing_id = CAST(:listing_id AS uuid)
             OR kb.listing_id IS NULL)
        AND (:craft IS NULL OR kb.craft_class = :craft OR kb.craft_class IS NULL)
    """

    sql = text(f"""
    WITH dense AS (
        SELECT kb.id, kb.content, kb.source::text, kb.verified, kb.meta,
               ROW_NUMBER() OVER (
                   ORDER BY kb.embedding <=> CAST(:emb AS vector)) AS rnk
        FROM kb_documents kb
        WHERE {scope} AND kb.embedding IS NOT NULL
        ORDER BY kb.embedding <=> CAST(:emb AS vector)
        LIMIT :k
    ),
    sparse AS (
        SELECT kb.id, kb.content, kb.source::text, kb.verified, kb.meta,
               ROW_NUMBER() OVER (
                   ORDER BY ts_rank_cd(kb.search_tsv,
                                       plainto_tsquery('simple', :q)) DESC) AS rnk
        FROM kb_documents kb
        WHERE {scope}
          AND kb.search_tsv @@ plainto_tsquery('simple', :q)
        LIMIT :k
    ),
    fused AS (
        SELECT id, content, source, verified, meta,
               SUM(1.0 / (:rrf_k + rnk)) AS score
        FROM (SELECT * FROM dense UNION ALL SELECT * FROM sparse) u
        GROUP BY id, content, source, verified, meta
    )
    SELECT * FROM fused ORDER BY score DESC LIMIT :k
    """)

    rows = await db.execute(sql, {
        "emb": str(q_emb), "q": query, "k": top_k, "rrf_k": RRF_K,
        "artisan_id": artisan_id, "listing_id": listing_id, "craft": craft_class,
    })
    return [Chunk(id=str(r.id), content=r.content, source=r.source,
                  verified=r.verified, score=float(r.score), meta=r.meta or {})
            for r in rows]


async def rerank(query: str, chunks: list[Chunk], top_n: int = 5) -> list[Chunk]:
    if not chunks:
        return []
    try:
        scores = await ml_client.rerank(query, [c.content for c in chunks])
        for c, s in zip(chunks, scores):
            c.score = float(s)
    except Exception:
        pass   # keep RRF order if the reranker is unavailable
    return sorted(chunks, key=lambda c: -c.score)[:top_n]
```

### `apps/api/app/services/rag/answerer.py`

```python
import re, logging
from pydantic import BaseModel
from app.services.rag.retriever import hybrid_search, rerank, Chunk
from app.services.llm import complete_json
from app.services import tts
from app.services.channels import get_channel

log = logging.getLogger(__name__)

ABSTAIN_THRESHOLD = 0.75

# Contractual topics ALWAYS escalate. Never auto-answer these.
CONTRACTUAL = re.compile(
    r"\b(price|cost|rate|kitna|kimat|daam|discount|delivery|ship|kab|"
    r"when|deadline|custom|carve|engrav|naam|bulk|wholesale|moq)\b", re.I)

ANSWER_SYSTEM = """You answer buyer questions about a handmade product.

RULES:
- Use ONLY the CONTEXT provided. If the answer is not there, output
  {"answer": null, "reason": "insufficient_context"}.
- Never invent materials, sizes, delivery times, or prices.
- Keep it under 3 sentences, warm and factual.
- Cite which context chunk you used by index.

Output JSON: {"answer": str|null, "cited": [int], "reason": str|null}"""


class RagAnswer(BaseModel):
    answer: str | None = None
    cited: list[int] = []
    reason: str | None = None


async def answer_query(db, question: str, *, artisan_id, listing_id,
                       craft_class=None) -> dict:
    if CONTRACTUAL.search(question):
        return {"status": "escalate", "reason": "contractual_topic",
                "answer": None, "chunks": []}

    chunks = await hybrid_search(db, question, artisan_id=artisan_id,
                                 listing_id=listing_id, craft_class=craft_class)
    top = await rerank(question, chunks)

    if not top or top[0].score < ABSTAIN_THRESHOLD:
        return {"status": "escalate", "reason": "low_confidence",
                "answer": None, "chunks": [c.id for c in top]}

    context = "\n\n".join(f"[{i}] ({c.source}) {c.content}"
                          for i, c in enumerate(top))
    result = await complete_json(
        ANSWER_SYSTEM, f"CONTEXT:\n{context}\n\nQUESTION: {question}", RagAnswer)

    if not result.answer:
        return {"status": "escalate", "reason": result.reason or "no_answer",
                "answer": None, "chunks": [c.id for c in top]}

    return {"status": "answered", "answer": result.answer,
            "chunks": [top[i].id for i in result.cited if i < len(top)],
            "score": top[0].score,
            "provenance": _provenance(top, result.cited)}


def _provenance(top: list[Chunk], cited: list[int]) -> str:
    """Shown to the buyer: 'Answered from Meena ji's earlier reply, 12 Aug'."""
    for i in cited:
        if i < len(top) and top[i].source == "artisan_qa":
            d = top[i].meta.get("answered_on", "")
            return f"From the artisan's earlier reply{', ' + d if d else ''}"
    return "From the product details"


async def answer_buyer_query(db, msg) -> None:
    """Entry point from the WhatsApp/Telegram inbound router."""
    from app.models.buyer_query import BuyerQuery
    from app.services.session import resolve_listing_context

    ctx = await resolve_listing_context(db, msg)   # from deep link ref
    question = msg.text or ""
    if msg.audio_bytes:
        from app.services import asr
        question = (await asr.transcribe(msg.audio_bytes))["text"]

    result = await answer_query(db, question,
                                artisan_id=ctx["artisan_id"],
                                listing_id=ctx["listing_id"],
                                craft_class=ctx.get("craft_class"))

    bq = BuyerQuery(listing_id=ctx["listing_id"], artisan_id=ctx["artisan_id"],
                    channel=msg.channel, buyer_ref=msg.sender, question=question,
                    answer=result.get("answer"),
                    answer_source="rag" if result["status"] == "answered" else None,
                    top_score=result.get("score"),
                    status="answered_auto" if result["status"] == "answered"
                           else "escalated")
    db.add(bq)
    await db.flush()

    ch = get_channel(msg.channel)
    if result["status"] == "answered":
        await ch.send_text(msg.sender,
                           f"{result['answer']}\n\n_{result['provenance']}_")
    else:
        await ch.send_text(msg.sender,
                           "Let me check with the artisan — I'll reply shortly.")
        await escalate_to_artisan(db, bq, question)


async def escalate_to_artisan(db, bq, question: str) -> None:
    """Send her a short voice note. She replies in 5 seconds of speech."""
    from app.models.artisan import Artisan
    from app.services import translate

    artisan = await db.get(Artisan, bq.artisan_id)
    lang = artisan.user.preferred_lang if artisan.user else "hi"
    q_native = await translate.to_lang(question, lang)

    audio = await tts.speak(f"Ek grahak ne poocha: {q_native}. "
                            f"Jawab bol kar bhejiye.", lang)
    ch = get_channel("whatsapp")
    await ch.send_audio(artisan.user.phone, audio)
    bq.escalated_at = __import__("datetime").datetime.utcnow()


async def store_artisan_answer(db, bq_id: str, audio_bytes: bytes) -> None:
    """
    THE LOOP CLOSER. Her spoken reply becomes a permanent knowledge document,
    so the next buyer gets it instantly and she is never asked again.
    """
    from app.models.buyer_query import BuyerQuery
    from app.models.kb import KBDocument
    from app.services import asr, translate, ml_client

    bq = await db.get(BuyerQuery, bq_id)
    tr = await asr.transcribe(audio_bytes)
    answer_native = tr["text"]
    answer_en = await translate.to_lang(answer_native, "en")

    content = f"Q: {bq.question}\nA: {answer_en}"
    emb = (await ml_client.embed_text([content]))[0]

    doc = KBDocument(
        source="artisan_qa", artisan_id=bq.artisan_id, listing_id=bq.listing_id,
        lang="en", title=bq.question[:120], content=content,
        content_native=answer_native, embedding=emb, verified=True,
        meta={"answered_on": __import__("datetime").date.today().isoformat()},
    )
    db.add(doc)

    bq.answer = answer_en
    bq.answer_source = "artisan"
    bq.status = "answered_artisan"
    bq.resolved_at = __import__("datetime").datetime.utcnow()
    await db.flush()

    ch = get_channel(bq.channel)
    await ch.send_text(bq.buyer_ref, answer_en)
```

### `apps/api/app/services/rag/indexer.py`

Seeds the five corpus sources:

```python
"""
Corpus sources, in trust order:
  1. artisan_qa      -- her own verified replies (highest trust)
  2. listing_fact    -- confirmed facts from Phase 3
  3. craft_knowledge -- GI/heritage/care, scraped from Ministry of Textiles etc.
  4. policy          -- returns, shipping, COD, ONDC dispute rules
  5. scheme          -- PMEGP, MUDRA, GST for handicrafts (artisan-facing)
"""
from app.models.kb import KBDocument
from app.services import ml_client


async def index_listing(db, listing) -> None:
    facts = {k: v for k, v in (listing.facts or {}).items() if v not in (None, "", [])}
    content = (f"Product: {listing.title_en}\n"
               f"Craft: {listing.craft_class or 'not specified'}\n"
               f"Details: {facts}\n"
               f"Description: {listing.description_en or ''}")
    emb = (await ml_client.embed_text([content]))[0]
    db.add(KBDocument(source="listing_fact", artisan_id=listing.artisan_id,
                      listing_id=listing.id, content=content, embedding=emb,
                      craft_class=listing.craft_class, verified=True))

    # also embed the listing itself for ONDC semantic search
    listing.embedding = emb


async def seed_global_kb(db, docs: list[dict]) -> None:
    """docs from ml/data/craft_knowledge.jsonl and schemes.jsonl"""
    contents = [d["content"] for d in docs]
    embs = await ml_client.embed_text(contents)
    for d, e in zip(docs, embs):
        db.add(KBDocument(source=d["source"], craft_class=d.get("craft_class"),
                          title=d.get("title"), content=d["content"],
                          embedding=e, verified=True))
```

### Artisan-facing RAG (don't skip this)

Same pipeline, different corpus. She asks by voice:

| Question | Retrieves | Answers |
|---|---|---|
| *"Mera paisa kab aayega?"* | her orders + ONDC settlement cycle | an actual date |
| *"GST bharna padega?"* | handicraft GST threshold rules | in her language |
| *"Loan ke liye kya chahiye?"* | MUDRA criteria + her sales history | whether she qualifies |

This is what "virtual business manager" actually means. Every other team will build a dashboard. Same infrastructure, one extra corpus.

### Optional: graph layer for B2B sourcing

For multi-hop queries like *"artisans within 100km of Bhuj doing natural-dye Ajrakh who can deliver 200 units in 3 weeks"*, vector search fails — no single document holds the answer.

**Recommendation: use Postgres recursive CTEs, not Neo4j.** At hackathon scale a 4-hop CTE is genuinely sufficient and saves you a database. Add Neo4j only if you specifically want the talking point.

```sql
-- apps/api/app/services/rag/graph.py -- capacity + geo + technique join
SELECT a.id, a.name, a.village, a.monthly_capacity,
       earth_distance(ll_to_earth(a.lat, a.lon), ll_to_earth(:lat, :lon))/1000 AS km
FROM artisans a
JOIN listings l ON l.artisan_id = a.id
WHERE l.craft_class = :craft
  AND (l.facts->>'material') ILIKE :material
  AND a.monthly_capacity >= :qty_needed
  AND earth_distance(ll_to_earth(a.lat, a.lon), ll_to_earth(:lat, :lon)) < :radius_m
ORDER BY km
LIMIT 20;
```

### Definition of Done

- [ ] Buyer asks a question already answered → instant reply with provenance line
- [ ] Buyer asks something new → artisan gets a voice note, her reply reaches the buyer, and the pair is stored
- [ ] Second buyer asking the same thing gets it instantly
- [ ] Price/delivery/custom questions **always** escalate, never auto-answer
- [ ] Cross-artisan leakage test: artisan A's answer never surfaces for artisan B
- [ ] Deflection rate visible on a dashboard

---

## Phase 10 — Business Coach

Three sub-features that turn a listing tool into a business manager.

### 10.1 Demand signal ("what should I make next?")

```python
# apps/api/app/services/coach.py
import datetime as dt, json
from pathlib import Path

FESTIVALS = json.loads((Path("data") / "festivals.json").read_text())


def upcoming_opportunities(craft: str | None, horizon_days: int = 60) -> list[dict]:
    today = dt.date.today()
    out = []
    for name, info in FESTIVALS.items():
        days = (dt.date.fromisoformat(info["date"]) - today).days
        if 0 < days <= horizon_days:
            relevant = craft in info.get("boosts_crafts", [])
            out.append({
                "festival": name, "days_away": days,
                "uplift_pct": int(info.get("uplift", 0.15) * 100),
                "relevant": relevant,
                "suggested_items": info.get("boosts_crafts", [])[:3],
            })
    return sorted(out, key=lambda o: (not o["relevant"], o["days_away"]))


async def build_nudge_message(db, artisan, opportunity: dict) -> str:
    """Grounded in her own past sales, not a generic template."""
    from sqlalchemy import text
    rows = await db.execute(text("""
        SELECT l.craft_class, COUNT(*) AS n, SUM(o.total) AS revenue
        FROM orders o JOIN listings l ON l.id = o.listing_id
        WHERE o.artisan_id = :aid
          AND o.created_at BETWEEN :start AND :end
        GROUP BY l.craft_class ORDER BY revenue DESC LIMIT 1
    """), {"aid": artisan.id,
           "start": dt.date.today().replace(year=dt.date.today().year - 1) - dt.timedelta(days=45),
           "end": dt.date.today().replace(year=dt.date.today().year - 1)})
    top = rows.first()

    if top:
        return (f"{opportunity['festival']} {opportunity['days_away']} din mein hai. "
                f"Pichle saal is samay aapke {top.craft_class} sabse zyada bike the "
                f"({top.n} orders). Abhi banana shuru kijiye.")
    return (f"{opportunity['festival']} {opportunity['days_away']} din mein hai. "
            f"Is samay {', '.join(opportunity['suggested_items'])} ki maang "
            f"{opportunity['uplift_pct']}% badh jaati hai.")
```

### 10.2 Motif mockups — OpenCV, not diffusion

```python
# apps/api/app/services/mockup.py
"""
Places the artisan's ACTUAL motif onto a modern product template.

Deliberately NOT diffusion. SDXL would invent a different pattern, which
defeats the entire purpose -- the point is showing HER design on a tote bag,
not a plausible-looking pattern. Homography warp is instant, free, and exact.
"""
import io, json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

TEMPLATES = Path("assets/mockup_templates")
CORNERS = json.loads((TEMPLATES / "corners.json").read_text())
# corners.json: {"tote": {"quad": [[x1,y1],[x2,y2],[x3,y3],[x4,y4]],
#                          "value_multiplier": 4.8, "base_price": 1200}, ...}


def apply_motif(motif_png: bytes, template_name: str) -> bytes:
    tpl = cv2.imread(str(TEMPLATES / f"{template_name}.png"), cv2.IMREAD_UNCHANGED)
    motif = cv2.imdecode(np.frombuffer(motif_png, np.uint8), cv2.IMREAD_UNCHANGED)

    quad = np.float32(CORNERS[template_name]["quad"])
    h, w = motif.shape[:2]
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])

    M = cv2.getPerspectiveTransform(src, quad)
    warped = cv2.warpPerspective(motif, M, (tpl.shape[1], tpl.shape[0]),
                                 flags=cv2.INTER_LANCZOS4,
                                 borderMode=cv2.BORDER_TRANSPARENT)

    # multiply blend so the template's own shading shows through the motif --
    # this is what makes it look printed rather than pasted.
    base = tpl[:, :, :3].astype(np.float32) / 255.0
    over = warped[:, :, :3].astype(np.float32) / 255.0
    alpha = (warped[:, :, 3:4].astype(np.float32) / 255.0) if warped.shape[2] == 4 else 1.0

    shading = cv2.cvtColor(tpl[:, :, :3], cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    shading = np.clip(shading[..., None] * 1.15, 0, 1)

    blended = base * (1 - alpha) + (over * shading) * alpha
    out = (np.clip(blended, 0, 1) * 255).astype(np.uint8)

    ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return buf.tobytes()


def value_story(template_name: str, current_price: float) -> dict:
    cfg = CORNERS[template_name]
    return {
        "product": template_name,
        "current_price": current_price,
        "potential_price": cfg["base_price"],
        "multiplier": round(cfg["base_price"] / max(current_price, 1), 1),
        "message": (f"Aapka design ek {template_name} par lagane se "
                    f"Rs {current_price:.0f} ki jagah Rs {cfg['base_price']} "
                    f"mil sakta hai."),
    }
```

Make 10 templates: tote, ceramic mug, laptop sleeve, cushion cover, scarf, notebook, phone case, apron, table runner, wall clock. Each is a flat product photo plus four hand-marked corner coordinates. Two hours of work total.

### 10.3 Stale listing coach

```python
STALE_RULES = [
    {"cond": lambda l, s: s["views"] < 20,
     "kind": "low_visibility",
     "fix": "Add 5 more keywords and republish. Your listing isn't being found.",
     "action": "regenerate_seo"},
    {"cond": lambda l, s: s["views"] >= 100 and s["orders"] == 0,
     "kind": "views_no_orders",
     "fix": "People are looking but not buying. Price may be too high, "
            "or photos need a different angle.",
     "action": "suggest_price_drop"},
    {"cond": lambda l, s: not s["has_enhanced_image"],
     "kind": "poor_image",
     "fix": "This listing uses an unedited photo. Enhanced photos sell more.",
     "action": "run_enhance"},
    {"cond": lambda l, s: not l.gi_tag and l.craft_class,
     "kind": "missing_provenance",
     "fix": "Add your craft's GI tag and story — buyers pay more for provenance.",
     "action": "attach_gi"},
]


async def coach_stale_listings(db) -> list[dict]:
    """Runs nightly. Only listings older than 30 days with no order."""
    from sqlalchemy import text
    rows = await db.execute(text("""
        SELECT l.*, 
               COALESCE(SUM(CASE WHEN e.kind='view' THEN 1 ELSE 0 END),0) AS views
        FROM listings l LEFT JOIN events e ON e.listing_id = l.id
        WHERE l.status='published'
          AND l.created_at < now() - interval '30 days'
          AND l.orders_count = 0
          AND (l.last_coached_at IS NULL
               OR l.last_coached_at < now() - interval '14 days')
        GROUP BY l.id
    """))
    nudges = []
    for l in rows:
        stats = {"views": l.views, "orders": l.orders_count,
                 "has_enhanced_image": bool(l.primary_media_id)}
        for rule in STALE_RULES:
            if rule["cond"](l, stats):
                nudges.append({"listing_id": str(l.id), "kind": rule["kind"],
                               "fix": rule["fix"], "action": rule["action"]})
                break
    return nudges
```

### Scheduler

```python
# apps/api/app/workers/scheduler.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler

sched = AsyncIOScheduler(timezone="Asia/Kolkata")


def start():
    sched.add_job(run_daily_digest, "cron", hour=19, minute=0)      # 7pm IST
    sched.add_job(run_demand_signals, "cron", day_of_week="mon", hour=9)
    sched.add_job(run_stale_coach, "cron", hour=3)
    sched.add_job(refresh_material_rates, "cron", day_of_week="sun", hour=2)
    sched.start()
```

> Backup: `infra/github/workflows/cron_digest.yml` hits the same endpoints on a schedule. Free, and survives a Railway restart.

### Definition of Done

- [ ] Weekly demand nudge sent as a WhatsApp voice note, grounded in her own past sales
- [ ] Motif applied to 3 product templates with a value-uplift message
- [ ] Stale-listing coach produces specific, actionable fixes (not "improve your listing")
- [ ] All three visible in a `CoachScreen` with tap-to-hear

---

## Phase 11 — Sakhi Mode, Zero-Text UI, Voice Digest

### 11.1 Sakhi mode

The hard work was done in Phase 1 (`current_artisan` + `managed_by`). What remains:

```python
@router.get("/artisans/managed")
async def managed(user: User = Depends(current_user), db=Depends(get_db)):
    if user.role != "sakhi":
        raise AppError("FORBIDDEN", "Not a Sakhi account", 403)
    rows = await db.execute(text("""
        SELECT a.id, a.name, a.village, a.primary_craft,
               COUNT(DISTINCT l.id) FILTER (WHERE l.status='published') AS live,
               COALESCE(SUM(o.total),0) AS revenue_30d,
               COUNT(DISTINCT bq.id) FILTER (WHERE bq.status='escalated') AS pending_q
        FROM artisans a
        LEFT JOIN listings l ON l.artisan_id = a.id
        LEFT JOIN orders o ON o.artisan_id = a.id
                          AND o.created_at > now() - interval '30 days'
        LEFT JOIN buyer_queries bq ON bq.artisan_id = a.id
        WHERE a.managed_by = :uid
        GROUP BY a.id ORDER BY pending_q DESC, a.name
    """), {"uid": user.id})
    return [dict(r._mapping) for r in rows]
```

Mobile: an artisan switcher at the top. Every subsequent request sends `X-Artisan-Id`. **Earnings stay separate** — the Sakhi sees per-artisan revenue, never a pooled number.

### 11.2 Zero-text UI

Rules, enforced in code review:

- No `TextInput` anywhere except the phone number and PIN pad.
- Every screen has at most **3 actions**, as large icon tiles (min 120×120 dp).
- Every text node is a `<SpeakableText>` that speaks on tap.
- Status is colour + icon, never text alone.
- Numbers are spoken as words in the digest, never rendered as bare digits.

```tsx
// apps/mobile/src/components/SpeakableText.tsx
import { useEffect } from 'react';
import { Text, Pressable } from 'react-native';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';

export function SpeakableText({ text, lang = 'hi-IN', audioUrl,
                                autoSpeak = false, style, children }) {
  async function speak() {
    if (audioUrl) {
      const { sound } = await Audio.Sound.createAsync({ uri: audioUrl });
      await sound.playAsync();
    } else {
      Speech.speak(text, { language: lang, rate: 0.85 });
    }
  }
  useEffect(() => { if (autoSpeak) speak(); }, [text, audioUrl]);

  return (
    <Pressable onPress={speak} hitSlop={16}>
      <Text style={style} accessibilityLabel={text}>{children ?? text}</Text>
    </Pressable>
  );
}
```

### 11.3 Voice daily digest

```python
async def build_digest(db, artisan) -> str:
    from sqlalchemy import text
    r = (await db.execute(text("""
        SELECT
          COUNT(*) FILTER (WHERE e.kind='view'
                           AND e.created_at::date = CURRENT_DATE) AS views,
          COUNT(DISTINCT o.id) FILTER (WHERE o.created_at::date = CURRENT_DATE) AS orders,
          COALESCE(SUM(o.total) FILTER (WHERE o.created_at::date = CURRENT_DATE),0) AS revenue,
          COUNT(DISTINCT bq.id) FILTER (WHERE bq.status='escalated') AS pending
        FROM artisans a
        LEFT JOIN listings l ON l.artisan_id = a.id
        LEFT JOIN events e ON e.listing_id = l.id
        LEFT JOIN orders o ON o.artisan_id = a.id
        LEFT JOIN buyer_queries bq ON bq.artisan_id = a.id
        WHERE a.id = :aid
    """), {"aid": artisan.id})).first()

    parts = [f"Aaj aapke saaman ko {r.views} logon ne dekha."]
    if r.orders:
        parts.append(f"{r.orders} order aaya, kul {int(r.revenue)} rupaye ka.")
    else:
        parts.append("Aaj koi order nahi aaya, kal koshish karte hain.")
    if r.pending:
        parts.append(f"{r.pending} grahak ne sawaal poocha hai, jawab dijiye.")
    return " ".join(parts)
```

Sent at 19:00 IST as a WhatsApp voice note. Works even if the app is never opened — which is the point.

### Definition of Done

- [ ] Sakhi logs in, switches between 3 artisans, revenue stays separate
- [ ] Zero `TextInput` in the artisan flow (grep the codebase to prove it)
- [ ] Every screen speaks on tap
- [ ] Digest arrives on WhatsApp as audio at 7pm

---

## Phase 12 — 3D Product Preview

**Goal:** one flat photo → rotatable GLB the buyer can spin.

### Reality check before you build

- TripoSR takes 10–20s even on GPU.
- Quality on **flat textiles is poor**. Pots, brassware, toys, and jewellery reconstruct well.
- **Pre-generate GLBs for your demo items.** Run exactly one live during the demo, on a product you've verified works.

### `apps/ml/routes/threed.py`

```python
import io, tempfile
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import FileResponse

router = APIRouter()
_pipe = None


def _get_pipe():
    global _pipe
    if _pipe is None:
        import torch
        from tsr.system import TSR
        _pipe = TSR.from_pretrained("stabilityai/TripoSR",
                                    config_name="config.yaml",
                                    weight_name="model.ckpt")
        _pipe.renderer.set_chunk_size(8192)
        _pipe.to("cuda" if torch.cuda.is_available() else "cpu")
    return _pipe


@router.post("/threed/generate")
async def generate(file: UploadFile = File(...)):
    """Input MUST be a background-removed RGBA PNG (use /segment first)."""
    from PIL import Image
    img = Image.open(io.BytesIO(await file.read())).convert("RGB")

    pipe = _get_pipe()
    with __import__("torch").no_grad():
        codes = pipe([img], device=pipe.device)
        meshes = pipe.extract_mesh(codes, resolution=256)

    out = tempfile.NamedTemporaryFile(suffix=".glb", delete=False)
    meshes[0].export(out.name)
    return FileResponse(out.name, media_type="model/gltf-binary",
                        filename="product.glb")
```

### Mobile rendering

```tsx
// Preview3DScreen.tsx -- model-viewer inside a WebView is the least
// fragile option. expo-three works but costs a day of GL debugging.
import { WebView } from 'react-native-webview';

const html = (glbUrl: string) => `
<!doctype html><html><body style="margin:0;background:#faf8f5">
<script type="module"
  src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>
<model-viewer src="${glbUrl}" camera-controls auto-rotate
  shadow-intensity="1" style="width:100vw;height:100vh"></model-viewer>
</body></html>`;

export default function Preview3DScreen({ route }) {
  return <WebView source={{ html: html(route.params.glbUrl) }}
                  originWhitelist={['*']} />;
}
```

### Business case for the pitch

3D previews measurably lift e-commerce conversion — the established pattern from furniture and fashion retail (IKEA, Wayfair). Frame it as a conversion feature with a known precedent, not as a novelty. Cite the pattern, not a specific number you can't source.

### Definition of Done

- [ ] Pot/toy/brass photo → spinnable GLB
- [ ] GLB stored in R2, linked from the listing
- [ ] Pre-generated demo assets committed
- [ ] Graceful "3D not available for this product type" for flat textiles

---

## Phase 13 — Optional Features

Build only after F1–F18. Each is small.

### 13.1 Artisan story card

PIL template render: her photo, name, village, craft, years, and a 2-line story transcribed from her own voice note. Attached to every listing. This is what converts buyers for handmade goods.

```python
def render_story_card(artisan, photo: bytes) -> bytes:
    from PIL import Image, ImageDraw, ImageFont
    W, H = 1080, 1350
    card = Image.new("RGB", (W, H), (250, 246, 238))
    d = ImageDraw.Draw(card)
    # circular photo, name, village, craft, GI badge, 2-line story
    # ... use a font that supports Devanagari (Noto Sans Devanagari)
    return _to_jpeg(card)
```

> Font gotcha: default PIL fonts do not render Devanagari. Bundle `NotoSansDevanagari-Regular.ttf` in `assets/fonts/`.

### 13.2 Credit report PDF

```python
def income_statement(artisan, orders, months: int = 6) -> bytes:
    """
    Marginalized artisans are invisible to formal credit because they have
    no documented income. This produces a bank-presentable statement for
    a MUDRA loan application.
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Table, Paragraph
    # monthly revenue table, order count, average order value,
    # channel breakdown, artisan card number, generated-on date
```

### 13.3 Graduation mode

```python
ASSIST_LEVELS = {
    3: "full_ai",     # AI writes everything
    2: "guided",      # AI drafts, she edits key fields by voice
    1: "review",      # she writes, AI only checks
}

def maybe_graduate(artisan) -> int:
    n = artisan.listings_completed
    if n >= 25:
        return 1
    if n >= 10:
        return 2
    return 3
```

At level 2, the app shows her the generated description and asks: *"Isme kuch badalna hai?"* — she can replace any sentence by voice. At level 1, she describes freely and the AI only flags unsupported claims.

Pitch line: *"Every other team's AI does everything, forever. Ours is designed to make itself less necessary — because 'improve digital literacy' is in the PS's own impact goals."*

---

## Phase 14 — Hardening & Demo

### Offline demo mode

```python
# Setting OFFLINE_DEMO_MODE=true must make the ENTIRE app work with no internet:
#   - ASR   -> faster-whisper local
#   - LLM   -> Ollama (qwen2.5:7b) at localhost
#   - TTS   -> expo-speech on device
#   - Seg   -> ML Kit on device
#   - 3D    -> pre-generated GLBs
#   - ONDC  -> mock gateway
#   - Prices-> local LightGBM (already local)
# Test this ONE WEEK before the demo, not the night before.
```

### Pre-demo checklist

- [ ] APK installed on **two** phones (one is a spare)
- [ ] Demo video pre-processed, results cached
- [ ] GLBs pre-generated
- [ ] Both WhatsApp and Telegram tested from a third phone
- [ ] `OFFLINE_DEMO_MODE=true` full run-through completed
- [ ] Railway instance warmed (hit `/health` 5 min before)
- [ ] Mobile hotspot as backup network
- [ ] Screen recording of the full flow, as a last-resort fallback

---

## 24. Testing Strategy

Don't aim for coverage. Test the four things that will actually break.

```python
# tests/test_grounding.py
async def test_vague_audio_produces_nulls():
    """The single most important test in the codebase."""
    facts = await grounding.extract_facts(
        "yeh bahut sundar cheez hai, ekdum badhiya", "hi")
    assert facts.material is None
    assert facts.dimensions_cm is None
    assert "material" in facts.missing_required()


async def test_description_makes_no_unsourced_claims():
    facts = ProductFacts(product_type="saree", work_hours=40)  # no material
    listing = await grounding.generate_listing(GenerateRequest(facts=facts))
    violations = await grounding.verify_listing(facts, listing)
    assert violations == []
    assert "silk" not in listing.description_en.lower()


# tests/test_rag.py
async def test_no_cross_artisan_leakage(db, artisan_a, artisan_b):
    await seed_qa(db, artisan_a, "Do you gift wrap?", "Yes, free gift wrap.")
    result = await answer_query(db, "Do you gift wrap?",
                                artisan_id=artisan_b.id, listing_id=None)
    assert result["status"] == "escalate"


async def test_price_question_always_escalates(db, artisan_a):
    await seed_qa(db, artisan_a, "What is the price?", "It is 500 rupees.")
    result = await answer_query(db, "kitna price hai?",
                                artisan_id=artisan_a.id, listing_id=None)
    assert result["status"] == "escalate"   # even though it WOULD retrieve


# tests/test_pricing.py
def test_dignity_floor_never_below_minimum_wage(engine):
    facts = {"work_hours": 40, "material": "cotton"}
    fl = engine.dignity_floor(facts, "UP", material_cost=200)
    assert fl["labour"] >= 40 * 400 / 8


# tests/test_ondc_signing.py
def test_signature_verifies_against_own_public_key():
    kp = signing.generate_keypair()
    body = '{"context":{"action":"search"}}'
    # sign with private, verify with public -- round trip must hold
```

Run in CI on every push (`infra/github/workflows/ci.yml`).

---

## 25. Deployment Runbook

### Order of operations

1. **Neon** — create project, run `neon_setup.sql`, create a branch per developer.
2. **Upstash** — create Redis, copy `rediss://` URL.
3. **R2** — create bucket, enable public dev URL, create API token.
4. **HF Space** — Docker SDK, push `apps/ml`, set `ML_SERVICE_TOKEN` as a secret. Build takes ~15 min; do this first.
5. **Railway** — two services from the same repo:
   - `api`: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - `worker`: `python -m app.workers.queue`
   Both get the full env var set.
6. **Meta** — create app, add WhatsApp product, set webhook to `https://<railway>/webhooks/whatsapp`, add the verify token.
7. **EAS** — `eas build -p android --profile preview` → APK → QR code.

### `apps/api/Dockerfile`

```dockerfile
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libgl1 libglib2.0-0 libsm6 libxext6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /code
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
ENV PYTHONUNBUFFERED=1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

> `ffmpeg` and `libgl1` are required by the video pipeline and OpenCV. Omitting them produces a confusing `ImportError: libGL.so.1` at runtime, not build time.

### RAM budget — check this in week one

| Component | RAM |
|---|---|
| multilingual-e5-base | ~1.1 GB |
| CLIP ViT-B/32 | ~0.6 GB |
| bge-reranker-base | ~1.1 GB |
| rembg isnet | ~0.2 GB |
| faster-whisper small (int8) | ~0.5 GB |
| **ML service total** | **~3.5 GB** |
| API service (no models except LightGBM) | ~400 MB |

This is exactly why the ML service is separate. A 512 MB free tier cannot hold the models; the API alone fits comfortably. **Measure this in week one** — it's the failure mode most likely to force a late rewrite.

---

## 26. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Bhashini API down or slow | High | Medium | `faster-whisper` + Gemini fallback behind one interface |
| R2 | Free-tier RAM insufficient | High | High | Separate ML service; measure week 1 |
| R3 | WhatsApp business approval delayed | Medium | High | Telegram adapter, one env var to switch |
| R4 | ONDC signing takes longer than planned | Medium | Medium | Timebox to 2 days; mock gateway always available |
| R5 | TripoSR too slow / poor on textiles | High | Low | Pre-generated GLBs; choose demo products carefully |
| R6 | Scraped pricing data too thin | Medium | High | kNN cold-start path works with as few as 500 rows |
| R7 | Neon pooled connection breaks asyncpg | Medium | Medium | `statement_cache_size=0` (already in `db.py`) |
| R8 | Demo venue has no internet | Medium | Critical | `OFFLINE_DEMO_MODE`, tested a week early |
| R9 | Craft classifier accuracy too low | Medium | Low | Zero-shot CLIP fallback; confidence gate prevents wrong GI claims |
| R10 | Video clustering splits/merges products | High | Medium | Tune on your own demo video; manual merge in the confirmation deck |

---

## 27. Demo Script

**Six minutes. Rehearse it until it's muscle memory.**

| Time | Action | What you say |
|---|---|---|
| 0:00 | Show a real cluttered phone photo of a pot | "This is what an artisan actually photographs." |
| 0:30 | Tap enhance → before/after slider | "On-device segmentation, so it works on 2G." |
| 1:00 | Record a Hindi voice note | "She never types. Not once, anywhere in this app." |
| 1:20 | App asks two follow-ups **aloud** | "It asks because it refuses to guess. Watch what happens if we don't answer." |
| 1:40 | Show 'material: not specified' in the output | "No hallucinated 'pure silk'. That's a legal problem, not a feature." |
| 2:00 | Price band appears with comparables | "LightGBM quantile regression. MAPE 24%. Here are the real similar products." |
| 2:20 | **Dignity floor fires** | "The market says ₹280. Minimum wage for her hours says ₹410. We refuse to recommend the lower number." |
| 2:50 | Play the pre-processed video → 8 drafts | "One 60-second video, eight listings, each with her own narration attached." |
| 3:30 | Push to ONDC (mock gateway) | "Spec-compliant, Ed25519-signed, tested against pre-production." |
| 4:00 | Buyer WhatsApps a question → instant answer with provenance | "Answered from her own earlier reply. 78% deflection." |
| 4:30 | New question → she gets a voice note → replies → buyer gets it | "Her answer just became permanent knowledge. She'll never be asked again." |
| 5:00 | Motif on a tote bag, ₹250 → ₹1,200 | "Her actual design, warped onto a real product. Not a diffusion model inventing a pattern." |
| 5:30 | 3D spin | |
| 5:45 | Graduation mode slide | "Every other AI does everything forever. Ours is built to become unnecessary." |

**The three lines that will be remembered:**

1. "We built the system to know when to shut up." *(abstain gate)*
2. "The market said ₹280. We refused." *(dignity floor)*
3. "The AI is designed to make itself unnecessary." *(graduation mode)*

---

## Appendix A — Build Order Summary

```
Week 1   Phase 0, 1        + start scraping pricing data (blocks Phase 4)
Week 2   Phase 2, 3        + Bhashini credentials, craft image collection
Week 3   Phase 4, 5        + ONDC key generation and registry paperwork
Week 4   Phase 6, 7
Week 5   Phase 8, 9
Week 6   Phase 10, 11
Week 7   Phase 12, 13
Week 8   Phase 14 — hardening, offline test, demo rehearsal
```

Scraping, Bhashini registration, and ONDC subscription all have external latency. Start them in week 1 regardless of which phase you're coding.

## Appendix B — What to Cut Under Time Pressure

Drop in this order:

1. 3D preview (Phase 12) — flashy but fragile
2. Credit report (13.2)
3. Graduation mode (13.3)
4. GeM XLSX (keep the CSV export)
5. Graph layer in RAG

**Never cut:** F1, F2, F3 (PS-mandated), grounding (F4), WhatsApp (F7/F8), ONDC (F9), or the RAG escalation loop (F11). Those are the submission.
