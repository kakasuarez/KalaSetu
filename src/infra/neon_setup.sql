-- infra/neon_setup.sql
-- KalaSetu schema. Idempotent: safe to run repeatedly and safe to run over a
-- partially-created database (the first Phase 0 pass created users + artisans).
-- Applied by alembic/versions/0001_initial.py.
--
-- This file is the schema as of migration 0001 and is NOT edited for later
-- changes -- those live in alembic/versions/ so a fresh database and an
-- existing one converge on the same state. Run `alembic upgrade head`, not
-- this file alone. (0002 renames media.r2_key -> media.storage_key.)

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- CREATE TYPE has no IF NOT EXISTS, hence the exception blocks.
-- ============================================================
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('artisan', 'sakhi', 'buyer', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE media_kind AS ENUM
        ('image_raw','image_enhanced','audio','video','glb','mockup','card');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE listing_status AS ENUM
        ('draft','ready','published','paused','sold_out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE kb_source AS ENUM
        ('artisan_qa','listing_fact','craft_knowledge','policy','scheme');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE query_status AS ENUM
        ('answered_auto','escalated','answered_artisan','abandoned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- IDENTITY
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone           TEXT UNIQUE NOT NULL,
    pin_hash        TEXT,
    role            user_role NOT NULL DEFAULT 'artisan',
    display_name    TEXT,
    preferred_lang  TEXT NOT NULL DEFAULT 'hi',   -- ISO 639-1
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artisans (
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
CREATE INDEX IF NOT EXISTS idx_artisans_managed_by ON artisans(managed_by);
CREATE INDEX IF NOT EXISTS idx_artisans_craft ON artisans(primary_craft);

-- ============================================================
-- MEDIA
-- ============================================================
CREATE TABLE IF NOT EXISTS media (
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
CREATE INDEX IF NOT EXISTS idx_media_artisan ON media(artisan_id, kind);

-- ============================================================
-- LISTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS listings (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    artisan_id          UUID NOT NULL REFERENCES artisans(id) ON DELETE CASCADE,
    status              listing_status NOT NULL DEFAULT 'draft',

    title_en            TEXT,
    title_hi            TEXT,
    description_en      TEXT,
    description_hi      TEXT,
    seo_keywords        TEXT[],

    -- confirmed facts only. Anything absent renders as "not specified".
    -- {material, technique, dimensions_cm, weight_g, colors[], piece_count,
    --  care, work_hours, is_handmade, customizations[]}
    facts               JSONB NOT NULL DEFAULT '{}',

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

CREATE INDEX IF NOT EXISTS idx_listings_artisan ON listings(artisan_id, status);
CREATE INDEX IF NOT EXISTS idx_listings_craft ON listings(craft_class);
CREATE INDEX IF NOT EXISTS idx_listings_created ON listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_tsv ON listings USING GIN(search_tsv);
CREATE INDEX IF NOT EXISTS idx_listings_embedding ON listings
    USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);

CREATE OR REPLACE FUNCTION listings_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv :=
      setweight(to_tsvector('simple', coalesce(NEW.title_en,'')), 'A') ||
      setweight(to_tsvector('simple', coalesce(NEW.craft_class,'')), 'A') ||
      setweight(to_tsvector('simple', coalesce(NEW.description_en,'')), 'B') ||
      setweight(to_tsvector('simple', array_to_string(coalesce(NEW.seo_keywords,'{}'),' ')), 'B');
  NEW.updated_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_listings_tsv ON listings;
CREATE TRIGGER trg_listings_tsv BEFORE INSERT OR UPDATE ON listings
FOR EACH ROW EXECUTE FUNCTION listings_tsv_update();

-- ============================================================
-- KNOWLEDGE BASE (RAG corpus)
-- ============================================================
CREATE TABLE IF NOT EXISTS kb_documents (
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
CREATE INDEX IF NOT EXISTS idx_kb_scope ON kb_documents(artisan_id, listing_id, source);
CREATE INDEX IF NOT EXISTS idx_kb_tsv ON kb_documents USING GIN(search_tsv);
CREATE INDEX IF NOT EXISTS idx_kb_embedding ON kb_documents
    USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);

CREATE OR REPLACE FUNCTION kb_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv := to_tsvector('simple',
      coalesce(NEW.title,'') || ' ' || coalesce(NEW.content,''));
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kb_tsv ON kb_documents;
CREATE TRIGGER trg_kb_tsv BEFORE INSERT OR UPDATE ON kb_documents
FOR EACH ROW EXECUTE FUNCTION kb_tsv_update();

-- ============================================================
-- BUYER QUERIES / ESCALATION
-- ============================================================
CREATE TABLE IF NOT EXISTS buyer_queries (
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
CREATE INDEX IF NOT EXISTS idx_bq_artisan ON buyer_queries(artisan_id, status);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
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
CREATE INDEX IF NOT EXISTS idx_orders_artisan_time ON orders(artisan_id, created_at DESC);

-- ============================================================
-- PUBLICATIONS (multi-channel push)
-- ============================================================
CREATE TABLE IF NOT EXISTS publications (
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
CREATE TABLE IF NOT EXISTS coach_nudges (
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
CREATE INDEX IF NOT EXISTS idx_nudges_artisan ON coach_nudges(artisan_id, created_at DESC);

CREATE TABLE IF NOT EXISTS events (
    id          BIGSERIAL PRIMARY KEY,
    artisan_id  UUID,
    listing_id  UUID,
    kind        TEXT NOT NULL,   -- view|impression|query|order|publish
    meta        JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_listing_time ON events(listing_id, created_at DESC);
