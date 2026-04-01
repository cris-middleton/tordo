# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TORDO** (placeholder name, use `APP_NAME`/`BRAND_NAME` env vars for easy renaming) — B2B SaaS for Chilean SME suppliers participating in public tenders (licitaciones) on Mercado Público. Two core value propositions:

1. **Pre-bid intelligence (BI)** — historical price benchmarking, competitor analysis, TF-IDF semantic matching, opportunity scoring, and buyer profiling to help decide whether to bid and at what price
2. **Operational compliance** — estado hábil monitoring, document management with expiry tracking, postulation checklists, and deadline reminders

Desktop-first with responsive design. PWA planned for v3.

See `docs/SPEC.md` (TORDO v1.1) for the full technical specification, `docs/tordo_plan_saas.md` for the SaaS business plan, and `docs/deploy_steps/` for the phased implementation roadmap (Fases 0–6).

## Tech Stack

- **Backend**: FastAPI, SQLAlchemy 2.0 + asyncpg (async), Alembic (psycopg2 sync), Celery + Redis, JWT auth (python-jose + bcrypt + authlib for Google OAuth)
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Axios, Recharts, Lucide Icons
- **ETL**: Python pipelines — hourly licitaciones from API, daily backfill, weekly bulk OC+LIC ZIP downloads, estado hábil CSV every 6h
- **Analytics**: Polars batch over Parquet files — 15 pre-computed analytics modules over historical OC + LIC data (78 columns OC, ~30 columns LIC)
- **Matching**: TF-IDF semantic matching service (scikit-learn) over historical OC titles — no LLM
- **Billing**: Stripe Checkout + Billing Portal, webhook-based subscription lifecycle
- **Notifications**: In-app, email (SMTP), webhook, WhatsApp (Twilio)
- **Storage**: Abstracted — local filesystem (dev) or S3/MinIO (prod), presigned URLs
- **Infra**: Docker Compose (PostgreSQL 15, Redis 7, MinIO, backend, celery worker/beat, Flower, frontend)

## Common Commands

### Development (Docker)
```bash
cd infra && docker-compose up -d        # Start all services (10 containers)
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
cd etl && python main.py                           # Run full ETL pipeline
python main.py --only-extraer-nuevos               # Extract new details only
python main.py --only-actualizar                   # Update existing details only
python -m etl.analytics.run_all                    # Rebuild all 15 analytics modules
python -m etl.analytics.run_all --modulo seasonality  # Run single analytics module
python scripts/descargar_datos_masivos.py --tipo ambos --desde 2025-01 --hasta 2026-03  # Bulk ZIP download
```

## Architecture

### Backend (`backend/app/`)
- `main.py` — FastAPI app entry, mounts 13 routers, CORS + BI rate-limit middleware
- `config.py` — Pydantic BaseSettings (env-driven), 8 feature flags, 60+ settings
- `api/` — Route handlers:
  - `auth.py` — Register, login, Google OAuth, change password
  - `users.py` — CRUD (admin-only list/delete)
  - `tenders.py` — List/detail with filters (estado, region, amount, search)
  - `alerts.py` — Preferences CRUD, alert list/read/delete, test alerts (email + WhatsApp)
  - `empresas.py` — Company CRUD with role-based access (owner/admin/viewer)
  - `documentos.py` — Upload (25MB max), download (presigned URL), soft delete, quota enforcement
  - `postulaciones.py` — Create with auto-checklist, status workflow, checklist toggle
  - `estado_habil.py` — Estado hábil + 30-day history per empresa
  - `bi.py` — 16 BI endpoints (precio, competidores, oportunidades, ventana, comprador, panel, estacionalidad, tendencia, descuento, forecast, diversificacion, sector, matching, perfil, clusters)
  - `dashboard.py` — KPI aggregation (active tenders, unread alerts, active postulaciones, expiring docs)
  - `billing.py` — Stripe checkout/portal, plan list
  - `webhooks.py` — Stripe webhook (signature-verified)
  - `health.py` — Health + readiness
  - `data_inspection.py` — Public ETL data inspection
