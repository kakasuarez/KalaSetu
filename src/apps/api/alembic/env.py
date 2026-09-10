"""
Alembic environment.

The URL comes from app.config.settings.database_url_sync -- a sync driver,
because Alembic runs migrations synchronously and asyncpg cannot be used here.
Settings derives it from DATABASE_URL when it is not set explicitly.
"""
from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make `app` importable when alembic is invoked from apps/api.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings  # noqa: E402
from app.db import Base  # noqa: E402
import app.models  # noqa: E402, F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", settings.database_url_sync)

# Phase 0 has no ORM models yet; Phase 1 adds them under app.models and they
# register themselves on Base.metadata, which makes `alembic revision
# --autogenerate` work from then on.
target_metadata = Base.metadata

RAW_INDEXES = {
    "idx_artisans_craft",
    "idx_artisans_managed_by",
    "idx_bq_artisan",
    "idx_nudges_artisan",
    "idx_events_listing_time",
    "idx_kb_embedding",
    "idx_kb_scope",
    "idx_kb_tsv",
    "idx_listings_artisan",
    "idx_listings_craft",
    "idx_listings_created",
    "idx_listings_embedding",
    "idx_listings_tsv",
    "idx_media_artisan",
    "idx_orders_artisan_time",
}


def include_object(obj, name, type_, reflected, compare_to) -> bool:
    if type_ == "table" and name in ("interface_alembic_version", "alembic_version"):
        return False
    if type_ == "column" and name == "search_tsv":
        return False
    if type_ == "index" and name in RAW_INDEXES:
        return False
    if type_ in ("unique_constraint", "constraint"):
        table_name = getattr(getattr(obj, "table", None), "name", None)
        if table_name == "login_attempts":
            return False
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url_sync,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
        compare_type=False,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            compare_type=False,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
