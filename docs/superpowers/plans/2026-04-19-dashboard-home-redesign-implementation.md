# Dashboard Home Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Tordo dashboard home (`frontend/app/dashboard/page.tsx`) as an operational center of command — three zones (urgency / matches / pipeline) plus narrative summary, conditional trend widget, and quick actions — backed by a new unified `GET /api/dashboard/home` endpoint and a daily Celery pre-compute task for TF-IDF matches.

**Architecture:** Single backend roundtrip composes urgency items from 4 sources (postulaciones with closing fecha_cierre, expiring documents, estado hábil status, unread critical alerts) plus pipeline counts and conditional trend stats. TF-IDF matches are pre-computed daily and cached in a new `dashboard_home_cache` table (read-through pattern — never calls BI live from the home). Frontend renders 6 zones with deterministic narrative template (broad variant pool seeded by date) and per-zone empty/loading states.

**Tech Stack:** Backend — FastAPI, SQLAlchemy 2.0 async, Alembic, Celery + Redis. Frontend — Next.js 14 App Router, TypeScript, Tailwind CSS, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-04-19-dashboard-home-redesign-design.md`

---

## File Structure

### New backend files
- `backend/alembic/versions/009_add_dashboard_home_cache.py` — migration creating `dashboard_home_cache` table
- `backend/app/models/dashboard_cache.py` — `DashboardHomeCache` SQLAlchemy model
- `backend/app/schemas/dashboard_home.py` — Pydantic response schemas (`DashboardHomeResponse` + nested types)
- `backend/app/services/dashboard_home_service.py` — async composer reading from `Postulacion`, `Licitacion`, `Alert`, `DocumentoEmpresa`, `Empresa`, `dashboard_home_cache`
- `backend/app/tasks/dashboard_tasks.py` — `precompute_dashboard_matches` Celery task
- `backend/tests/test_dashboard_home_service.py` — service unit tests
- `backend/tests/test_dashboard_home_endpoint.py` — endpoint integration tests
- `backend/tests/test_dashboard_tasks.py` — Celery task tests

### Modified backend files
- `backend/app/api/dashboard.py` — add `GET /home` endpoint
- `backend/app/celery_app.py` — register `precompute-dashboard-matches` beat schedule + import the new task module

### New frontend files
- `frontend/types/dashboardHome.ts` — TypeScript types matching the response schema
- `frontend/lib/narrative.ts` — pure-function template engine with variant pools
- `frontend/lib/empresaActive.ts` — localStorage helper for the active empresa id
- `frontend/components/dashboard/DashboardHeader.tsx` — zone A
- `frontend/components/dashboard/UrgencyZone.tsx` — zone B
- `frontend/components/dashboard/MatchesZone.tsx` — zone C
- `frontend/components/dashboard/PipelineZone.tsx` — zone D
- `frontend/components/dashboard/TrendWidget.tsx` — zone E
- `frontend/components/dashboard/QuickActions.tsx` — zone F
- `frontend/components/dashboard/EmpresaSwitcher.tsx` — modal triggered from zone A
- `frontend/__tests__/narrative.test.ts` — Vitest tests for narrative engine

### Modified frontend files
- `frontend/lib/api.ts` — add `getDashboardHome(empresaId?)` method
- `frontend/app/dashboard/page.tsx` — rewrite from scratch as a thin assembly of the 6 zones
- `frontend/components/Layout.tsx` — remove the `/dashboard/analytics` sidebar link

### Deleted files
- `frontend/components/TopOpportunities.tsx`
- `frontend/components/MiniTrendChart.tsx`
- `frontend/components/MiniActivityBars.tsx`
- `frontend/components/DataFreshnessBar.tsx`
- `frontend/app/dashboard/analytics/` (entire directory)

---

## Pre-flight

### Task 0: Branch + worktree

**Files:** none — git operations.

- [ ] **Step 1: Verify clean working tree on a sensible base**

Run: `git status && git branch --show-current`

Expected: working tree clean (or only the spec file from the brainstorm). Current branch is irrelevant — the spec was committed to `feat/bi-panel-v2` but the implementation must branch from `main`.

- [ ] **Step 2: Fetch latest main and create the feature branch**

```bash
git fetch origin main
git checkout -b feat/dashboard-home-redesign origin/main
```

If the spec file `docs/superpowers/specs/2026-04-19-dashboard-home-redesign-design.md` is missing on main, cherry-pick it from `feat/bi-panel-v2`:

```bash
git cherry-pick $(git log feat/bi-panel-v2 --oneline | grep "dashboard home redesign spec" | awk '{print $1}')
```

- [ ] **Step 3: Verify the spec is reachable**

Run: `ls docs/superpowers/specs/2026-04-19-dashboard-home-redesign-design.md`

Expected: file exists.

---

## Phase A — Backend foundations

### Task 1: Migration for `dashboard_home_cache`

**Files:**
- Create: `backend/alembic/versions/009_add_dashboard_home_cache.py`

- [ ] **Step 1: Write the migration**

```python
"""Add dashboard_home_cache table.

Revision ID: 009
Revises: 008
Create Date: 2026-04-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dashboard_home_cache",
        sa.Column("empresa_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("matches", JSONB(), nullable=False, server_default="[]"),
        sa.Column("matches_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "cached_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_dashboard_home_cache_cached_at",
        "dashboard_home_cache",
        ["cached_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_dashboard_home_cache_cached_at", table_name="dashboard_home_cache")
    op.drop_table("dashboard_home_cache")
```

- [ ] **Step 2: Run the migration locally**

Run (from `backend/` with the venv active):
```bash
alembic upgrade head
```

Expected: `Running upgrade 008 -> 009, Add dashboard_home_cache table` printed.

- [ ] **Step 3: Verify with a SQL query**

Run:
```bash
psql "$DATABASE_URL" -c "\d dashboard_home_cache"
```

Expected: table description showing `empresa_id` (uuid, PK), `matches` (jsonb), `matches_count` (int4), `cached_at`, `updated_at`, and the FK to `empresas`.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/009_add_dashboard_home_cache.py
git commit -m "feat(db): add dashboard_home_cache table

Stores pre-computed TF-IDF matches per empresa, refreshed daily by
the precompute_dashboard_matches Celery task. Read-through cache
for the operational home so we never call BI live from /dashboard."
```

---

### Task 2: SQLAlchemy model

**Files:**
- Create: `backend/app/models/dashboard_cache.py`

- [ ] **Step 1: Write the model**

```python
"""Dashboard home cache — pre-computed TF-IDF matches per empresa."""
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base

# Use JSONB on PostgreSQL (production) and fall back to generic JSON
# on SQLite (used by the test suite).
JsonType = JSON().with_variant(JSONB(), "postgresql")


class DashboardHomeCache(Base):
    """One row per empresa with the daily-refreshed match list."""

    __tablename__ = "dashboard_home_cache"

    empresa_id = Column(
        UUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        primary_key=True,
    )
    matches = Column(JsonType, nullable=False, default=list)
    matches_count = Column(Integer(), nullable=False, default=0)
    cached_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    empresa = relationship("Empresa")
```

- [ ] **Step 2: Verify the model imports cleanly**

Run (from `backend/`):
```bash
python -c "from app.models.dashboard_cache import DashboardHomeCache; print(DashboardHomeCache.__tablename__)"
```

Expected: `dashboard_home_cache` printed.

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/dashboard_cache.py
git commit -m "feat(models): add DashboardHomeCache SQLAlchemy model"
```

---

### Task 3: Pydantic response schemas

**Files:**
- Create: `backend/app/schemas/dashboard_home.py`

- [ ] **Step 1: Write the schemas**

```python
"""Schemas for GET /api/dashboard/home."""
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class EmpresaSummary(BaseModel):
    id: UUID
    nombre: str
    rut: str
    estado_habil: str
    estado_habil_updated_at: Optional[datetime] = None


class ResumenStats(BaseModel):
    matches_semana: int = 0
    matches_72h: int = 0
    postulaciones_activas: int = 0
    postulaciones_cierran_72h: int = 0
    docs_por_vencer_30d: int = 0
    docs_por_vencer_7d: int = 0
    adjudicaciones_mes: int = 0
    enviadas_mes: int = 0


class UrgenciaItem(BaseModel):
    id: str
    tipo: Literal[
        "postulacion_cierre",
        "documento_vence",
        "match_alto",
        "estado_inhabil",
        "checklist_incompleto",
        "estado_habil_cambio",
    ]
    severidad: Literal["rojo", "naranja", "amarillo"]
    tiempo_label: str
    titulo: str
    subtitulo: str
    cta_label: str
    cta_href: str


class MatchItem(BaseModel):
    codigo_externo: str
    nombre: str
    organismo: str
    monto_estimado: Optional[float] = None
    moneda: str = "CLP"
    fecha_cierre: Optional[datetime] = None
    score: int = Field(..., ge=0, le=100)
    href: str


class PipelineCounts(BaseModel):
    en_seguimiento: int = 0
    en_preparacion: int = 0
    enviada: int = 0
    adjudicada: int = 0
    no_adjudicada: int = 0
    tasa_adjudicacion_90d: Optional[float] = None
    decididas_90d: int = 0


class TrendStats(BaseModel):
    disponible: bool = False
    postulaciones_semana: list[int] = Field(default_factory=list)
    tasa_adjudicacion_actual: Optional[float] = None
    tasa_adjudicacion_anterior: Optional[float] = None
    delta_enviadas_pp: Optional[int] = None


class PlanInfo(BaseModel):
    tier: Literal["free", "paid"]
    matches_visibles: int


class DashboardHomeResponse(BaseModel):
    empresa: Optional[EmpresaSummary]
    resumen: ResumenStats
    urgencias: list[UrgenciaItem]
    matches: list[MatchItem]
    matches_cached_at: Optional[datetime] = None
    matches_total_disponibles: int = 0
    pipeline: PipelineCounts
    trend: TrendStats
    plan: PlanInfo
```

- [ ] **Step 2: Verify schema imports**

Run (from `backend/`):
```bash
python -c "from app.schemas.dashboard_home import DashboardHomeResponse; print('ok')"
```

Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/dashboard_home.py
git commit -m "feat(schemas): add DashboardHomeResponse + nested schemas"
```

---

## Phase B — Service composition

### Task 4: Service — `compose_urgencias`

**Files:**
- Create: `backend/app/services/dashboard_home_service.py`
- Test: `backend/tests/test_dashboard_home_service.py`

This task implements the urgencias composer (the most complex piece). Other composer functions land in Task 5.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_dashboard_home_service.py`:

```python
"""Unit tests for dashboard_home_service composers."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.empresa import Empresa, EmpresaUsuario
from app.models.licitacion import Licitacion
from app.models.postulacion import ChecklistPostulacion, Postulacion
from app.models.user import User
from app.services.dashboard_home_service import compose_urgencias


