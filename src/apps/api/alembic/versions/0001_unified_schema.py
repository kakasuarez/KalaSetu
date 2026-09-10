"""unified schema (14 tables)

Unified baseline migration representing the complete KalaSetu schema:
- 3 extensions: vector, pg_trgm, uuid-ossp
- 5 custom enums: user_role, media_kind, listing_status, kb_source, query_status
- 14 tables:
    users, artisans, media, listings, kb_documents, buyer_queries,
    orders, publications, coach_nudges, events,
    otp_codes, login_attempts, artisan_profiles, messages
- Triggers: listings_tsv_update, kb_tsv_update
- HNSW vector indexes and GIN search indexes

Revision ID: 0001_unified_schema
Revises:
Create Date: 2026-09-09
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0001_unified_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UPGRADE_SQL = """
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
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

-- 1. users
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone           TEXT UNIQUE NOT NULL,
    pin_hash        TEXT,
    role            user_role NOT NULL DEFAULT 'artisan',
    display_name    TEXT,
    preferred_lang  TEXT NOT NULL DEFAULT 'hi',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. artisans
CREATE TABLE IF NOT EXISTS artisans (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
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
    listings_completed INT NOT NULL DEFAULT 0,
    assist_level    INT NOT NULL DEFAULT 3,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_artisans_managed_by ON artisans(managed_by);
CREATE INDEX IF NOT EXISTS idx_artisans_craft ON artisans(primary_craft);

-- 3. media
CREATE TABLE IF NOT EXISTS media (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    artisan_id      UUID REFERENCES artisans(id) ON DELETE CASCADE,
    kind            media_kind NOT NULL,
    storage_key     TEXT NOT NULL,
    storage_backend TEXT NOT NULL DEFAULT 'local',
    mime            TEXT,
    width           INT,
    height          INT,
    duration_ms     INT,
    parent_id       UUID REFERENCES media(id) ON DELETE SET NULL,
    meta            JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_media_artisan ON media(artisan_id, kind);

-- 4. listings
CREATE TABLE IF NOT EXISTS listings (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    artisan_id          UUID NOT NULL REFERENCES artisans(id) ON DELETE CASCADE,
    status              listing_status NOT NULL DEFAULT 'draft',
    title_en            TEXT,
    title_hi            TEXT,
    description_en      TEXT,
    description_hi      TEXT,
    seo_keywords        TEXT[],
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
    source              TEXT NOT NULL DEFAULT 'app',
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

-- 5. kb_documents
CREATE TABLE IF NOT EXISTS kb_documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source          kb_source NOT NULL,
    artisan_id      UUID REFERENCES artisans(id) ON DELETE CASCADE,
    listing_id      UUID REFERENCES listings(id) ON DELETE CASCADE,
    craft_class     TEXT,
    lang            TEXT NOT NULL DEFAULT 'en',
    title           TEXT,
    content         TEXT NOT NULL,
    content_native  TEXT,
    embedding       VECTOR(768),
    search_tsv      TSVECTOR,
    verified        BOOLEAN NOT NULL DEFAULT false,
    meta            JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
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

-- 6. buyer_queries
CREATE TABLE IF NOT EXISTS buyer_queries (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id     UUID REFERENCES listings(id) ON DELETE CASCADE,
    artisan_id     UUID REFERENCES artisans(id) ON DELETE CASCADE,
    channel        TEXT NOT NULL,
    buyer_ref      TEXT,
    question       TEXT NOT NULL,
    question_lang  TEXT,
    answer         TEXT,
    answer_source  TEXT,
    retrieved_ids  UUID[],
    top_score      REAL,
    status         query_status NOT NULL DEFAULT 'escalated',
    escalated_at   TIMESTAMPTZ,
    resolved_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bq_artisan ON buyer_queries(artisan_id, status);

-- 7. orders
CREATE TABLE IF NOT EXISTS orders (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id    UUID REFERENCES listings(id) ON DELETE SET NULL,
    artisan_id    UUID REFERENCES artisans(id) ON DELETE CASCADE,
    channel       TEXT NOT NULL,
    external_id   TEXT,
    qty           INT NOT NULL DEFAULT 1,
    unit_price    NUMERIC(10,2),
    total         NUMERIC(10,2),
    customization JSONB DEFAULT '{}',
    status        TEXT NOT NULL DEFAULT 'created',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_artisan_time ON orders(artisan_id, created_at DESC);

-- 8. publications
CREATE TABLE IF NOT EXISTS publications (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id    UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    channel       TEXT NOT NULL,
    external_id   TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',
    payload       JSONB,
    error         TEXT,
    published_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(listing_id, channel)
);

-- 9. coach_nudges
CREATE TABLE IF NOT EXISTS coach_nudges (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    artisan_id  UUID NOT NULL REFERENCES artisans(id) ON DELETE CASCADE,
    listing_id  UUID REFERENCES listings(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    payload     JSONB NOT NULL DEFAULT '{}',
    message_native TEXT,
    audio_key   TEXT,
    sent_at     TIMESTAMPTZ,
    acted_on    BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nudges_artisan ON coach_nudges(artisan_id, created_at DESC);

-- 10. events
CREATE TABLE IF NOT EXISTS events (
    id          BIGSERIAL PRIMARY KEY,
    artisan_id  UUID,
    listing_id  UUID,
    kind        TEXT NOT NULL,
    meta        JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_listing_time ON events(listing_id, created_at DESC);

-- 11. otp_codes
CREATE TABLE IF NOT EXISTS otp_codes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone       TEXT NOT NULL,
    code_hash   TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    attempts    INT NOT NULL DEFAULT 0,
    consumed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_otp_codes_phone_created ON otp_codes(phone, created_at);

-- 12. login_attempts
CREATE TABLE IF NOT EXISTS login_attempts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone       TEXT UNIQUE NOT NULL,
    attempts    INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_login_attempts_phone ON login_attempts(phone);

-- 13. artisan_profiles
CREATE TABLE IF NOT EXISTS artisan_profiles (
    artisan_id  UUID PRIMARY KEY REFERENCES artisans(id) ON DELETE CASCADE,
    language    TEXT NOT NULL DEFAULT 'Hindi',
    lat         DOUBLE PRECISION NOT NULL,
    lon         DOUBLE PRECISION NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. messages
CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    artisan_id      UUID NOT NULL REFERENCES artisans(id) ON DELETE CASCADE,
    sender          TEXT NOT NULL,
    kind            TEXT NOT NULL,
    body            TEXT,
    translated_body TEXT,
    audio_path      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_messages_artisan_created ON messages(artisan_id, created_at);
"""

DOWNGRADE_SQL = """
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS artisan_profiles CASCADE;
DROP TABLE IF EXISTS login_attempts CASCADE;
DROP TABLE IF EXISTS otp_codes CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS coach_nudges CASCADE;
DROP TABLE IF EXISTS publications CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS buyer_queries CASCADE;
DROP TABLE IF EXISTS kb_documents CASCADE;
DROP TABLE IF EXISTS listings CASCADE;
DROP TABLE IF EXISTS media CASCADE;
DROP TABLE IF EXISTS artisans CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP FUNCTION IF EXISTS listings_tsv_update() CASCADE;
DROP FUNCTION IF EXISTS kb_tsv_update() CASCADE;
DROP TYPE IF EXISTS query_status, kb_source, listing_status, media_kind, user_role;
"""


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UPGRADE_SQL)


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWNGRADE_SQL)
