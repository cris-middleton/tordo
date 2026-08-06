"""Tests de las tareas Celery del dashboard.

Estas tareas son SÍNCRONAS (usan `SyncSessionLocal`), así que necesitan una
sesión sync. El esquema lo aplican las migraciones, igual que el resto de los
tests: este archivo mantenía su propio DDL de SQLite —el tercero del repo— y se
desincronizaba con cada columna nueva.
"""

from datetime import UTC, datetime
from unittest.mock import patch
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


@pytest.fixture
def sync_task_db(esquema_migrado):
    """Sesión síncrona sobre una transacción que se revierte al terminar."""
    url = esquema_migrado.replace("postgresql+asyncpg://", "postgresql://", 1)
    engine = create_engine(url, future=True)
    conexion = engine.connect()
    transaccion = conexion.begin()
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=conexion)
    session = SessionLocal()
    try:
        yield session, SessionLocal
    finally:
        session.close()
        transaccion.rollback()
        conexion.close()
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
    session.flush()

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