@pytest.mark.asyncio
async def test_compose_urgencias_includes_postulacion_closing_in_36h(
    async_db: AsyncSession,
    sample_user: User,
    sample_empresa: Empresa,
):
    """A postulación whose licitación closes in <48h must produce a red urgencia."""
    now = datetime.now(timezone.utc)
    cierre = now + timedelta(hours=36)

    licitacion = Licitacion(
        codigo_externo="LIC-TEST-001",
        nombre="Servicios de aseo Municipalidad de Ñuñoa",
        fecha_publicacion=now - timedelta(days=5),
        fecha_cierre=cierre,
        estado="Publicada",
        codigo_organismo="ORG-001",
        nombre_organismo="Municipalidad de Ñuñoa",
        activo=True,
    )
    async_db.add(licitacion)
    await async_db.flush()

    postulacion = Postulacion(
        empresa_id=sample_empresa.id,
        licitacion_id=licitacion.id,
        estado="en_preparacion",
    )
    async_db.add(postulacion)
    await async_db.commit()

    items = await compose_urgencias(async_db, sample_user.id, sample_empresa.id)

    assert any(
        u.tipo == "postulacion_cierre" and u.severidad == "rojo" and "36h" in u.tiempo_label
        for u in items
    )
```

This test depends on async fixtures `async_db`, `sample_user`, `sample_empresa`. Add them in step 2.

- [ ] **Step 2: Add the async fixtures to conftest**

Append to `backend/tests/conftest.py`:

```python
from uuid import uuid4

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from app.models.empresa import Empresa, EmpresaUsuario
from app.models.user import User

ASYNC_TEST_URL = "sqlite+aiosqlite:///./test_async.db"


@pytest_asyncio.fixture(scope="function")
async def async_engine():
    eng = create_async_engine(ASYNC_TEST_URL, future=True)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture(scope="function")
async def async_db(async_engine) -> AsyncSession:
    SessionLocal = sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def sample_user(async_db: AsyncSession) -> User:
    user = User(
        username="testuser",
        email="test@example.com",
        hashed_password="x",
        full_name="Test User",
        is_active=True,
        plan_tier="paid",
    )
    async_db.add(user)
    await async_db.commit()
    await async_db.refresh(user)
    return user


@pytest_asyncio.fixture
async def sample_empresa(async_db: AsyncSession, sample_user: User) -> Empresa:
    empresa = Empresa(
        rut_empresa="76543210-K",
        nombre_empresa="Constructora Test",
        estado_habil="habil",
    )
    async_db.add(empresa)
    await async_db.flush()
    membership = EmpresaUsuario(
        user_id=sample_user.id,
        empresa_id=empresa.id,
        rol="owner",
    )
    async_db.add(membership)
    await async_db.commit()
    await async_db.refresh(empresa)
    return empresa
```

Also add at the top of conftest if missing: `from app.db import Base`.

Install the async sqlite driver if needed:
```bash
pip install aiosqlite pytest-asyncio
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from `backend/`):
```bash
pytest tests/test_dashboard_home_service.py::test_compose_urgencias_includes_postulacion_closing_in_36h -v
```

