"""
tests/conftest.py
──────────────────
Shared fixtures for both unit and API tests.

Design:
  • Uses an in-memory SQLite database via aiosqlite for unit/integration tests
    (no Postgres required in CI).
  • Overrides ENVIRONMENT=test (disables event publishing).
  • SQLite does not support native Postgres ENUM types; we create tables with
    native_enum=False so enums become VARCHAR columns transparently.
  • Provides AsyncClient pointing at the real FastAPI app.
  • Provides JWT helpers, mock Redis, and sample payload fixtures.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import AsyncGenerator
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import Settings
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.security.jwt import create_test_jwt

# ── SQLite test engine ────────────────────────────────────────────────────────
# Use check_same_thread=False and render_as_batch=True to handle SQLite limits.
# native_enum=False ensures Postgres ENUM types fall back to VARCHAR in SQLite.
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
)

# Patch all SQLAlchemy Enum types to use native_enum=False for SQLite compat
# This is done at table creation time via the event below.
@event.listens_for(test_engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_conn, connection_record):  # type: ignore
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestSessionFactory = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def create_tables():
    """Create all tables once per test session using SQLite-compatible DDL."""
    # Temporarily override native enum to False for SQLite
    from sqlalchemy import Enum as SAEnum
    _orig_create = SAEnum.create

    def _patched_create(self, bind=None, checkfirst=False):
        # Skip CREATE TYPE for SQLite
        pass

    SAEnum.create = _patched_create  # type: ignore

    async with test_engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: Base.metadata.create_all(
                sync_conn,
                checkfirst=True,
            )
        )

    SAEnum.create = _orig_create  # type: ignore
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide a transactional session rolled back after each test."""
    async with TestSessionFactory() as session:
        yield session
        await session.rollback()


@pytest.fixture
def test_settings() -> Settings:
    return Settings(
        DATABASE_URL=TEST_DB_URL,
        REDIS_URL="redis://localhost:6379/0",
        JWT_SECRET="test-secret-key",
        JWT_ALGORITHM="HS256",
        USE_MOCK_IDENTITY=True,
        ENVIRONMENT="test",
        MIN_CREDIT_BALANCE=-2.0,
        CACHE_TTL_SECONDS=60,
    )


@pytest.fixture
def mock_redis():
    """Mock RedisClient that does nothing (no Redis required in tests)."""
    m = AsyncMock()
    m.check_rate_limit = AsyncMock(return_value=True)
    m.acquire_slot_lock = AsyncMock(return_value=True)
    m.release_slot_lock = AsyncMock(return_value=None)
    m.get_availability_list = AsyncMock(return_value=None)
    m.set_availability_list = AsyncMock(return_value=None)
    m.invalidate_availability = AsyncMock(return_value=None)
    m.get_match_results = AsyncMock(return_value=None)
    m.set_match_results = AsyncMock(return_value=None)
    m.invalidate_match_results = AsyncMock(return_value=None)
    m.ping = AsyncMock(return_value=True)
    m._redis = AsyncMock()
    return m


async def _db_override() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionFactory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@pytest_asyncio.fixture
async def app(test_settings: Settings, mock_redis) -> FastAPI:
    """FastAPI app wired to the test SQLite DB and mock Redis."""
    from app.cache.redis_client import get_redis_client
    from app.core.config import get_settings

    fastapi_app = create_app()
    fastapi_app.dependency_overrides[get_settings] = lambda: test_settings
    fastapi_app.dependency_overrides[get_db] = _db_override
    fastapi_app.dependency_overrides[get_redis_client] = lambda: mock_redis
    return fastapi_app


@pytest_asyncio.fixture
async def client(app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP client targeting the test app."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


# ── Auth helpers ──────────────────────────────────────────────────────────────

@pytest.fixture
def parent_user_id() -> uuid.UUID:
    return uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")


@pytest.fixture
def babysitter_user_id() -> uuid.UUID:
    return uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")


@pytest.fixture
def parent_token(parent_user_id: uuid.UUID) -> str:
    return create_test_jwt(parent_user_id, "parent", secret="test-secret-key")


@pytest.fixture
def babysitter_token(babysitter_user_id: uuid.UUID) -> str:
    return create_test_jwt(babysitter_user_id, "babysitter", secret="test-secret-key")


@pytest.fixture
def auth_headers_parent(parent_token: str) -> dict:
    return {"Authorization": f"Bearer {parent_token}"}


@pytest.fixture
def auth_headers_babysitter(babysitter_token: str) -> dict:
    return {"Authorization": f"Bearer {babysitter_token}"}


# ── Sample payloads ───────────────────────────────────────────────────────────

def _tomorrow() -> str:
    return (date.today() + timedelta(days=1)).isoformat()


@pytest.fixture
def sample_request_payload() -> dict:
    return {
        "date": _tomorrow(),
        "start_time": "09:00:00",
        "end_time": "13:00:00",
        "neighborhood": "Montmartre",
        "num_children": 2,
        "child_age_ranges": ["2-4", "6-8"],
        "notes": "Allergic to nuts",
    }


@pytest.fixture
def sample_availability_payload() -> dict:
    return {
        "is_recurring": False,
        "date": _tomorrow(),
        "start_time": "08:00:00",
        "end_time": "18:00:00",
        "neighborhood": "Montmartre",
    }
