"""
Database session management.

Exports:
  AsyncSessionLocal, async_engine, get_db   — for FastAPI routes (asyncpg)
  SyncSessionLocal,  sync_engine,  get_sync_db — for Celery tasks + Stripe webhook (psycopg2)
  Base                                       — shared declarative base
"""
from __future__ import annotations

from typing import AsyncGenerator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


# ── Async engine (FastAPI / asyncpg) ─────────────────────────────────────────

async_engine = create_async_engine(
    settings.database_url,
    echo=settings.database_echo,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    async_engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields an AsyncSession per request."""
    async with AsyncSessionLocal() as session:
        yield session


# ── Sync engine (Celery tasks + Stripe webhook / psycopg2) ───────────────────
# Uses DATABASE_URL_SYNC when set, otherwise strips the +asyncpg driver prefix.

def _sync_url() -> str:
    if settings.database_url_sync:
        return settings.database_url_sync
    url = settings.database_url
    return url.replace("postgresql+asyncpg://", "postgresql://", 1).replace(
        "postgres+asyncpg://", "postgresql://", 1
    )


sync_engine = create_engine(
    _sync_url(),
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

SyncSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)


def get_sync_db():
    """Sync dependency for Celery tasks."""
    db = SyncSessionLocal()
    try:
        yield db
    finally:
        db.close()