- `models/` — SQLAlchemy: User, Licitacion, LicitacionDetalle, LicitacionHistorial, OrdenCompra (+ detalle/historial), Alert, AlertPreference, Empresa, EmpresaUsuario, DocumentoEmpresa, EstadoHabilLog, Postulacion, PlantillaChecklist, ChecklistPostulacion, TFIDFPerfil, BuyerOrganization, Supplier, Category
- `schemas/` — Pydantic request/response for all entities + BI responses
- `services/` — Business logic:
  - `alert_engine.py` — Preference matching, idempotent alert creation, TF-IDF new-licitacion matching
  - `bi_service.py` — 12 BI functions over cached Polars DataFrames (24h TTL)
  - `estado_habil_service.py` — CSV download, RUT lookup, change detection + alerts
  - `tfidf_matcher.py` — Model training, empresa vector building, licitacion-empresa scoring, clustering
  - `stripe_service.py` — Checkout, portal, webhook event construction
  - `oauth_service.py` — Google OAuth flow (auth URL, code exchange, user creation)
  - `storage_service.py` — Abstract storage (LocalStorage / S3Storage), presigned URLs
  - `twilio_service.py` — WhatsApp alert sending via Twilio
- `tasks/` — Celery:
  - `etl_tasks.py` — Hourly licitaciones, daily backfill, weekly bulk rebuild + analytics, 30-min watchdog
  - `estado_habil_tasks.py` — 6h estado check, daily 9AM deadline reminders (48h/24h), daily 9:30AM doc expiry
  - `alert_tasks.py` — Process new licitacion/OC alerts
- `core/` — security.py (JWT, bcrypt, OAuth2 deps), plan_limits.py (tier quotas, Redis-backed BI rate limits), email.py
- `db/` — Async (asyncpg) + sync (psycopg2) session management

### Frontend (`frontend/`)
- **Pages** (App Router):
  - `/` — Marketing landing (hero, benefits, pricing, FAQ, footer)
  - `/login`, `/register` — Auth with Google OAuth button
  - `/auth/callback` — Google OAuth callback handler
  - `/onboarding` — Multi-step: RUT → company name → rubros → plan selection
  - `/dashboard` — KPI cards + saved/applied collections (localStorage) + charts (Recharts)
  - `/dashboard/tenders` — Search + advanced filters + pagination + save/apply + detail view
  - `/dashboard/tenders/[codigo]` — Full tender detail
  - `/dashboard/orders` — Purchase order browsing with filters
  - `/dashboard/orders/[codigo]` — Order detail
  - `/dashboard/alerts` — Alert list + preferences management + test alerts
  - `/dashboard/documentos` — Multi-empresa doc upload/download/delete, estado hábil badge, expiry status
  - `/dashboard/postulaciones` — Grouped by empresa, status workflow, checklist with progress bar
  - `/dashboard/bi` — Semantic matching, competitors, buyer profiles, timing analysis, TF-IDF perfil
  - `/dashboard/analytics` — Charts with mock data (pending real API integration)
  - `/dashboard/billing` — Plan cards, Stripe checkout, billing portal
  - `/dashboard/settings` — Profile, notification prefs (email/in-app/webhook/WhatsApp), password change
- `components/Layout.tsx` — Responsive sidebar with collapsible nav, plan badge, mobile hamburger
- `components/PlanUpgradeBanner.tsx` — Floating upgrade notification
- `contexts/AuthContext.tsx` — JWT state, login/register/logout, token management, Google OAuth
- `lib/api.ts` — Axios client with auth interceptor, 401 auto-logout, all API methods by feature
- `hooks/useDashboardCollections.ts` — localStorage-based saved/applied items with SSR hydration

### ETL (`etl/`)
- `main.py` — Orchestrator with CLI args (date range, skip flags, standalone modes)
- `extractors/` — MercadoPublicoLicitacionesExtractor, MercadoPublicoOrdenesExtractor (rate-limited, retry with backoff)
- `transformers/` — LicitacionTransformer, OrdenCompraTransformer (field mapping, type normalization)
- `loaders/` — DatabaseLoaderV2 (asyncpg batch insert, change detection, stale record refresh)
- `analytics/` — 15 modules:
  - **OC-based (11)**: seasonality, price_benchmarking, competitor_analysis, trend_analysis, tfidf_matcher, word_clustering, product_price_bands, buyer_scoring, sector_intelligence, discount_optimizer, provider_diversification, opportunity_scorer (runs last, aggregates all others)
  - **LIC-based (3)**: buyer_transparency, preparation_window, competitor_predictor
