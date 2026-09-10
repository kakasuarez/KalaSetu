"""
Shared test fixtures.

Two things here are load-bearing and were arrived at the hard way:

1. The HTTP client is httpx + ASGITransport, not starlette's TestClient.
   TestClient runs the app in its own event loop; an AsyncSession created by a
   pytest-asyncio fixture lives on a different one, and asyncpg raises
   "got Future attached to a different loop" the moment they meet. Driving the
   app through ASGITransport keeps everything on one loop.

2. Redis is faked in-process. The real REDIS_URL points at the compose service
   name, which does not resolve from the host, and the suite should not need a
   running container anyway.

Every test runs inside a transaction that is rolled back afterwards, so the
suite can point at the real Neon database without leaving rows behind.
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import NullPool
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings
from app.db import get_db
from app.deps import get_redis
from app.main import app
from app.models.artisan import Artisan
from app.models.user import User
from app.security import create_token, hash_pin
from app.services import storage as storage_service


def pytest_configure(config):
    config.addinivalue_line(
        "markers", "integration: needs a live database; skipped when unreachable"
    )


@pytest_asyncio.fixture
async def db():
    """
    A session inside a transaction that is always rolled back.

    Its own engine with NullPool, deliberately: pytest-asyncio gives each test
    a fresh event loop, and a pooled asyncpg connection carries the loop it was
    opened on. Reusing app.db.engine across tests therefore fails teardown with
    "Event loop is closed". NullPool means every test opens and closes its own
    connection on its own loop.
    """
    test_engine = create_async_engine(
        settings.database_url,
        poolclass=NullPool,
        connect_args={"ssl": "require", "statement_cache_size": 0},
    )
    try:
        async with test_engine.connect() as conn:
            trans = await conn.begin()
            maker = async_sessionmaker(
                bind=conn, expire_on_commit=False, class_=AsyncSession
            )
            session = maker()
            try:
                yield session
            finally:
                await session.close()
                await trans.rollback()
    finally:
        await test_engine.dispose()


@pytest.fixture
def fake_redis():
    from fakeredis import aioredis as fake_aioredis

    return fake_aioredis.FakeRedis(decode_responses=True)


@pytest_asyncio.fixture
async def api(db, fake_redis):
    """
    Async HTTP client bound to the app, sharing this test's event loop.

    get_db is overridden to yield the rolled-back session and, critically, not
    to commit -- the real get_db commits on success, which would defeat the
    rollback.
    """

    async def _db_override():
        yield db

    def _redis_override():
        return fake_redis

    app.dependency_overrides[get_db] = _db_override
    app.dependency_overrides[get_redis] = _redis_override
    # Lifespan is skipped here, so nothing else may rely on app.state.
    app.state.redis = fake_redis

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_redis, None)


def unique_phone() -> str:
    """A valid Indian mobile number that no other test is using."""
    return f"+919{uuid.uuid4().int % 10**9:09d}"


@pytest_asyncio.fixture
async def artisan_factory(db):
    """Creates (user, artisan) pairs. Rolled back with the surrounding test."""

    async def _make(role: str = "artisan", pin: str | None = None, managed_by=None):
        user = User(
            phone=unique_phone(),
            role=role,
            pin_hash=hash_pin(pin) if pin else None,
        )
        db.add(user)
        await db.flush()
        artisan = Artisan(user_id=user.id, name=f"Test {role}", managed_by=managed_by)
        db.add(artisan)
        await db.flush()
        return user, artisan

    return _make


def auth_header(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_token(user.id, user.role)}"}


@pytest.fixture
def local_storage(tmp_path, monkeypatch):
    """Point the storage backend at a temp dir for the duration of a test."""
    monkeypatch.setattr(settings, "storage_backend", "local", raising=False)
    monkeypatch.setattr(settings, "local_storage_dir", str(tmp_path), raising=False)
    storage_service.reset_storage()
    yield storage_service.get_storage()
    storage_service.reset_storage()
