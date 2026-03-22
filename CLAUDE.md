# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TORDO** (placeholder name, use `APP_NAME`/`BRAND_NAME` env vars for easy renaming) — B2B SaaS for Chilean SME suppliers participating in public tenders (licitaciones) on Mercado Público. Two core value propositions:

1. **Pre-bid intelligence (BI)** — historical price benchmarking, competitor analysis, and TF-IDF semantic matching to help decide whether to bid
2. **Operational compliance** — estado hábil monitoring, document management, and postulation checklists

Desktop-first with responsive design. PWA planned for v3.

See `SPEC.md` (TORDO v1.0) for the full technical specification and `deploy_steps/` for the phased implementation roadmap (Fases 0–6).

## Tech Stack

- **Backend**: FastAPI, SQLAlchemy 2.0 (migrating to asyncpg), Alembic, Celery + Redis, JWT auth
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Axios
- **ETL**: Python pipelines — hourly licitaciones from API, monthly OC histórico from ZIP bulk downloads, estado hábil CSV every 6h
- **Analytics**: DuckDB embebido for BI queries over historical órdenes de compra (78 columns, millions of rows)
- **Matching**: TF-IDF semantic matching service over historical OC titles (no LLM)
- **Infra**: Docker Compose (PostgreSQL 15, Redis 7, backend, celery worker/beat, ETL, frontend)

## Common Commands

### Development (Docker)
```bash
cd infra && docker-compose up -d        # Start all services
./start-dev.sh                           # Alternative: Docker services + local npm dev
```

### Backend
```bash
cd backend
./scripts/setup_local.sh                 # First-time local setup (venv, deps, .env, migrations)
uvicorn app.main:app --reload            # Dev server (port 8000)
alembic upgrade head                     # Run migrations
alembic revision --autogenerate -m "msg" # Create migration
pytest --cov=app tests/                  # Run tests
pytest tests/test_health.py              # Run single test file
celery -A app.celery_app worker --loglevel=info  # Celery worker
celery -A app.celery_app beat --loglevel=info    # Celery beat scheduler
```

### Frontend
```bash
cd frontend
npm install      # Install deps
npm run dev      # Dev server (port 3000)
npm run build    # Production build
npm run lint     # ESLint
```

### ETL
```bash
cd etl && python main.py                 # Run ETL pipeline
```

## Architecture

### Backend (`backend/app/`)
- `main.py` — FastAPI app entry point, mounts all routers
- `config.py` — Pydantic BaseSettings (env-driven config)
- `api/` — Route handlers: auth, users, tenders, alerts, health, data_inspection
- `models/` — SQLAlchemy models: User, Licitacion, OrdenCompra, Alert, AlertPreference, Category, detail/history tables
- `schemas/` — Pydantic request/response schemas
- `services/` — Business logic (AlertEngine, TFIDFMatcher planned)
- `tasks/` — Celery async tasks
- `core/` — security.py (JWT, password hashing), email.py
- `db/` — Database session management

### Frontend (`frontend/src/`)
- App Router pages: landing `/`, auth (`/login`, `/register`), dashboard with nested routes
- Target page structure per SPEC: `/onboarding`, `/dashboard`, `/licitaciones`, `/bi`, `/documentos`, `/alertas`, `/configuracion`
- `contexts/AuthContext` — JWT auth state management
- `components/` — Layout, reusable UI components
- Talks to backend via `NEXT_PUBLIC_API_URL`

### ETL (`etl/`)
- `main.py` — Orchestrator
- `extractors/` — Mercado Público licitaciones (hourly cron for active, daily for new) & OC histórico (monthly ZIP bulk)
- `transformers/` — Data transformation
- `loaders/` — Database loading (PostgreSQL + DuckDB)
- New planned: `EstadoHabilExtractor` (CSV every 6h), `OCHistoricoExtractor` (monthly ZIP with 78 columns)
- Requires `MERCADO_PUBLICO_TICKET` for API auth

### Database
- **PostgreSQL 15** (transactional): users, licitaciones, alertas (with idempotency_key), alert_preferences, empresas_usuario, estado_habil_log, documentos_empresa, checklist_postulacion, postulaciones, tfidf_perfiles, task_failures
- **DuckDB** (analytical): ordenes_compra historical data for BI queries
- Migrations in `backend/alembic/versions/`
- All cron jobs use `America/Santiago` timezone

## Implementation Roadmap

Development follows phased plan in `deploy_steps/`:
1. Read `SPEC.md` first
2. Review `deploy_steps/tareas_manuales.md` (tasks requiring human action)
3. Execute phases in order: `fase_0_c2.md` → `fase_1_c3.md` → ... → `fase_6_c2.md`

## Environment

Copy `.env.example` to `.env`. Key variables: `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`, `MERCADO_PUBLICO_TICKET`, `NEXT_PUBLIC_API_URL`, `APP_NAME`.