- `scripts/` — descargar_datos_masivos.py (bulk ZIP download), validar_entorno.py, debug tools

### Database
- **PostgreSQL 15** (transactional): 15+ tables — users, licitaciones (+detalle +historial), ordenes_compra (+detalle +historial), alertas (idempotency_key), alert_preferences, empresas, empresas_usuario, documentos_empresa, estado_habil_log, postulaciones, checklist_postulacion, plantillas_checklist, tfidf_perfiles, buyer_organizations, suppliers, categories, task_failures
- **Parquet + Polars** (analytical): pre-computed outputs in `etl/data/analytics/`, cached in BIService (24h TTL)
- Migrations in `backend/alembic/versions/` (001–008)
- All cron jobs use `America/Santiago` timezone

### Key Patterns
- **Auth**: JWT (HS256, 30min) + Google OAuth + role-based (superuser, empresa owner/admin/viewer) + plan-based quotas
- **Multi-tenancy**: Users ↔ Empresas (M2M via EmpresaUsuario with rol)
- **Alerts**: User preferences → AlertEngine matches new entities → idempotent INSERT ON CONFLICT → multi-channel dispatch
- **BI**: Pre-computed Parquet → Polars DataFrame cache (24h) → hierarchical fallback (L1→L2→L3) → plan-gated endpoints
- **Rate limiting**: Redis-backed (60 req/min per IP on /api/bi/*, daily quota per plan tier)
- **Feature flags**: 8 flags in config (analytics, billing, estado_habil, documentos, checklist, tfidf, whatsapp, analytics_enabled)
- **Storage**: Abstract interface (local/S3), presigned URLs, quota enforcement per plan

## Implementation Status

Development followed phased plan in `docs/deploy_steps/`. **Fases 0–6 are ~90% implemented.** Remaining work:

### Pending — Code
- **Tests**: No comprehensive test suite yet — need unit tests for services, integration tests for API, E2E for critical flows
- **Unified NotificationService**: Individual channels (email, webhook, WhatsApp) work but no orchestrator that dispatches across channels with fallback logic
- **Calendar view**: No visual calendar for deadline tracking — currently list-based only
- **PlantillaChecklist seed data**: Template records for L1/LE/LP checklist items may not be seeded
- **React Query**: Frontend uses useState/useEffect instead of @tanstack/react-query as planned
- **Drag-drop upload**: Uses basic file input, not react-dropzone as planned
- **Multi-user UX**: Backend supports empresa roles (owner/admin/viewer) but frontend has no invite/manage members UI
- **Automated market reports**: No scheduled PDF/email report generation for weekly summaries
- **Analytics page**: Shows mock data, not yet wired to real BI API endpoints

### Pending — External Services (see `docs/deploy_steps/tareas_manuales.md`)
- **Stripe**: Need live keys + 4 product/price IDs configured
- **Google OAuth**: Need CLIENT_ID + CLIENT_SECRET from Google Cloud Console
- **Twilio WhatsApp**: WABA approval (4–8 week process)
- **Production storage**: S3 or Cloudflare R2 bucket (MinIO works for dev)
- **Domain + SSL**: Required before production
- **Sentry**: Error monitoring not configured
- **CI/CD**: No pipeline — need GitHub Actions or equivalent

### Not Started (v2/v3 per roadmap)
- **Transbank (webpay Chile)**: Plan mentions it but only Stripe is implemented
- **PWA**: Planned for v3
- **Alertas predictivas**: Score-based proactive opportunity alerts
- **Plantillas por rubro**: Richer checklist templates per industry vertical
- **Multi-idioma**: Currently Spanish-only (by design for Chilean market)

## Environment

Copy `.env.example` to `.env`. Key variables: `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`, `MERCADO_PUBLICO_TICKET`, `NEXT_PUBLIC_API_URL`, `APP_NAME`.

Feature flags control optional modules:
- `FEATURE_ANALYTICS` / `FEATURE_TFIDF` — BI endpoints (off by default until analytics data is loaded)
- `FEATURE_BILLING` — Stripe integration
- `FEATURE_ESTADO_HABIL` / `FEATURE_DOCUMENTOS` / `FEATURE_CHECKLIST` — Compliance features (on by default)
- `FEATURE_WHATSAPP` — Twilio WhatsApp notifications
