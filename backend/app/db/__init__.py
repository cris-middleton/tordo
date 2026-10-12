"""
Database session management.

Exports:
  AsyncSessionLocal, async_engine, get_db   — for FastAPI routes (asyncpg)
  sync_engine                                — for sync analytics reads (psycopg2)
  Base                                       — shared declarative base
"""

from __future__ import annotations

from typing import AsyncGenerator

from sqlalchemy import MetaData, create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    # Sólo se fija el nombre de las restricciones ÚNICAS. `unique=True` en una
    # columna genera una restricción sin nombre, y Postgres le pone el suyo
    # (`<tabla>_<col>_key`). Alembic entonces no puede casar la del modelo con la
    # de la base y reporta deriva para siempre.
    #
    # Se deja fuera fk/ck/ix/pk a propósito: las que ya existen tienen nombres
    # puestos a mano y una convención nueva las haría aparecer todas como deriva.
    metadata = MetaData(
        naming_convention={
            # `ix` es la convención POR DEFECTO de SQLAlchemy. Hay que repetirla:
            # pasar un diccionario propio la reemplaza entera, y sin ella los
            # índices quedan sin nombre y autogenerate revienta al comparar.
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
        }
    )


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


# ── Sync engine (repositories/analytics_sync.py / psycopg2) ─
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