Expected: `ImportError` or `ModuleNotFoundError` for `compose_urgencias` (function doesn't exist yet). That's the "red" phase.

- [ ] **Step 4: Implement `compose_urgencias`**

Create `backend/app/services/dashboard_home_service.py`:

```python
"""Composer for GET /api/dashboard/home payload.

Single-roundtrip aggregator that reads from Postulacion, Licitacion, Alert,
DocumentoEmpresa, Empresa, and dashboard_home_cache. All heavy lifting (TF-IDF
matching) is pre-computed by the precompute_dashboard_matches Celery task.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.alert import Alert, AlertStatus, AlertType
from app.models.empresa import DocumentoEmpresa, Empresa
from app.models.licitacion import Licitacion
from app.models.postulacion import ChecklistPostulacion, Postulacion
from app.schemas.dashboard_home import UrgenciaItem


def _hours_label(delta: timedelta) -> str:
    total_seconds = int(delta.total_seconds())
    if total_seconds < 0:
        return "vencido"
    hours = total_seconds // 3600
    if hours < 72:
        return f"{hours}h"
    days = hours // 24
    return f"{days}d"


def _severity_for_hours(hours: float) -> str:
    if hours < 48:
        return "rojo"
    if hours < 168:  # 7 days
        return "naranja"
    return "amarillo"


async def _checklist_completion(db: AsyncSession, postulacion_id: UUID) -> Optional[float]:
    """Return % of completed mandatory checklist items, or None if no checklist."""
    rows = (
        await db.execute(
            select(ChecklistPostulacion).where(
                ChecklistPostulacion.postulacion_id == postulacion_id,
                ChecklistPostulacion.es_obligatorio.is_(True),
            )
        )
    ).scalars().all()
    if not rows:
        return None
    done = sum(1 for r in rows if r.completado)
    return done / len(rows)


async def compose_urgencias(
    db: AsyncSession, user_id: int, empresa_id: UUID
) -> list[UrgenciaItem]:
    """Compose the urgency list from 4 sources, sorted by severity then time."""
    items: list[tuple[int, datetime, UrgenciaItem]] = []
    now = datetime.now(timezone.utc)
    today = date.today()

    # ── 1. Postulaciones with fecha_cierre in the next 7 days ────────────────
    cutoff = now + timedelta(days=7)
    rows = (
        await db.execute(
            select(Postulacion, Licitacion)
            .join(Licitacion, Postulacion.licitacion_id == Licitacion.id)
            .where(
                Postulacion.empresa_id == empresa_id,
                Postulacion.estado.in_(("en_seguimiento", "en_preparacion")),
                Licitacion.fecha_cierre.isnot(None),
                Licitacion.fecha_cierre > now,
                Licitacion.fecha_cierre <= cutoff,
            )
        )
    ).all()
    for postulacion, licitacion in rows:
        delta = licitacion.fecha_cierre - now
        hours = delta.total_seconds() / 3600
        severidad = _severity_for_hours(hours)
        completion = await _checklist_completion(db, postulacion.id)
        subtitulo_parts = [
            f"Cierre {licitacion.fecha_cierre.astimezone().strftime('%d %b %H:%M')}"
        ]
        if completion is not None:
            subtitulo_parts.append(f"Checklist {int(completion * 100)}%")
            cta_label = "Completar" if completion < 1 else "Postular"
        else:
            cta_label = (
                "Postular" if postulacion.estado == "en_seguimiento" else "Completar"
            )
        item = UrgenciaItem(
            id=f"postulacion_{postulacion.id}",
            tipo="postulacion_cierre",
            severidad=severidad,
            tiempo_label=_hours_label(delta),
            titulo=f"{licitacion.codigo_externo} {licitacion.nombre[:80]}",
            subtitulo=" · ".join(subtitulo_parts),
            cta_label=cta_label,
            cta_href=f"/dashboard/postulaciones/{postulacion.id}",
        )
        sev_rank = {"rojo": 0, "naranja": 1, "amarillo": 2}[severidad]
        items.append((sev_rank, licitacion.fecha_cierre, item))

    # ── 2. Documentos vencen en próximos 30 días ─────────────────────────────
    doc_cutoff = today + timedelta(days=30)
    docs = (
        await db.execute(
            select(DocumentoEmpresa).where(
                DocumentoEmpresa.empresa_id == empresa_id,
                DocumentoEmpresa.eliminado.is_(False),
                DocumentoEmpresa.fecha_vencimiento.isnot(None),
                DocumentoEmpresa.fecha_vencimiento >= today,
                DocumentoEmpresa.fecha_vencimiento <= doc_cutoff,
            )
        )
    ).scalars().all()
    for doc in docs:
        days_left = (doc.fecha_vencimiento - today).days
        if days_left < 7:
            severidad = "rojo"
            cta_label = "Subir nuevo"
        else:
            severidad = "naranja"
            cta_label = "Renovar"
        sev_rank = {"rojo": 0, "naranja": 1, "amarillo": 2}[severidad]
        item = UrgenciaItem(
            id=f"documento_{doc.id}",
            tipo="documento_vence",
            severidad=severidad,
            tiempo_label=f"{days_left}d",
            titulo=f"Documento: {doc.nombre}",
            subtitulo=(
                f"Vence el {doc.fecha_vencimiento.strftime('%d %b')} · "
                f"Quedan {days_left} días"
            ),
            cta_label=cta_label,
            cta_href="/dashboard/documentos",
        )
        items.append(
            (
                sev_rank,
                datetime.combine(doc.fecha_vencimiento, datetime.min.time()).replace(
                    tzinfo=timezone.utc
                ),
                item,
            )
        )

    # ── 3. Empresa estado_habil != 'habil' ───────────────────────────────────
    empresa = (
        await db.execute(select(Empresa).where(Empresa.id == empresa_id))
    ).scalar_one_or_none()
    if empresa and empresa.estado_habil != "habil":
        ts = empresa.estado_habil_updated_at
        ts_label = ts.strftime("%d %b") if ts else "fecha desconocida"
        item = UrgenciaItem(
            id=f"estado_{empresa.id}",
            tipo="estado_inhabil",
            severidad="amarillo",
            tiempo_label="—",
            titulo=f"Estado {empresa.estado_habil} desde {ts_label}",
            subtitulo="Revisa deudas en Tesorería para volver a hábil",
            cta_label="Ver detalle",
            cta_href="/dashboard/empresa",
        )
        items.append((2, datetime.max.replace(tzinfo=timezone.utc), item))

    # ── 4. Unread NUEVA_LICITACION_MATCH alerts (last 5 days) ────────────────
    cutoff_alert = now - timedelta(days=5)
    alerts = (
        await db.execute(
            select(Alert).where(
                Alert.user_id == user_id,
                Alert.alert_type == AlertType.NUEVA_LICITACION_MATCH,
                Alert.status != AlertStatus.READ,
                Alert.created_at >= cutoff_alert,
            )
        )
    ).scalars().all()
    for alert in alerts:
        delta = now - alert.created_at
        days_old = max(int(delta.total_seconds() // 86400), 0)
        item = UrgenciaItem(
            id=f"alert_{alert.id}",
            tipo="match_alto",
            severidad="naranja",
            tiempo_label=f"{days_old}d",
            titulo=alert.title,
            subtitulo=alert.message[:120] if alert.message else "Match nuevo de alto score",
            cta_label="Revisar",
            cta_href=f"/dashboard/tenders/{alert.entity_id}",
        )
        items.append((1, alert.created_at, item))

    items.sort(key=lambda t: (t[0], t[1]))
    return [it for _, _, it in items[:5]]
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `backend/`):
```bash
pytest tests/test_dashboard_home_service.py::test_compose_urgencias_includes_postulacion_closing_in_36h -v
```

Expected: PASS.

- [ ] **Step 6: Add 3 more behavior tests**

Append to `backend/tests/test_dashboard_home_service.py`:

```python
@pytest.mark.asyncio
async def test_compose_urgencias_includes_documento_vence_orange(
    async_db, sample_user, sample_empresa,
):
    from datetime import date as _date
    doc = DocumentoEmpresa(
        empresa_id=sample_empresa.id,
        nombre="Certificado de antecedentes",
        tipo_documento="certificado",
        s3_key="x",
        s3_bucket="b",
        fecha_vencimiento=_date.today() + timedelta(days=20),
    )
    async_db.add(doc)
    await async_db.commit()
    items = await compose_urgencias(async_db, sample_user.id, sample_empresa.id)
    assert any(
        u.tipo == "documento_vence" and u.severidad == "naranja" for u in items
    )


@pytest.mark.asyncio
async def test_compose_urgencias_includes_estado_inhabil(
    async_db, sample_user, sample_empresa,
):
    sample_empresa.estado_habil = "inhabil"
    sample_empresa.estado_habil_updated_at = datetime.now(timezone.utc) - timedelta(days=4)
    await async_db.commit()
    items = await compose_urgencias(async_db, sample_user.id, sample_empresa.id)
    assert any(u.tipo == "estado_inhabil" and u.severidad == "amarillo" for u in items)


@pytest.mark.asyncio
async def test_compose_urgencias_returns_empty_when_nothing_urgent(
    async_db, sample_user, sample_empresa,
):
    items = await compose_urgencias(async_db, sample_user.id, sample_empresa.id)
    assert items == []
```

Run (from `backend/`):
```bash
pytest tests/test_dashboard_home_service.py -v
```

Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/dashboard_home_service.py backend/tests/test_dashboard_home_service.py backend/tests/conftest.py
git commit -m "feat(service): compose_urgencias for dashboard home

Aggregates from 4 sources (postulaciones with closing fecha_cierre,
expiring documents, estado hábil != hábil, unread NUEVA_LICITACION_MATCH
alerts). Sorts by severity then time, caps at 5 items."
```

---

### Task 5: Service — resumen, pipeline, trend, matches loader

**Files:**
- Modify: `backend/app/services/dashboard_home_service.py`
- Modify: `backend/tests/test_dashboard_home_service.py`

- [ ] **Step 1: Write failing tests for the remaining composers**

Append to `backend/tests/test_dashboard_home_service.py`:

```python
from app.services.dashboard_home_service import (
    compose_pipeline,
    compose_resumen,
    compose_trend,
    load_matches,
)


@pytest.mark.asyncio
async def test_compose_pipeline_counts_by_estado(
    async_db, sample_user, sample_empresa,
):
    """Pipeline counts must reflect the 5 displayed estados over the last 90 days."""
    now = datetime.now(timezone.utc)
    licitacion = Licitacion(
        codigo_externo="LIC-PIPE-001",
        nombre="Test pipeline",
        fecha_publicacion=now - timedelta(days=30),
        fecha_cierre=now + timedelta(days=10),
        estado="Publicada",
        activo=True,
    )
    async_db.add(licitacion)
    await async_db.flush()
    for estado in ("en_seguimiento", "en_preparacion", "enviada", "adjudicada"):
        async_db.add(
            Postulacion(
                empresa_id=sample_empresa.id,
                licitacion_id=licitacion.id,
                estado=estado,
            )
        )
        # Each estado needs a unique licitacion (UniqueConstraint), so re-create
        await async_db.flush()
        licitacion = Licitacion(
            codigo_externo=f"LIC-PIPE-{estado}",
            nombre=f"Test pipeline {estado}",
            fecha_publicacion=now - timedelta(days=30),
            fecha_cierre=now + timedelta(days=10),
            estado="Publicada",
            activo=True,
        )
        async_db.add(licitacion)
        await async_db.flush()
    await async_db.commit()

    pipeline = await compose_pipeline(async_db, sample_empresa.id)
    assert pipeline.en_seguimiento == 1
    assert pipeline.en_preparacion == 1
    assert pipeline.enviada == 1
    assert pipeline.adjudicada == 1


@pytest.mark.asyncio
async def test_compose_resumen_aggregates_counts(
    async_db, sample_user, sample_empresa,
):
    resumen = await compose_resumen(async_db, sample_user.id, sample_empresa.id)
    assert resumen.matches_semana == 0
    assert resumen.postulaciones_activas == 0


@pytest.mark.asyncio
async def test_compose_trend_unavailable_with_short_history(
    async_db, sample_user, sample_empresa,
):
    trend = await compose_trend(async_db, sample_empresa.id)
    assert trend.disponible is False
    assert trend.postulaciones_semana == []


@pytest.mark.asyncio
async def test_load_matches_returns_empty_when_no_cache(
    async_db, sample_user, sample_empresa,
):
    matches, cached_at, total = await load_matches(async_db, sample_empresa.id)
    assert matches == []
    assert cached_at is None
    assert total == 0
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pytest tests/test_dashboard_home_service.py -v`

Expected: 4 new tests fail with `ImportError` for the missing functions.

- [ ] **Step 3: Implement the four composers**

Append to `backend/app/services/dashboard_home_service.py`:

```python
from sqlalchemy import func

from app.models.dashboard_cache import DashboardHomeCache
from app.schemas.dashboard_home import (
    MatchItem,
    PipelineCounts,
    ResumenStats,
    TrendStats,
)


PIPELINE_ESTADOS = (
    "en_seguimiento",
    "en_preparacion",
    "enviada",
    "adjudicada",
    "no_adjudicada",
)


async def compose_pipeline(db: AsyncSession, empresa_id: UUID) -> PipelineCounts:
    """Counts per estado over the last 90 days + tasa de adjudicación."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    rows = (
        await db.execute(
            select(Postulacion.estado, func.count(Postulacion.id))
            .where(
                Postulacion.empresa_id == empresa_id,
                Postulacion.created_at >= cutoff,
                Postulacion.estado.in_(PIPELINE_ESTADOS),
            )
            .group_by(Postulacion.estado)
        )
    ).all()
    counts = {estado: 0 for estado in PIPELINE_ESTADOS}
    for estado, n in rows:
        counts[estado] = n
    decididas = counts["adjudicada"] + counts["no_adjudicada"]
    tasa = (counts["adjudicada"] / decididas) if decididas >= 3 else None
    return PipelineCounts(
        en_seguimiento=counts["en_seguimiento"],
        en_preparacion=counts["en_preparacion"],
        enviada=counts["enviada"],
        adjudicada=counts["adjudicada"],
        no_adjudicada=counts["no_adjudicada"],
        tasa_adjudicacion_90d=round(tasa, 4) if tasa is not None else None,
        decididas_90d=decididas,
    )


async def compose_resumen(
    db: AsyncSession, user_id: int, empresa_id: UUID
) -> ResumenStats:
    """Counts used by the narrative template + secondary KPIs."""
    now = datetime.now(timezone.utc)
    today = date.today()
    week_ago = now - timedelta(days=7)
    cutoff_72h = now + timedelta(hours=72)
    month_start = today.replace(day=1)

    # matches_semana: alerts of NUEVA_LICITACION_MATCH in last 7 days
    matches_week = (
        await db.execute(
            select(func.count(Alert.id)).where(
                Alert.user_id == user_id,
                Alert.alert_type == AlertType.NUEVA_LICITACION_MATCH,
                Alert.created_at >= week_ago,
            )
        )
    ).scalar() or 0

    # matches_72h: same but where the alerted licitación closes <72h
    # We'd need a join through alert.entity_id → licitacion. Approximate by
    # counting alerts created in last 7d whose alert_metadata contains a
    # matching closing flag (set by alert_engine when it matches an urgent lic).
    # Fallback: count postulaciones cerrando <72h (already separate field).

    postulaciones_72h = (
        await db.execute(
            select(func.count(Postulacion.id))
            .join(Licitacion, Postulacion.licitacion_id == Licitacion.id)
            .where(
                Postulacion.empresa_id == empresa_id,
                Postulacion.estado.in_(("en_seguimiento", "en_preparacion")),
                Licitacion.fecha_cierre.isnot(None),
                Licitacion.fecha_cierre > now,
                Licitacion.fecha_cierre <= cutoff_72h,
            )
        )
    ).scalar() or 0

    postulaciones_activas = (
        await db.execute(
            select(func.count(Postulacion.id)).where(
                Postulacion.empresa_id == empresa_id,
                Postulacion.estado.in_(("en_seguimiento", "en_preparacion", "enviada")),
            )
        )
    ).scalar() or 0

    docs_30d = (
        await db.execute(
            select(func.count(DocumentoEmpresa.id)).where(
                DocumentoEmpresa.empresa_id == empresa_id,
                DocumentoEmpresa.eliminado.is_(False),
                DocumentoEmpresa.fecha_vencimiento.isnot(None),
                DocumentoEmpresa.fecha_vencimiento >= today,
                DocumentoEmpresa.fecha_vencimiento <= today + timedelta(days=30),
            )
        )
    ).scalar() or 0

    docs_7d = (
        await db.execute(
            select(func.count(DocumentoEmpresa.id)).where(
                DocumentoEmpresa.empresa_id == empresa_id,
                DocumentoEmpresa.eliminado.is_(False),
                DocumentoEmpresa.fecha_vencimiento.isnot(None),
                DocumentoEmpresa.fecha_vencimiento >= today,
                DocumentoEmpresa.fecha_vencimiento <= today + timedelta(days=7),
            )
        )
    ).scalar() or 0

    adjudicaciones_mes = (
        await db.execute(
            select(func.count(Postulacion.id)).where(
                Postulacion.empresa_id == empresa_id,
                Postulacion.estado == "adjudicada",
                Postulacion.created_at >= datetime.combine(
                    month_start, datetime.min.time(), tzinfo=timezone.utc
                ),
            )
        )
    ).scalar() or 0

    enviadas_mes = (
        await db.execute(
            select(func.count(Postulacion.id)).where(
                Postulacion.empresa_id == empresa_id,
                Postulacion.estado == "enviada",
                Postulacion.created_at >= datetime.combine(
                    month_start, datetime.min.time(), tzinfo=timezone.utc
                ),
            )
        )
    ).scalar() or 0

    return ResumenStats(
        matches_semana=int(matches_week),
        matches_72h=0,  # v1: rely on postulaciones_cierran_72h fallback in narrative
        postulaciones_activas=int(postulaciones_activas),
        postulaciones_cierran_72h=int(postulaciones_72h),
        docs_por_vencer_30d=int(docs_30d),
        docs_por_vencer_7d=int(docs_7d),
        adjudicaciones_mes=int(adjudicaciones_mes),
        enviadas_mes=int(enviadas_mes),
    )


async def compose_trend(db: AsyncSession, empresa_id: UUID) -> TrendStats:
    """7-bucket weekly histogram + tasa change. Disabled if <30 days history."""
    earliest = (
        await db.execute(
            select(func.min(Postulacion.created_at)).where(
                Postulacion.empresa_id == empresa_id
            )
        )
    ).scalar()
    if earliest is None:
        return TrendStats(disponible=False)

    now = datetime.now(timezone.utc)
    if (now - earliest).days < 30:
        return TrendStats(disponible=False)

    buckets: list[int] = []
    for i in range(6, -1, -1):
        start = now - timedelta(days=(i + 1) * 7)
        end = now - timedelta(days=i * 7)
        n = (
            await db.execute(
                select(func.count(Postulacion.id)).where(
                    Postulacion.empresa_id == empresa_id,
                    Postulacion.estado == "enviada",
                    Postulacion.created_at >= start,
                    Postulacion.created_at < end,
                )
            )
        ).scalar() or 0
        buckets.append(int(n))

    tasa_cur = await _tasa_window(db, empresa_id, now - timedelta(days=30), now)
    tasa_prev = await _tasa_window(
        db, empresa_id, now - timedelta(days=60), now - timedelta(days=30)
    )

    return TrendStats(
        disponible=True,
        postulaciones_semana=buckets,
        tasa_adjudicacion_actual=tasa_cur,
        tasa_adjudicacion_anterior=tasa_prev,
        delta_enviadas_pp=buckets[-1] - buckets[-2] if len(buckets) >= 2 else None,
    )


async def _tasa_window(
    db: AsyncSession, empresa_id: UUID, start: datetime, end: datetime
) -> Optional[float]:
    rows = (
        await db.execute(
            select(Postulacion.estado).where(
                Postulacion.empresa_id == empresa_id,
                Postulacion.created_at >= start,
                Postulacion.created_at < end,
                Postulacion.estado.in_(("adjudicada", "no_adjudicada")),
            )
        )
    ).scalars().all()
    if len(rows) < 3:
        return None
    decididas = len(rows)
    adjudicadas = sum(1 for e in rows if e == "adjudicada")
    return round(adjudicadas / decididas, 4)


async def load_matches(
    db: AsyncSession, empresa_id: UUID
) -> tuple[list[MatchItem], Optional[datetime], int]:
    """Read pre-computed matches from dashboard_home_cache."""
    cache = (
        await db.execute(
            select(DashboardHomeCache).where(
                DashboardHomeCache.empresa_id == empresa_id
            )
        )
    ).scalar_one_or_none()
    if cache is None:
        return [], None, 0
    items = [MatchItem.model_validate(m) for m in (cache.matches or [])]
    return items, cache.cached_at, int(cache.matches_count or 0)
```

- [ ] **Step 4: Run all service tests**

Run: `pytest tests/test_dashboard_home_service.py -v`

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/dashboard_home_service.py backend/tests/test_dashboard_home_service.py
git commit -m "feat(service): add compose_resumen, compose_pipeline, compose_trend, load_matches

Pipeline counts only over last 90 days. Tasa de adjudicación returns
None when fewer than 3 decided. Trend is disabled when empresa has
<30 days of postulaciones history. Matches read-through from
dashboard_home_cache table populated by Celery."
```

---

## Phase C — API endpoint

### Task 6: `GET /api/dashboard/home`

**Files:**
- Modify: `backend/app/api/dashboard.py`
- Test: `backend/tests/test_dashboard_home_endpoint.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_dashboard_home_endpoint.py`:

```python
"""Integration tests for GET /api/dashboard/home."""
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient


def _login(client: TestClient, db) -> str:
    """Register a test user and return a JWT."""
    payload = {
        "username": "homeuser",
        "email": "home@example.com",
        "password": "password123",
        "full_name": "Home User",
    }
    client.post("/api/auth/register", json=payload)
    res = client.post(
        "/api/auth/login",
        json={"username": "homeuser", "password": "password123"},
    )
    return res.json()["access_token"]


def test_home_endpoint_returns_204_shape(client, db):
    token = _login(client, db)
    res = client.get(
        "/api/dashboard/home",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert "empresa" in body
    assert "resumen" in body
    assert "urgencias" in body
    assert "matches" in body
    assert "pipeline" in body
    assert "trend" in body
    assert "plan" in body


def test_home_endpoint_returns_403_for_unauthorized_empresa(client, db):
    """User must be a member of the empresa they query."""
    token = _login(client, db)
    fake_uuid = "00000000-0000-0000-0000-000000000000"
    res = client.get(
        f"/api/dashboard/home?empresa_id={fake_uuid}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code in (403, 404)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest tests/test_dashboard_home_endpoint.py -v`

Expected: 404 not 200 (endpoint doesn't exist yet).

- [ ] **Step 3: Implement the endpoint**

Append to `backend/app/api/dashboard.py`:

```python
from typing import Optional
from uuid import UUID

from app.models.empresa import Empresa, EmpresaUsuario
from app.schemas.dashboard_home import (
    DashboardHomeResponse,
    EmpresaSummary,
    PlanInfo,
)
from app.services.dashboard_home_service import (
    compose_pipeline,
    compose_resumen,
    compose_trend,
    compose_urgencias,
    load_matches,
)


@router.get("/home", response_model=DashboardHomeResponse)
async def get_dashboard_home(
    empresa_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> DashboardHomeResponse:
    """Single-roundtrip aggregator for the operational home."""
    memberships = (
        await db.execute(
            select(EmpresaUsuario).where(EmpresaUsuario.user_id == current_user.id)
        )
    ).scalars().all()
    if not memberships:
        return DashboardHomeResponse(
            empresa=None,
            resumen=__import__("app.schemas.dashboard_home", fromlist=["ResumenStats"]).ResumenStats(),
            urgencias=[],
            matches=[],
            pipeline=__import__("app.schemas.dashboard_home", fromlist=["PipelineCounts"]).PipelineCounts(),
            trend=__import__("app.schemas.dashboard_home", fromlist=["TrendStats"]).TrendStats(),
            plan=PlanInfo(tier="free", matches_visibles=1),
        )

    member_ids = {m.empresa_id for m in memberships}
    if empresa_id is None:
        empresa_id = memberships[0].empresa_id
    elif empresa_id not in member_ids:
        raise HTTPException(status_code=403, detail="No eres miembro de esta empresa")

    empresa = (
        await db.execute(select(Empresa).where(Empresa.id == empresa_id))
    ).scalar_one_or_none()
    if empresa is None:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    resumen = await compose_resumen(db, current_user.id, empresa_id)
    urgencias = await compose_urgencias(db, current_user.id, empresa_id)
    pipeline = await compose_pipeline(db, empresa_id)
    trend = await compose_trend(db, empresa_id)
    matches, cached_at, total = await load_matches(db, empresa_id)

    plan_tier = "paid" if (current_user.plan_tier or "free") != "free" else "free"
    matches_visibles = 3 if plan_tier == "paid" else 1

    return DashboardHomeResponse(
        empresa=EmpresaSummary(
            id=empresa.id,
            nombre=empresa.nombre_empresa,
            rut=empresa.rut_empresa,
            estado_habil=empresa.estado_habil,
            estado_habil_updated_at=empresa.estado_habil_updated_at,
        ),
        resumen=resumen,
        urgencias=urgencias,
        matches=matches[:matches_visibles],
        matches_cached_at=cached_at,
        matches_total_disponibles=total,
        pipeline=pipeline,
        trend=trend,
        plan=PlanInfo(tier=plan_tier, matches_visibles=matches_visibles),
    )
```

Add the new imports near the top of `dashboard.py` (after the existing imports):

```python
from fastapi import HTTPException
```

- [ ] **Step 4: Run tests**

Run:
```bash
pytest tests/test_dashboard_home_endpoint.py -v
pytest tests/test_dashboard_home_service.py -v
```

Expected: all pass.

- [ ] **Step 5: Manual smoke test**

Start the backend (`uvicorn app.main:app --reload`) and curl:

```bash
TOKEN=$(curl -sX POST http://localhost:8000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"<your-user>","password":"<your-pwd>"}' | jq -r .access_token)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/dashboard/home | jq
```

Expected: full JSON response matching `DashboardHomeResponse` shape.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/dashboard.py backend/tests/test_dashboard_home_endpoint.py
git commit -m "feat(api): GET /api/dashboard/home unified endpoint

Single roundtrip aggregating empresa, resumen stats, urgencias,
matches (cached), pipeline counts and trend. Membership-scoped:
returns 403 if user is not a member of empresa_id. Defaults to
the user's first empresa when empresa_id is not provided.

Plan-aware: free tier sees 1 match, paid tier sees 3."
```

---

## Phase D — Celery pre-compute task

### Task 7: `precompute_dashboard_matches`

**Files:**
- Create: `backend/app/tasks/dashboard_tasks.py`
- Test: `backend/tests/test_dashboard_tasks.py`
- Modify: `backend/app/celery_app.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_dashboard_tasks.py`:

```python
"""Tests for dashboard Celery tasks."""
from datetime import datetime, timezone
from unittest.mock import patch
from uuid import UUID

import pytest

from app.models.dashboard_cache import DashboardHomeCache
from app.models.empresa import Empresa, EmpresaUsuario, TFIDFPerfil


def test_precompute_dashboard_matches_skips_when_feature_off(monkeypatch):
    from app.tasks import dashboard_tasks
    monkeypatch.setattr(dashboard_tasks.settings, "feature_tfidf", False)
    result = dashboard_tasks.precompute_dashboard_matches()
    assert result.get("skipped") is True


def test_precompute_dashboard_matches_writes_cache_for_empresa(db, monkeypatch):
    from app.tasks import dashboard_tasks

    empresa = Empresa(
        rut_empresa="11111111-1",
        nombre_empresa="Test ETL",
        estado_habil="habil",
    )
    db.add(empresa)
    db.flush()
    db.add(
        TFIDFPerfil(
            empresa_id=empresa.id,
            vector_bytes=b"fake",
            modelo_version="v1",
            rubros_usados=["rubro_a"],
        )
    )
    db.commit()

    fake_matches = [
        {
            "codigo_externo": "LIC-X",
            "nombre": "Servicios test",
            "organismo": "ORG",
            "monto_estimado": 100000.0,
            "moneda": "CLP",
            "fecha_cierre": datetime.now(timezone.utc).isoformat(),
            "score": 80,
            "href": "/dashboard/tenders/LIC-X",
        }
    ]

    monkeypatch.setattr(dashboard_tasks.settings, "feature_tfidf", True)
    with patch.object(
        dashboard_tasks, "_compute_matches_for_empresa", return_value=fake_matches
    ):
        result = dashboard_tasks.precompute_dashboard_matches()

    assert result.get("processed") == 1

    cache = db.query(DashboardHomeCache).filter_by(empresa_id=empresa.id).one()
    assert cache.matches_count == 1
    assert cache.matches[0]["codigo_externo"] == "LIC-X"
```

- [ ] **Step 2: Run to verify it fails**

Run: `pytest tests/test_dashboard_tasks.py -v`

Expected: ImportError for `dashboard_tasks`.

- [ ] **Step 3: Implement the task**

Create `backend/app/tasks/dashboard_tasks.py`:

```python
"""Daily TF-IDF match pre-computation for the operational home.

Runs at 06:00 SCL. For every empresa with a TFIDFPerfil, computes the
top-20 currently open licitaciones (TF-IDF semantic match) and upserts
them into dashboard_home_cache. The home endpoint reads from this cache
synchronously, so the home never calls BI live.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from app.celery_app import celery_app
from app.config import settings
from app.db import SyncSessionLocal as SessionLocal
from app.models.dashboard_cache import DashboardHomeCache
from app.models.empresa import Empresa, TFIDFPerfil
from app.models.licitacion import Licitacion

logger = logging.getLogger(__name__)


def _compute_matches_for_empresa(
    db, empresa_id, vector_bytes: bytes, top_n: int = 20
) -> list[dict[str, Any]]:
    """Score open licitaciones against the empresa's TF-IDF vector.

    Returns up to top_n match dicts ready for storage in dashboard_home_cache.
    Filters out licitaciones already closed (fecha_cierre <= now).
    """
    from app.services.tfidf_matcher import score_empresa_licitacion

    now = datetime.now(timezone.utc)
    licitaciones = (
        db.query(Licitacion)
        .filter(
            Licitacion.activo.is_(True),
            Licitacion.estado == "Publicada",
            Licitacion.fecha_cierre.isnot(None),
            Licitacion.fecha_cierre > now,
        )
        .all()
    )

    scored: list[tuple[float, Licitacion]] = []
    for lic in licitaciones:
        text = " ".join(filter(None, [lic.nombre or "", lic.descripcion or ""]))
        if not text.strip():
            continue
        score, _nivel = score_empresa_licitacion(vector_bytes, text)
        if score < 0.05:
            continue
        scored.append((score, lic))

    scored.sort(key=lambda t: t[0], reverse=True)
    out: list[dict[str, Any]] = []
    for score, lic in scored[:top_n]:
        score_int = max(0, min(100, int(round(score * 100))))
        out.append(
            {
                "codigo_externo": lic.codigo_externo,
                "nombre": lic.nombre,
                "organismo": lic.nombre_organismo or "",
                "monto_estimado": (
                    float(lic.monto_estimado) if lic.monto_estimado is not None else None
                ),
                "moneda": lic.moneda or "CLP",
                "fecha_cierre": (
                    lic.fecha_cierre.isoformat() if lic.fecha_cierre else None
                ),
                "score": score_int,
                "href": f"/dashboard/tenders/{lic.codigo_externo}",
            }
        )
    return out


@celery_app.task(name="app.tasks.dashboard_tasks.precompute_dashboard_matches")
def precompute_dashboard_matches() -> dict:
    """06:00 SCL daily: refresh dashboard_home_cache for every empresa with a TF-IDF profile."""
    if not settings.feature_tfidf:
        logger.info("[DashboardMatches] feature_tfidf disabled — skipping")
        return {"skipped": True}

    db = SessionLocal()
    processed = 0
    skipped = 0
    failed = 0
    try:
        perfiles = db.query(TFIDFPerfil).all()
        for perfil in perfiles:
            try:
                matches = _compute_matches_for_empresa(
                    db, perfil.empresa_id, perfil.vector_bytes
                )
                cache = (
                    db.query(DashboardHomeCache)
                    .filter(DashboardHomeCache.empresa_id == perfil.empresa_id)
                    .one_or_none()
                )
                now = datetime.now(timezone.utc)
                if cache is None:
                    cache = DashboardHomeCache(
                        empresa_id=perfil.empresa_id,
                        matches=matches,
                        matches_count=len(matches),
                        cached_at=now,
                        updated_at=now,
                    )
                    db.add(cache)
                else:
                    cache.matches = matches
                    cache.matches_count = len(matches)
                    cache.cached_at = now
                    cache.updated_at = now
                processed += 1
            except Exception as exc:
                failed += 1
                logger.error(
                    "[DashboardMatches] empresa=%s failed: %s", perfil.empresa_id, exc
                )
        db.commit()
        logger.info(
            "[DashboardMatches] processed=%d skipped=%d failed=%d", processed, skipped, failed
        )
        return {"processed": processed, "skipped": skipped, "failed": failed}
    except Exception as exc:
        db.rollback()
        logger.error("[DashboardMatches] fatal: %s", exc)
        raise
    finally:
        db.close()
```

- [ ] **Step 4: Register the task in beat schedule**

Edit `backend/app/celery_app.py`. Add the import at the bottom:

```python
from app.tasks import dashboard_tasks  # noqa
```

Add to `beat_schedule` dict (between `document-expiry` and `watchdog`):

```python
        # 06:00 SCL daily: pre-compute TF-IDF matches for the operational home.
        # Reads TFIDFPerfil per empresa, scores all open licitaciones, stores
        # top-20 in dashboard_home_cache. Home endpoint reads from cache only.
        "precompute-dashboard-matches": {
            "task": "app.tasks.dashboard_tasks.precompute_dashboard_matches",
            "schedule": crontab(hour=6, minute=0),
        },
```

- [ ] **Step 5: Run tests**

Run: `pytest tests/test_dashboard_tasks.py -v`

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/tasks/dashboard_tasks.py backend/app/celery_app.py backend/tests/test_dashboard_tasks.py
git commit -m "feat(tasks): add precompute_dashboard_matches Celery task

Runs daily at 06:00 SCL. Iterates every empresa with a TFIDFPerfil,
scores all open licitaciones against the empresa's TF-IDF vector,
and upserts top-20 (score >= 0.05) into dashboard_home_cache.

The dashboard /home endpoint reads from this cache synchronously,
so home page loads never burn BI quota."
```

---

## Phase E — Frontend foundations

### Task 8: TypeScript types + api client

**Files:**
- Create: `frontend/types/dashboardHome.ts`
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Create the types file**

Create `frontend/types/dashboardHome.ts`:

```typescript
export type Severidad = 'rojo' | 'naranja' | 'amarillo';

export type UrgenciaTipo =
  | 'postulacion_cierre'
  | 'documento_vence'
  | 'match_alto'
  | 'estado_inhabil'
  | 'checklist_incompleto'
  | 'estado_habil_cambio';

export interface EmpresaSummary {
  id: string;
  nombre: string;
  rut: string;
  estado_habil: string;
  estado_habil_updated_at: string | null;
}

export interface ResumenStats {
  matches_semana: number;
  matches_72h: number;
  postulaciones_activas: number;
  postulaciones_cierran_72h: number;
  docs_por_vencer_30d: number;
  docs_por_vencer_7d: number;
  adjudicaciones_mes: number;
  enviadas_mes: number;
}

export interface UrgenciaItem {
  id: string;
  tipo: UrgenciaTipo;
  severidad: Severidad;
  tiempo_label: string;
  titulo: string;
  subtitulo: string;
  cta_label: string;
  cta_href: string;
}

export interface MatchItem {
  codigo_externo: string;
  nombre: string;
  organismo: string;
  monto_estimado: number | null;
  moneda: string;
  fecha_cierre: string | null;
  score: number;
  href: string;
}

export interface PipelineCounts {
  en_seguimiento: number;
  en_preparacion: number;
  enviada: number;
  adjudicada: number;
  no_adjudicada: number;
  tasa_adjudicacion_90d: number | null;
  decididas_90d: number;
}

export interface TrendStats {
  disponible: boolean;
  postulaciones_semana: number[];
  tasa_adjudicacion_actual: number | null;
  tasa_adjudicacion_anterior: number | null;
  delta_enviadas_pp: number | null;
}

export interface PlanInfo {
  tier: 'free' | 'paid';
  matches_visibles: number;
}

export interface DashboardHomeResponse {
  empresa: EmpresaSummary | null;
  resumen: ResumenStats;
  urgencias: UrgenciaItem[];
  matches: MatchItem[];
  matches_cached_at: string | null;
  matches_total_disponibles: number;
  pipeline: PipelineCounts;
  trend: TrendStats;
  plan: PlanInfo;
}
```

- [ ] **Step 2: Add the api client method**

Open `frontend/lib/api.ts` and find the `// ── Dashboard ──` section (around line 94). Replace `getDashboardStats` block with:

```typescript
  // ── Dashboard ──────────────────────────────────────────────────────────────

  async getDashboardStats() {
    const res = await this.client.get('/api/dashboard/stats');
    return res.data;
  }

  async getDashboardHome(empresaId?: string) {
    const params = empresaId ? { empresa_id: empresaId } : {};
    const res = await this.client.get('/api/dashboard/home', { params });
    return res.data as import('@/types/dashboardHome').DashboardHomeResponse;
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/types/dashboardHome.ts frontend/lib/api.ts
git commit -m "feat(frontend): add DashboardHomeResponse types + getDashboardHome client method"
```

---

### Task 9: Narrative engine

**Files:**
- Create: `frontend/lib/narrative.ts`
- Create: `frontend/__tests__/narrative.test.ts`

This task uses Vitest. If the frontend has no test runner configured yet, set it up first (one-time):

```bash
cd frontend
npm install -D vitest @vitejs/plugin-react jsdom
```

Add to `frontend/package.json` scripts: `"test": "vitest"`.

Create `frontend/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({
  test: { environment: 'jsdom' },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});
```

- [ ] **Step 1: Write the failing tests**

Create `frontend/__tests__/narrative.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildNarrative } from '@/lib/narrative';
import type { DashboardHomeResponse } from '@/types/dashboardHome';

const baseResponse: DashboardHomeResponse = {
  empresa: { id: 'e1', nombre: 'Test', rut: '1-1', estado_habil: 'habil', estado_habil_updated_at: null },
  resumen: {
    matches_semana: 0,
    matches_72h: 0,
    postulaciones_activas: 0,
    postulaciones_cierran_72h: 0,
    docs_por_vencer_30d: 0,
    docs_por_vencer_7d: 0,
    adjudicaciones_mes: 0,
    enviadas_mes: 0,
  },
  urgencias: [],
  matches: [],
  matches_cached_at: null,
  matches_total_disponibles: 0,
  pipeline: {
    en_seguimiento: 0,
    en_preparacion: 0,
    enviada: 0,
    adjudicada: 0,
    no_adjudicada: 0,
    tasa_adjudicacion_90d: null,
    decididas_90d: 0,
  },
  trend: {
    disponible: false,
    postulaciones_semana: [],
    tasa_adjudicacion_actual: null,
    tasa_adjudicacion_anterior: null,
    delta_enviadas_pp: null,
  },
  plan: { tier: 'paid', matches_visibles: 3 },
};

describe('buildNarrative', () => {
  it('returns greeting + empty-state phrase when nothing is happening', () => {
    const out = buildNarrative({ data: baseResponse, firstName: 'Cristián', now: new Date('2026-04-19T08:00:00-03:00') });
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]).toMatch(/Cristián/);
    expect(out.join(' ')).toMatch(/Aprovecha|Sin novedades|Día tranquilo|despejado/i);
  });

  it('omits zero-value phrases', () => {
    const data = { ...baseResponse, resumen: { ...baseResponse.resumen, matches_semana: 5 } };
    const out = buildNarrative({ data, firstName: 'Ana', now: new Date('2026-04-19T08:00:00-03:00') });
    expect(out.join(' ')).not.toMatch(/0 postulaciones|0 documento|0 matches/);
  });

  it('mentions estado inhábil when estado is not habil', () => {
    const data = {
      ...baseResponse,
      empresa: { ...baseResponse.empresa!, estado_habil: 'inhabil' },
      resumen: { ...baseResponse.resumen, docs_por_vencer_30d: 2 },
    };
    const out = buildNarrative({ data, firstName: 'Pedro', now: new Date('2026-04-19T15:00:00-03:00') });
    expect(out.join(' ').toLowerCase()).toMatch(/inhábil|inhabil/);
  });

  it('uses morning greeting before noon, afternoon between 12 and 19, evening after 19', () => {
    const morning = buildNarrative({ data: baseResponse, firstName: 'X', now: new Date('2026-04-19T08:00:00-03:00') });
    const afternoon = buildNarrative({ data: baseResponse, firstName: 'X', now: new Date('2026-04-19T15:00:00-03:00') });
    const evening = buildNarrative({ data: baseResponse, firstName: 'X', now: new Date('2026-04-19T20:00:00-03:00') });
    expect(morning[0].toLowerCase()).toMatch(/buenos días|buen día|hola|arrancando|empezamos|cómo va|bienvenido|listo/);
    expect(afternoon[0].toLowerCase()).toMatch(/buenas tardes|hola|cómo vas|buen día|en la mitad|de vuelta|espero/);
    expect(evening[0].toLowerCase()).toMatch(/buenas noches|cerrando|última pasada|hola|resumen/);
  });

  it('produces stable output for the same date but rotates across days', () => {
    const day1a = buildNarrative({ data: { ...baseResponse, resumen: { ...baseResponse.resumen, matches_semana: 8, matches_72h: 2 } }, firstName: 'X', now: new Date('2026-04-19T08:00:00-03:00') });
    const day1b = buildNarrative({ data: { ...baseResponse, resumen: { ...baseResponse.resumen, matches_semana: 8, matches_72h: 2 } }, firstName: 'X', now: new Date('2026-04-19T20:00:00-03:00') });
    const day2 = buildNarrative({ data: { ...baseResponse, resumen: { ...baseResponse.resumen, matches_semana: 8, matches_72h: 2 } }, firstName: 'X', now: new Date('2026-04-20T08:00:00-03:00') });
    expect(day1a[1]).toEqual(day1b[1]); // same date → same phrase 1
    expect(day1a[1]).not.toEqual(day2[1]); // different date → different phrase 1
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `frontend/`):
```bash
npm test -- run
```

Expected: 5 failures with "Cannot find module '@/lib/narrative'".

- [ ] **Step 3: Implement the narrative engine**

Create `frontend/lib/narrative.ts`:

```typescript
import type { DashboardHomeResponse } from '@/types/dashboardHome';

const GREETINGS_MORNING = [
  'Buenos días', 'Buen día', 'Hola', 'Arrancando el día',
  'Empezamos', 'Cómo va el día', 'Bienvenido de vuelta', 'Listo para hoy',
];
const GREETINGS_AFTERNOON = [
  'Buenas tardes', 'Hola', 'Cómo vas', 'Buen día por la tarde',
  'Espero buena tarde', 'En la mitad del día', 'De vuelta',
];
const GREETINGS_EVENING = [
  'Buenas noches', 'Cerrando el día', 'Última pasada del día', 'Hola', 'Resumen de cierre',
];

const MATCHES_PHRASES = [
  (n: number) => `Esta semana aparecieron ${n} matches nuevos`,
  (n: number) => `Hay ${n} licitaciones nuevas que calzan con tu perfil`,
  (n: number) => `Encontramos ${n} oportunidades para ti esta semana`,
  (n: number) => `${n} licitaciones cruzaron tu radar`,
  (n: number) => `Se publicaron ${n} licitaciones que encajan con lo que haces`,
  (n: number) => `Tienes ${n} matches frescos para revisar`,
  (n: number) => `${n} oportunidades nuevas te apuntan`,
  (n: number) => `Aparecieron ${n} licitaciones nuevas en tus rubros`,
];

const URGENCY_SUFFIXES = [
  (m: number) => ` — ${m} cierran en menos de 72h`,
  (m: number) => ` — ${m} vencen pronto`,
  (m: number) => ` — ${m} están en cuenta regresiva`,
  (m: number) => ` — ${m} necesitan respuesta esta semana`,
  (m: number) => ` — ojo, ${m} cierran en <72h`,
  (m: number) => ` — ${m} requieren atención inmediata`,
];

const POSTULACIONES_PHRASES = [
  (n: number) => `Tienes ${n} postulaciones en curso`,
  (n: number) => `${n} postulaciones activas en tu pipeline`,
  (n: number) => `Hay ${n} en preparación o seguimiento`,
  (n: number) => `Estás trabajando en ${n} postulaciones`,
  (n: number) => `${n} licitaciones en tu mesa`,
];

const DOCS_PHRASES = [
  (n: number) => `${n} ${n === 1 ? 'documento' : 'documentos'} ${n === 1 ? 'vence' : 'vencen'} este mes`,
  (n: number) => `${n} ${n === 1 ? 'documento' : 'documentos'} por renovar pronto`,
  (n: number) => `Atención: ${n} ${n === 1 ? 'doc caduca' : 'docs caducan'} en los próximos 30 días`,
  (n: number) => `${n} ${n === 1 ? 'documento requiere' : 'documentos requieren'} renovación`,
];

const INHABIL_PHRASES = [
  'Importante: tu empresa figura inhábil',
  'Atención: estás inhábil en Mercado Público',
  'Ojo: tu estado actual es inhábil',
  'Estado inhábil — revisa documentos en Tesorería',
];

const ADJUDICACIONES_PHRASES = [
  (n: number) => `Ya van ${n} adjudicaciones este mes`,
  (n: number) => `Has ganado ${n} licitaciones este mes`,
  (n: number) => `${n} adjudicaciones a tu favor este mes`,
  (n: number) => `Buen mes: ${n} adjudicada${n === 1 ? '' : 's'}`,
];

const EMPTY_PHRASES = [
  'No hay nada urgente por ahora. Buen momento para revisar tu perfil de rubros.',
  'Todo despejado por ahora. Aprovecha para configurar alertas.',
  'Sin novedades urgentes. Es buena hora para mirar tu pipeline con calma.',
  'Día tranquilo. Revisa tus alertas o explora /bi para encontrar nuevos compradores.',
];

function pickGreeting(hour: number): string[] {
  if (hour >= 6 && hour < 12) return GREETINGS_MORNING;
  if (hour >= 12 && hour < 19) return GREETINGS_AFTERNOON;
  if (hour >= 19) return GREETINGS_EVENING;
  return GREETINGS_MORNING;
}

function dateSeed(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function pick<T>(pool: T[], seed: number, slot: number): T {
  return pool[(seed + slot * 7919) % pool.length];
}

interface BuildArgs {
  data: DashboardHomeResponse;
  firstName: string;
  now: Date;
}

export function buildNarrative({ data, firstName, now }: BuildArgs): string[] {
  const seed = dateSeed(now);
  const hour = now.getHours();
  const greetings = pickGreeting(hour);
  const greeting = `${pick(greetings, seed, 0)}, ${firstName || 'hola'}.`;

  const out: string[] = [greeting];
  const r = data.resumen;
  const inhabil = data.empresa && data.empresa.estado_habil !== 'habil';

  // Phrase 1: matches + urgency suffix
  if (r.matches_semana > 0) {
    let p = pick(MATCHES_PHRASES, seed, 1)(r.matches_semana);
    const urgentCount = r.matches_72h > 0 ? r.matches_72h : r.postulaciones_cierran_72h;
    if (urgentCount > 0) {
      p += pick(URGENCY_SUFFIXES, seed, 2)(urgentCount);
    }
    out.push(p + '.');
  }

  // Phrase 2: priority — inhabil > docs > postulaciones > adjudicaciones
  const secondaryParts: string[] = [];
  if (inhabil) {
    secondaryParts.push(pick(INHABIL_PHRASES, seed, 3));
  } else if (r.docs_por_vencer_30d > 0) {
    secondaryParts.push(pick(DOCS_PHRASES, seed, 3)(r.docs_por_vencer_30d));
  } else if (r.postulaciones_activas > 0) {
    secondaryParts.push(pick(POSTULACIONES_PHRASES, seed, 3)(r.postulaciones_activas));
  } else if (r.adjudicaciones_mes > 0) {
    secondaryParts.push(pick(ADJUDICACIONES_PHRASES, seed, 3)(r.adjudicaciones_mes));
  }
  if (secondaryParts.length > 0) out.push(secondaryParts.join('. ') + '.');

  // Phrase 3: optional positive note when first phrases were urgent
  if (out.length >= 2 && r.adjudicaciones_mes > 0 && !inhabil) {
    out.push(pick(ADJUDICACIONES_PHRASES, seed, 4)(r.adjudicaciones_mes) + '.');
  }

  // Empty state — no concrete data
  if (out.length === 1) {
    out.push(pick(EMPTY_PHRASES, seed, 5));
  }

  return out.slice(0, 3);
}
```

- [ ] **Step 4: Run tests until green**

Run (from `frontend/`):
```bash
npm test -- run
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/narrative.ts frontend/__tests__/narrative.test.ts frontend/vitest.config.ts frontend/package.json
git commit -m "feat(frontend): narrative engine for dashboard greeting

Pure-function template with broad variant pools (8 greetings per
time-of-day, 8 matches phrases, 6 urgency suffixes, 5 postulaciones
phrases, 4 docs phrases, 4 inhabil, 4 adjudicaciones, 4 empty).
Selection seeded by date so the output is stable through the day
on refresh but rotates day-to-day. Estado inhabil always wins over
docs and adjudicaciones."
```

---

### Task 10: Empresa active context + switcher modal

**Files:**
- Create: `frontend/lib/empresaActive.ts`
- Create: `frontend/components/dashboard/EmpresaSwitcher.tsx`

- [ ] **Step 1: Write the localStorage helper**

Create `frontend/lib/empresaActive.ts`:

```typescript
const KEY = 'tordo_empresa_activa_id';

export function getEmpresaActiva(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(KEY);
}

export function setEmpresaActiva(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, id);
}

export function clearEmpresaActiva(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
}
```

- [ ] **Step 2: Write the switcher modal**

Create `frontend/components/dashboard/EmpresaSwitcher.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { getEmpresaActiva, setEmpresaActiva } from '@/lib/empresaActive';

interface EmpresaOption {
  id: string;
  nombre_empresa: string;
  rut_empresa: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSwitch: (empresaId: string) => void;
}

export function EmpresaSwitcher({ open, onClose, onSwitch }: Props) {
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiClient.getEmpresas()
      .then((list: EmpresaOption[]) => {
        setEmpresas(Array.isArray(list) ? list : []);
        setActive(getEmpresaActiva() || (list[0]?.id ?? null));
      })
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function choose(id: string) {
    setEmpresaActiva(id);
    onSwitch(id);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl shadow-card-lg w-full max-w-md mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text">Cambiar empresa activa</h2>
          <button onClick={onClose} className="text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>
        {loading ? (
          <div className="py-6 text-center text-sm text-muted">Cargando...</div>
        ) : empresas.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted">No tienes empresas registradas.</div>
        ) : (
          <ul className="space-y-1">
            {empresas.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => choose(e.id)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-primary/5 transition-colors text-left"
                >
                  <div>
                    <div className="text-sm font-medium text-text">{e.nombre_empresa}</div>
                    <div className="text-xs text-muted">{e.rut_empresa}</div>
                  </div>
                  {active === e.id && <Check size={16} className="text-accent" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

If `apiClient.getEmpresas()` does not exist, add it to `frontend/lib/api.ts` first.

- [ ] **Step 3: Verify TS compiles**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/empresaActive.ts frontend/components/dashboard/EmpresaSwitcher.tsx frontend/lib/api.ts
git commit -m "feat(frontend): EmpresaSwitcher modal + empresaActive localStorage helper

Lets multi-empresa users switch the active context for the home
without a global AuthContext refactor. Persisted in localStorage."
```

---

## Phase F — Frontend zones

### Task 11: DashboardHeader (zone A)

**Files:**
- Create: `frontend/components/dashboard/DashboardHeader.tsx`

- [ ] **Step 1: Implement the component**

```typescript
'use client';

import { useState } from 'react';
import { Building2, ChevronDown } from 'lucide-react';
import type { DashboardHomeResponse } from '@/types/dashboardHome';
import { buildNarrative } from '@/lib/narrative';
import { EmpresaSwitcher } from './EmpresaSwitcher';

interface Props {
  data: DashboardHomeResponse;
  firstName: string;
  onEmpresaSwitch: (id: string) => void;
}

export function DashboardHeader({ data, firstName, onEmpresaSwitch }: Props) {
  const [open, setOpen] = useState(false);
  const lines = buildNarrative({ data, firstName, now: new Date() });

  return (
    <>
      <div className="card p-4 sm:p-5">
        {data.empresa && (
          <div className="flex items-center gap-2 text-xs text-muted mb-2">
            <Building2 size={13} />
            <span>
              Actuando como <span className="font-semibold text-text">{data.empresa.nombre}</span>
              {' · '}
              <span>{data.empresa.rut}</span>
            </span>
            <button
              onClick={() => setOpen(true)}
              className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              Cambiar <ChevronDown size={12} />
            </button>
          </div>
        )}
        <div className="space-y-1">
          {lines.map((l, i) => (
            <p
              key={i}
              className={i === 0 ? 'text-base sm:text-lg font-semibold text-text' : 'text-sm text-muted'}
            >
              {l}
            </p>
          ))}
        </div>
      </div>
      <EmpresaSwitcher open={open} onClose={() => setOpen(false)} onSwitch={onEmpresaSwitch} />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/dashboard/DashboardHeader.tsx
git commit -m "feat(frontend): DashboardHeader with empresa badge and narrative summary"
```

---

### Task 12: UrgencyZone (zone B)

**Files:**
- Create: `frontend/components/dashboard/UrgencyZone.tsx`

- [ ] **Step 1: Implement the component**

```typescript
'use client';

import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import type { UrgenciaItem } from '@/types/dashboardHome';

const SEVERITY_DOT: Record<string, string> = {
  rojo: 'bg-danger',
  naranja: 'bg-orange-500',
  amarillo: 'bg-yellow-500',
};

interface Props {
  items: UrgenciaItem[];
  empresaPresent: boolean;
}

export function UrgencyZone({ items, empresaPresent }: Props) {
  if (!empresaPresent) {
    return (
      <div className="card">
        <h2 className="section-title mb-3">Para hoy</h2>
        <div className="text-center py-6 text-sm text-muted space-y-2">
          <p>Todavía no hay actividad. Empecemos:</p>
          <div className="flex flex-col gap-1 text-primary text-sm">
            <Link href="/onboarding" className="hover:underline">→ Completa tu perfil</Link>
            <Link href="/dashboard/documentos" className="hover:underline">→ Sube documentos clave</Link>
            <Link href="/dashboard/alerts" className="hover:underline">→ Configura una preferencia de alerta</Link>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="card bg-accent/5 border-accent/20">
        <h2 className="section-title mb-3">Para hoy</h2>
        <div className="flex items-start gap-3 py-2">
          <CheckCircle2 size={20} className="text-accent shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-text">Estás al día. Ningún plazo en las próximas 72h.</p>
            <p className="text-xs text-muted mt-1">Tu estado es hábil y no hay documentos próximos a vencer.</p>
            <Link href="/dashboard/postulaciones" className="text-xs text-primary hover:underline mt-2 inline-block">
              Revisar pipeline →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="section-title">Para hoy</h2>
        <Link href="/dashboard/alerts" className="text-xs text-muted hover:text-text">
          Ver todas ›
        </Link>
      </div>
      <div className="divide-y divide-border">
        {items.map((u) => (
          <Link
            key={u.id}
            href={u.cta_href}
            className="flex items-start gap-3 px-4 py-3 hover:bg-primary/3 transition-colors"
          >
            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[u.severidad] || 'bg-muted'}`} />
            <span className="w-10 shrink-0 text-xs font-mono text-muted pt-0.5">{u.tiempo_label}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text truncate">{u.titulo}</p>
              <p className="text-xs text-muted truncate mt-0.5">{u.subtitulo}</p>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary">
              {u.cta_label} <ArrowRight size={12} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/dashboard/UrgencyZone.tsx
git commit -m "feat(frontend): UrgencyZone with severity dots, empty/onboarding/all-clear states"
```

---

### Task 13: MatchesZone (zone C)

**Files:**
- Create: `frontend/components/dashboard/MatchesZone.tsx`

- [ ] **Step 1: Implement the component**

```typescript
'use client';

import Link from 'next/link';
import { Bookmark, ArrowRight, Lock } from 'lucide-react';
import type { MatchItem, PlanInfo } from '@/types/dashboardHome';

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-accent';
  if (score >= 60) return 'bg-info';
  return 'bg-muted';
}

function formatMonto(amount: number | null, currency: string): string {
  if (amount == null) return '—';
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B ${currency}`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M ${currency}`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K ${currency}`;
  return `$${amount.toFixed(0)} ${currency}`;
}

function daysUntil(iso: string | null): string {
  if (!iso) return '';
  const days = Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
  return `Cierre en ${days}d`;
}

interface Props {
  matches: MatchItem[];
  totalDisponibles: number;
  cachedAt: string | null;
  plan: PlanInfo;
}

export function MatchesZone({ matches, totalDisponibles, cachedAt, plan }: Props) {
  if (matches.length === 0) {
    return (
      <div className="card">
        <h2 className="section-title mb-2">Oportunidades para ti</h2>
        <div className="text-center py-6 space-y-2">
          <p className="text-sm text-muted">
            Aún no tenemos datos suficientes para darte matches. Tordo necesita 5–10 postulaciones
            o compras históricas para aprender tu perfil.
          </p>
          <Link href="/dashboard/empresa" className="text-xs text-primary hover:underline">
            Completar perfil manualmente →
          </Link>
        </div>
      </div>
    );
  }

  const isFree = plan.tier === 'free';
  const visibleCount = isFree ? 1 : matches.length;
  const lockedCount = isFree ? Math.max(2, matches.length - 1) : 0;

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <h2 className="section-title">Oportunidades para ti</h2>
        <Link href="/dashboard/tenders?source=matches" className="text-xs text-muted hover:text-text">
          Ver {totalDisponibles} más ›
        </Link>
      </div>
      {cachedAt && (
        <p className="text-[11px] text-subtle px-4 mb-3">
          Actualizado {new Date(cachedAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      )}
      <div className="space-y-2 px-4 pb-4">
        {matches.slice(0, visibleCount).map((m) => (
          <div key={m.codigo_externo} className="rounded-lg border border-border p-3 hover:border-primary/30 transition-colors">
            <div className="flex items-center gap-3 mb-1.5">
              <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                <div className={`h-full ${scoreColor(m.score)}`} style={{ width: `${m.score}%` }} />
              </div>
              <span className="text-sm font-bold text-text w-8 text-right">{m.score}</span>
            </div>
            <p className="text-sm font-medium text-text truncate">{m.nombre}</p>
            <p className="text-xs text-muted mt-0.5 truncate">
              {m.organismo} · {formatMonto(m.monto_estimado, m.moneda)}
            </p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted">{daysUntil(m.fecha_cierre)}</span>
              <div className="flex items-center gap-2">
                <button className="text-xs text-muted hover:text-text inline-flex items-center gap-1">
                  <Bookmark size={12} /> Guardar
                </button>
                <Link href={m.href} className="text-xs font-medium text-primary inline-flex items-center gap-1">
                  Ver <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          </div>
        ))}
        {lockedCount > 0 &&
          Array.from({ length: lockedCount }).map((_, i) => (
            <div key={`locked-${i}`} className="rounded-lg border border-border p-3 relative">
              <div className="filter blur-sm pointer-events-none">
                <div className="flex items-center gap-3 mb-1.5">
                  <div className="flex-1 h-1.5 bg-border rounded-full" />
                  <span className="text-sm font-bold text-text w-8 text-right">??</span>
                </div>
                <p className="text-sm font-medium text-text">Licitación bloqueada</p>
                <p className="text-xs text-muted mt-0.5">Organismo · Monto</p>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Link
                  href="/dashboard/billing"
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary/90"
                >
                  <Lock size={12} /> Desbloquea con PYME+
                </Link>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/dashboard/MatchesZone.tsx
git commit -m "feat(frontend): MatchesZone with score bars, free-plan blur + upgrade CTA"
```

---

### Task 14: PipelineZone + TrendWidget + QuickActions

**Files:**
- Create: `frontend/components/dashboard/PipelineZone.tsx`
- Create: `frontend/components/dashboard/TrendWidget.tsx`
- Create: `frontend/components/dashboard/QuickActions.tsx`

- [ ] **Step 1: PipelineZone**

```typescript
'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { PipelineCounts } from '@/types/dashboardHome';

const STAGES: Array<{ key: keyof Pick<PipelineCounts, 'en_seguimiento' | 'en_preparacion' | 'enviada' | 'adjudicada' | 'no_adjudicada'>; label: string; tone: string }> = [
  { key: 'en_seguimiento', label: 'Seguimiento', tone: 'bg-muted/40' },
  { key: 'en_preparacion', label: 'Preparación', tone: 'bg-muted/40' },
  { key: 'enviada', label: 'Enviada', tone: 'bg-info/40' },
  { key: 'adjudicada', label: 'Adjudicada', tone: 'bg-accent/40' },
  { key: 'no_adjudicada', label: 'No adjudicada', tone: 'bg-danger/40' },
];

export function PipelineZone({ pipeline }: { pipeline: PipelineCounts }) {
  const max = Math.max(1, ...STAGES.map((s) => pipeline[s.key]));
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title">Tu pipeline — últimos 90 días</h2>
        <Link href="/dashboard/postulaciones" className="text-xs text-muted hover:text-text">
          Ver todas ›
        </Link>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {STAGES.map((s, i) => {
          const count = pipeline[s.key];
          const widthPct = (count / max) * 100;
          return (
            <Link
              key={s.key}
              href={`/dashboard/postulaciones?estado=${s.key}`}
              className="flex flex-col items-center gap-1.5 hover:opacity-80"
            >
              <div className="text-xs text-muted">{s.label}</div>
              <div className="text-lg font-bold text-text">{count}</div>
              <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                <div className={`h-full ${s.tone}`} style={{ width: `${widthPct}%` }} />
              </div>
            </Link>
          );
        })}
      </div>
      {pipeline.tasa_adjudicacion_90d != null && pipeline.decididas_90d >= 3 && (
        <p className="text-xs text-muted mt-3">
          Tasa de adjudicación últimos 90 días:{' '}
          <span className="font-semibold text-text">
            {Math.round(pipeline.tasa_adjudicacion_90d * 100)}%
          </span>{' '}
          ({pipeline.adjudicada} de {pipeline.decididas_90d} decididas)
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TrendWidget**

```typescript
'use client';

import type { TrendStats } from '@/types/dashboardHome';

export function TrendWidget({ trend }: { trend: TrendStats }) {
  if (!trend.disponible) return null;
  const max = Math.max(1, ...trend.postulaciones_semana);
  const last = trend.postulaciones_semana[trend.postulaciones_semana.length - 1] ?? 0;
  return (
    <div className="card hidden sm:block">
      <h2 className="section-title mb-3">Tu mes</h2>
      <div className="flex items-end gap-1 h-12 mb-2">
        {trend.postulaciones_semana.map((n, i) => (
          <div
            key={i}
            className="flex-1 bg-primary/40 rounded-t-sm"
            style={{ height: `${(n / max) * 100}%`, minHeight: '4px' }}
            title={`${n} esta semana`}
          />
        ))}
      </div>
      <p className="text-xs text-muted">
        <span className="font-semibold text-text">{last}</span> postulaciones esta semana
        {trend.delta_enviadas_pp != null && trend.delta_enviadas_pp !== 0 && (
          <span className={trend.delta_enviadas_pp > 0 ? 'text-accent ml-1' : 'text-danger ml-1'}>
            ({trend.delta_enviadas_pp > 0 ? '+' : ''}{trend.delta_enviadas_pp} vs anterior)
          </span>
        )}
      </p>
      {trend.tasa_adjudicacion_actual != null && (
        <p className="text-xs text-muted mt-1">
          <span className="font-semibold text-text">{Math.round(trend.tasa_adjudicacion_actual * 100)}%</span> tasa de adjudicación
          {trend.tasa_adjudicacion_anterior != null && (
            <span className="text-muted ml-1">
              ({Math.round((trend.tasa_adjudicacion_actual - trend.tasa_adjudicacion_anterior) * 100) >= 0 ? '+' : ''}
              {Math.round((trend.tasa_adjudicacion_actual - trend.tasa_adjudicacion_anterior) * 100)}pp vs mes prev.)
            </span>
          )}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: QuickActions**

```typescript
'use client';

import Link from 'next/link';
import { Search, Upload, Calendar, Bell } from 'lucide-react';

const ACTIONS = [
  { href: '/dashboard/tenders', icon: Search, label: 'Buscar licitaciones' },
  { href: '/dashboard/documentos', icon: Upload, label: 'Subir documento' },
  { href: '/dashboard/calendario', icon: Calendar, label: 'Ver calendario' },
  { href: '/dashboard/alerts', icon: Bell, label: 'Configurar alertas' },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {ACTIONS.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="card p-4 flex flex-col items-center justify-center gap-1.5 hover:border-primary/30 transition-colors"
        >
          <a.icon size={18} className="text-primary" />
          <span className="text-xs font-medium text-text text-center">{a.label}</span>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify all components compile**

Run (from `frontend/`):
```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/dashboard/PipelineZone.tsx frontend/components/dashboard/TrendWidget.tsx frontend/components/dashboard/QuickActions.tsx
git commit -m "feat(frontend): PipelineZone funnel, TrendWidget, QuickActions launcher tiles"
```

---

### Task 15: Page rewrite

**Files:**
- Modify: `frontend/app/dashboard/page.tsx`

- [ ] **Step 1: Replace the whole file**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { getEmpresaActiva } from '@/lib/empresaActive';
import type { DashboardHomeResponse } from '@/types/dashboardHome';

import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { UrgencyZone } from '@/components/dashboard/UrgencyZone';
import { MatchesZone } from '@/components/dashboard/MatchesZone';
import { PipelineZone } from '@/components/dashboard/PipelineZone';
import { TrendWidget } from '@/components/dashboard/TrendWidget';
import { QuickActions } from '@/components/dashboard/QuickActions';

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardHomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadHome(empresaId?: string) {
    setError(null);
    apiClient.getDashboardHome(empresaId)
      .then(setData)
      .catch(() => setError('No pudimos cargar el dashboard. Reintenta en un momento.'));
  }

  useEffect(() => {
    const stored = getEmpresaActiva() ?? undefined;
    loadHome(stored);
  }, []);

  const firstName = (user?.full_name || user?.username || 'hola').split(' ')[0];

  if (!data && !error) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-24 rounded-xl bg-surface border border-border" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="h-72 rounded-xl bg-surface border border-border" />
          <div className="h-72 rounded-xl bg-surface border border-border" />
        </div>
        <div className="h-32 rounded-xl bg-surface border border-border" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="alert-error">
        <span>{error}</span>
        <button onClick={() => loadHome()} className="ml-3 underline">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      <DashboardHeader data={data} firstName={firstName} onEmpresaSwitch={loadHome} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <UrgencyZone items={data.urgencias} empresaPresent={data.empresa !== null} />
        <MatchesZone
          matches={data.matches}
          totalDisponibles={data.matches_total_disponibles}
          cachedAt={data.matches_cached_at}
          plan={data.plan}
        />
      </div>

      <PipelineZone pipeline={data.pipeline} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <TrendWidget trend={data.trend} />
        </div>
        <div className={data.trend.disponible ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <QuickActions />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the dev server and smoke-test in the browser**

```bash
cd frontend && npm run dev
```

Open `http://localhost:3000/dashboard` and verify:
1. Banda superior shows `Buenos días, <name>.` plus 1-3 narrative phrases.
2. "Para hoy" lists urgencias or shows the all-clear state.
3. "Oportunidades para ti" shows up to 3 cards (or onboarding empty state).
4. Pipeline funnel renders with 5 stages.
5. TrendWidget appears only if trend.disponible.
6. QuickActions tiles work.
7. "Cambiar" empresa modal opens via Esc-dismissable.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/page.tsx
git commit -m "feat(frontend): rewrite dashboard home as 6-zone operational center

Replaces the previous KPI-grid + BI-widget collection with a thin
assembly of DashboardHeader, UrgencyZone, MatchesZone, PipelineZone,
TrendWidget, QuickActions. Single fetch to GET /api/dashboard/home,
empresa switching via localStorage, per-zone empty/loading states."
```

---

## Phase G — Cleanup

### Task 16: Delete obsolete components and `/analytics`

**Files:**
- Delete: `frontend/components/TopOpportunities.tsx`
- Delete: `frontend/components/MiniTrendChart.tsx`
- Delete: `frontend/components/MiniActivityBars.tsx`
- Delete: `frontend/components/DataFreshnessBar.tsx`
- Delete: `frontend/app/dashboard/analytics/` directory
- Modify: `frontend/components/Layout.tsx` — remove the `/dashboard/analytics` nav link

- [ ] **Step 1: Confirm no remaining imports**

Run (from project root):
```bash
grep -rn "TopOpportunities\|MiniTrendChart\|MiniActivityBars\|DataFreshnessBar" frontend/app frontend/components frontend/lib
```

Expected: no matches (we removed all uses in Task 15).

- [ ] **Step 2: Delete the files**

```bash
rm frontend/components/TopOpportunities.tsx
rm frontend/components/MiniTrendChart.tsx
rm frontend/components/MiniActivityBars.tsx
rm frontend/components/DataFreshnessBar.tsx
rm -rf frontend/app/dashboard/analytics
```

- [ ] **Step 3: Remove the analytics link from the sidebar**

Open `frontend/components/Layout.tsx`. Find any nav entry pointing to `/dashboard/analytics` and delete it. Example pattern:

Before (search for `analytics`):
```tsx
{ href: '/dashboard/analytics', label: 'Analítica', icon: BarChart3 },
```

After: remove that line entirely.

- [ ] **Step 4: Verify TS compiles + browser test**

```bash
cd frontend && npx tsc --noEmit
npm run dev
```

Open the dashboard and confirm:
1. Sidebar no longer has Analítica.
2. Visiting `/dashboard/analytics` returns Next.js 404.
3. Dashboard home renders normally.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/
git commit -m "chore(frontend): remove obsolete BI widgets and /dashboard/analytics route

Deleted: TopOpportunities, MiniTrendChart, MiniActivityBars,
DataFreshnessBar, app/dashboard/analytics/.

The new home absorbs the personal-pulse role via the conditional
TrendWidget. Market analytics continue to live in /dashboard/bi."
```

---

## Phase H — End-to-end verification

### Task 17: Final smoke + checklist

**Files:** none — manual verification.

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && pytest -v
```

Expected: all green.

- [ ] **Step 2: Run all frontend tests**

```bash
cd frontend && npm test -- run
```

Expected: 5 narrative tests pass.

- [ ] **Step 3: Run the Celery task once manually**

```bash
cd backend && python -c "from app.tasks.dashboard_tasks import precompute_dashboard_matches; print(precompute_dashboard_matches())"
```

Expected: `{'processed': N, 'skipped': 0, 'failed': 0}` where N is the number of empresas with TFIDFPerfil. If `feature_tfidf` is off in dev: `{'skipped': True}`.

- [ ] **Step 4: Verify cache rows**

```bash
psql "$DATABASE_URL" -c "SELECT empresa_id, matches_count, cached_at FROM dashboard_home_cache LIMIT 10;"
```

Expected: rows present (or empty if no empresas have TFIDFPerfil).

- [ ] **Step 5: Browser walkthrough**

Login → land on `/dashboard`. Verify each acceptance criterion from the spec:

- Banda superior shows `Actuando como ...` badge + narrative ≤ 3 lines
- Urgency zone displays correct severity colors and CTAs
- Matches zone respects free/paid blur
- Pipeline funnel clickable per stage
- Trend widget appears only when ≥30d history
- "Cambiar empresa" modal opens, switches, and reloads data
- Mobile (Chrome devtools, 375px wide): zones stack vertically, TrendWidget hidden
- All-clear state ("Estás al día") renders with green tone when no urgencies

- [ ] **Step 6: Open the PR**

```bash
git push -u origin feat/dashboard-home-redesign
gh pr create --title "feat: dashboard home redesign — operational center of command" --body "$(cat <<'EOF'
## Summary
- Rewrites `/dashboard` as a 3-zone operational home (urgencias / matches / pipeline) plus narrative summary, conditional trend widget, and quick actions.
- Adds `GET /api/dashboard/home` unified endpoint, `dashboard_home_cache` table, and daily `precompute_dashboard_matches` Celery task.
- Removes BI widgets and `/dashboard/analytics` route.

Spec: `docs/superpowers/specs/2026-04-19-dashboard-home-redesign-design.md`
Plan: `docs/superpowers/plans/2026-04-19-dashboard-home-redesign-implementation.md`

## Test plan
- [ ] `pytest` green in backend
- [ ] `npm test` green in frontend (narrative tests)
- [ ] Manual: dashboard renders with empresa, switches via modal, loads matches from cache
- [ ] Manual: free-plan account shows blur on locked match cards
- [ ] Manual: visiting `/dashboard/analytics` returns 404
- [ ] Manual: Celery task `precompute_dashboard_matches` runs without error

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Open follow-ups (deferred per spec)

These remain as future work — do NOT implement in this plan:

- LLM-generated daily briefing (post-launch bet)
- Adaptive "modo día" (post-launch bet)
- ⌘K command palette (v2)
- Saved/Applied collections sync from localStorage to backend (v2)
- Global multi-empresa refactor (`empresa_activa` injected into AuthContext)
- "Mi desempeño" deep-dive page
