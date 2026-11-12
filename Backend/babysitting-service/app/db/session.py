"""
app/db/session.py
─────────────────
Async SQLAlchemy engine + session factory using asyncpg driver.
The `get_db()` dependency yields a scoped AsyncSession per request
and ensures the session is closed even on error.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

settings = get_settings()

# ── Engine ────────────────────────────────────────────────────────────────────
# pool_pre_ping=True: validate connections before use (handles DB restarts).
# pool_size / max_overflow tuned conservatively for a containerised service.
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.is_development,          # log SQL in dev, never in prod
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=3600,                     # recycle connections after 1 h
    connect_args={
        "server_settings": {"application_name": settings.SERVICE_NAME},
        "command_timeout": 60,
    },
)

# ── Session factory ───────────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,    # avoid lazy-load issues after commit
    autoflush=False,
    autocommit=False,
)


# ── FastAPI dependency ────────────────────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, Any]:
    """
    Yield a database session for the lifetime of a single request.
    The caller (router) must commit explicitly; this function rolls back
    on any unhandled exception.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
