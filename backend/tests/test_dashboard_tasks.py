"""Tests for dashboard Celery tasks.

The sync `db` fixture in conftest uses Base.metadata.create_all, which fails on
SQLite for PostgreSQL-only ARRAY columns (Empresa.rubros_cpv, TFIDFPerfil.rubros_usados).
We build a minimal sync SQLite fixture with raw DDL and patch SyncSessionLocal.
"""

from datetime import UTC, datetime
from unittest.mock import patch
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

SYNC_TASK_TEST_URL = "sqlite:///./test_sync_tasks.db"

_SYNC_DDL = [
    """CREATE TABLE IF NOT EXISTS empresas (
        id CHAR(32) PRIMARY KEY,
        rut_empresa VARCHAR(12) UNIQUE NOT NULL,
        nombre_empresa VARCHAR(255) NOT NULL,
        rubros_cpv TEXT,
        regiones TEXT,
        activo BOOLEAN NOT NULL DEFAULT 1,
        estado_habil VARCHAR(20) NOT NULL DEFAULT 'desconocido',
        estado_habil_updated_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS tfidf_perfiles (
        id CHAR(32) PRIMARY KEY,
        empresa_id CHAR(32) NOT NULL UNIQUE REFERENCES empresas(id) ON DELETE CASCADE,
        vector_bytes BLOB NOT NULL,
        rubros_usados TEXT,
        modelo_version VARCHAR(50) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS dashboard_home_cache (
        empresa_id CHAR(32) PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
        matches TEXT NOT NULL DEFAULT '[]',
        matches_count INTEGER NOT NULL DEFAULT 0,
        cached_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS licitaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_externo VARCHAR(100) UNIQUE NOT NULL,
        nombre VARCHAR(500) NOT NULL,
        descripcion TEXT,
        fecha_publicacion DATETIME NOT NULL,
        fecha_cierre DATETIME,
        monto_estimado NUMERIC(15,2),
        moneda VARCHAR(10) DEFAULT 'CLP',
        estado VARCHAR(50),
        codigo_organismo VARCHAR(50),
        nombre_organismo VARCHAR(500),
        activo BOOLEAN DEFAULT 1
    )""",
]


@pytest.fixture
def sync_task_db():
    engine = create_engine(SYNC_TASK_TEST_URL, future=True)
    with engine.begin() as conn:
        for ddl in _SYNC_DDL:
            conn.execute(text(ddl))
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    try:
        yield session, SessionLocal
    finally:
        session.close()
        with engine.begin() as conn:
            for tbl in ("tfidf_perfiles", "dashboard_home_cache", "licitaciones", "empresas"):
                conn.execute(text(f"DROP TABLE IF EXISTS {tbl}"))
        engine.dispose()


def test_precompute_dashboard_matches_skips_when_feature_off(monkeypatch):
    from app.tasks import dashboard_tasks

    monkeypatch.setattr(dashboard_tasks.settings, "feature_tfidf", False)
    result = dashboard_tasks.precompute_dashboard_matches()
    assert result == {"skipped": True}


def test_precompute_dashboard_matches_writes_cache_for_empresa(sync_task_db, monkeypatch):
    from app.models.dashboard_cache import DashboardHomeCache
    from app.models.empresa import Empresa, TFIDFPerfil
    from app.tasks import dashboard_tasks

    session, SessionLocal = sync_task_db

    empresa = Empresa(
        id=uuid4(),
        rut_empresa="11111111-1",
        nombre_empresa="Test ETL",
        estado_habil="habil",
    )
    session.add(empresa)
    session.flush()
    session.add(
        TFIDFPerfil(
            id=uuid4(),
            empresa_id=empresa.id,
            vector_bytes=b"fake",
            modelo_version="v1",
        )
    )
    session.commit()

    fake_matches = [
        {
            "codigo_externo": "LIC-X",
            "nombre": "Servicios test",
            "organismo": "ORG",
            "monto_estimado": 100000.0,
            "moneda": "CLP",
            "fecha_cierre": datetime.now(UTC).isoformat(),
            "score": 80,
            "href": "/dashboard/tenders/LIC-X",
        }
    ]

    monkeypatch.setattr(dashboard_tasks.settings, "feature_tfidf", True)
    monkeypatch.setattr(dashboard_tasks, "SyncSessionLocal", SessionLocal)

    with patch.object(dashboard_tasks, "_compute_matches_for_empresa", return_value=fake_matches):
        result = dashboard_tasks.precompute_dashboard_matches()

    assert result["processed"] == 1
    assert result["failed"] == 0

    cache = session.query(DashboardHomeCache).filter_by(empresa_id=empresa.id).one()
    assert cache.matches_count == 1
    assert cache.matches[0]["codigo_externo"] == "LIC-X"
