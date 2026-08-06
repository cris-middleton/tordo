# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Este documento describe el estado REAL del código, no el objetivo.** Lo que está
> planificado pero no construido vive en "Hacia dónde va" y en
> `docs/ARQUITECTURA_REVISION_2026-08.md`. Si encuentras una diferencia entre este
> archivo y el código, **el código gana** — y corrige este archivo en el mismo PR.

---

## Qué es

**TORDO** — SaaS B2B para PYMES chilenas que licitan en Mercado Público. Dos propuestas de valor:

1. **Inteligencia pre-postulación** — bandas de precio históricas, análisis de competidores,
   matching semántico TF-IDF, scoring de oportunidad y perfilado de compradores. Responde
   *"¿me conviene postular, y a qué precio?"*
2. **Compliance operativo** — monitoreo de estado hábil, vencimiento de documentos, checklist
   de postulación, recordatorios de plazo. Responde *"¿me van a rechazar por forma?"*

Desktop-first, responsive, sólo español, sólo Chile.

**El nombre se lee de `APP_NAME` / `BRAND_NAME`. Nunca hardcodear "TORDO" en el código.**

---

## Reglas de trabajo (no negociables)

### Ceremonia proporcional al tamaño
Cambios chicos: sin brainstorming ni plan; evalúa y procede sólo con ≥95 % de confianza.
Proyectos medianos o grandes: `grill-me` primero, sin cabos sueltos.

### Ramas y worktrees

**Toda feature se desarrolla en un worktree. Nunca se ramifica en el checkout
principal.** No es una preferencia de estilo: mantiene `main` siempre limpio y
levantable, permite tener dos features a medias sin pisarse, y evita el `git stash`
a medio camino cuando hay que revisar otra cosa.

```bash
make worktree NOMBRE=mi-feature   # crea la rama, copia el .env y sincroniza deps
cd ../tordo-worktrees/mi-feature
# ... trabajar, commitear, PR ...
make worktree-clean NOMBRE=mi-feature   # tras mergear
make worktree-list
```

`make worktree` hace el setup completo a propósito: una regla que exige cuatro pasos
manuales se salta, un comando no.

- **Flujo:** worktree → `make ci` en verde → PR a `main` → merge → despliegue.
- Los worktrees **no heredan archivos gitignoreados**: cada uno necesita su propio
  `.env` y su propio `node_modules` (el target copia el primero e instala el segundo).
  Los hooks de pre-commit, en cambio, se comparten con el checkout principal.

#### `make ci` es la puerta, porque GitHub Actions no está habilitado

La cuenta no tiene Actions habilitado (requiere tarjeta), así que **`.github/workflows/ci.yml`
no corre**. No es que CI esté en verde: es que no corre. `make ci` levanta un Postgres
efímero y ejecuta exactamente lo mismo — lint, ciclo de migraciones, ambas suites, lint,
tests y build del frontend — y se destruye al terminar.

Correrlo antes de cada PR **no es opcional**: sin él, "pasar CI" es una lista de comandos
en la cabeza de alguien, y lo que se olvida siempre es lo mismo — el ciclo de migraciones
y el build del frontend.
- Los contenedores y volúmenes de Docker son compartidos: no levantes el stack desde dos
  worktrees a la vez.
- **`etl/data/` tampoco se hereda** (está gitignoreado). Si necesitas los parquets de
  analytics en un worktree, materializa apuntando al checkout principal en vez de
  redescargarlos:
  ```bash
  uv run --project .. python -m analytics.materialize \
      --data-dir ~/personal/tordo/etl/data/analytics
  ```

> **No hay rama `staging` ni entorno de staging, y es deliberado.** Este es un proyecto
> personal de un solo desarrollador desplegando en Railway; el flujo de dos ramas de los
> repos de otra empresa existe porque allá cada rama auto-despliega a un entorno GCP distinto.
> Aquí sería ceremonia sin beneficio — y "ceremonia proporcional al tamaño" es justamente
> la regla. **Cuando haya el primer usuario pagando**, crear entorno + rama de staging y
> volver al flujo de dos etapas.

### Python
- `uv` y `python3`. **No hay `requirements.txt`**: un solo `pyproject.toml` en la raíz con
  grupos `shared` / `api` / `etl` / `dev`, y un solo `uv.lock`.
- Comandos desde `backend/` o `etl/`: `uv run --project .. <cmd>`.
- **Los hooks de pre-commit son por clone.** Los *worktrees* de git comparten el directorio
  de hooks con el checkout principal (`git rev-parse --git-path hooks` resuelve al `.git`
  común), así que basta instalarlos una vez por clone. En un clone nuevo: `make hooks`.
  **Nunca `--no-verify`** — arregla la causa.
- Tras tocar `pyproject.toml`: `make lock` y commitea el `uv.lock`. CI falla si divergen.

### Migraciones
- **Siempre `make migrate-create MSG="descripción"`. Nunca `alembic revision` directo.**
  Es la única forma de obtener IDs y cadenas de `down_revision` correctas. Este repo ya
  se rompió una vez por esto (ver `011_fix_alerttype_enum_uppercase`).
- CI valida que haya exactamente una cabeza y que `upgrade head` + `downgrade base` corran
  limpios contra una base vacía. Una migración que no revierte no pasa.

### Multi-tenancy — CRÍTICO PARA LA SEGURIDAD
Todo endpoint que toque datos de una empresa **debe** resolver el contexto de empresa por
dependencia, no a mano:

```python
from app.api.deps import EmpresaContext, empresa_ctx, require_rol

async def leer(ctx: EmpresaContext = Depends(empresa_ctx)): ...
async def escribir(ctx: EmpresaContext = Depends(require_rol("owner", "admin"))): ...
```

Cuando el `empresa_id` no viene por path (cuerpo del request, o de una entidad ya cargada)
se usa `verificar_acceso_empresa(...)`, que es **la misma implementación**. Nunca escribas
una consulta propia de membresía en un router.

`backend/tests/test_tenancy_estructural.py` falla en CI si una ruta con `{empresa_id}` no
declara la dependencia. Ver `.claude/skills/endpoint-empresa/`.

### Convenciones de código
- **Imports a nivel de módulo.** Nada de imports dentro de funciones. El código heredado
  los usa para diferir dependencias pesadas — es un síntoma del problema de servicio de
  analytics (F2), no un patrón a copiar. **No añadas imports diferidos nuevos.**
  Ya causó un bug real: `subscription_status_from_stripe` importado dentro de una función y
  usado en otra rompía todos los webhooks `customer.subscription.updated`.
- **Todos los schemas Pydantic en `app/schemas/`.** Nunca inline en endpoints o servicios.
- **Toda tabla y columna nueva lleva `comment=`.** Es un producto de datos con 78 columnas
  por orden de compra; sin comentarios se vuelve inusable en meses.
- Los errores de negocio se devuelven con `HTTPException` y mensaje en español — los ve el usuario.

### Secretos
Nunca al repo. Un hook de pre-commit bloquea cualquier `.env`. Si una credencial llega a un
commit, **rótala**: quitarla después no la invalida.

### Skills del plugin `toolkit-de-usuario`

El plugin está instalado a nivel de usuario, así que sus skills aparecen también aquí.
**TORDO es un proyecto personal y no comparte nada con otra empresa**: ni infraestructura, ni tenant,
ni Notion, ni Sentry, ni GCP.

**Se pueden usar** (son genéricos, no tocan sistemas externos):

| Skill | Para qué |
|---|---|
| `grill-me` | Estresar un plan antes de construirlo. Obligatorio en proyectos medianos o grandes. |
| `handoff` | Comprimir la sesión para que otra continúe. Útil: estas sesiones se alargan. |
| `feature` | Pipeline completo staff-engineer → dev → review por chunk → review de integración. Encaja bien con las fases F2–F5. |
| `demo-video` | Grabar una demo con Playwright y editarla con Remotion. Relevante para competir de igual a igual con LicitaLab. |
| agentes `staff-engineer`, `dev`, `chunk-reviewer`, `integration-reviewer`, `git-commit-generator` | Genéricos. |

**NO usar aquí — apuntan a sistemas de otra empresa y modificarían infraestructura ajena:**

`auth0` (tenant de otra empresa) · `customerio` · `grafana` (dashboard de otra empresa) ·
`sentry-alerts` (organización `org-ajena`) · `pubsub`, `scheduler`, `tasks` (GCP de otra empresa,
manifest-first sobre el repo `infra`) · `drd`, `crear-proyecto` (Notion de otra empresa) ·
`setup` (instala el toolkit de otra empresa).

TORDO usa su propio Sentry (`SENTRY_DSN`), su propio Celery beat en vez de Cloud Scheduler,
y no tiene Pub/Sub ni Cloud Tasks.

### Frontend
- Nunca hardcodear la URL del backend en un componente: usa `lib/api.ts`.
- El estado de servidor se maneja con `useState`/`useEffect` (deuda conocida; el objetivo es
  TanStack Query — ver F5).

---

## Comandos

`make help` los lista todos.

```bash
make setup                       # deps + hooks (clone o worktree nuevo)
make hooks                       # sólo hooks
make lint / make lint-fix        # ruff check + format (idéntico a CI)
make test                        # backend + ETL
make dev-up-d / dev-logs / dev-down
make migrate / make migrate-create MSG="..." / make migrate-status
make db-shell
make front-dev
```

ETL (desde `etl/`):
```bash
uv run --project .. python main.py
uv run --project .. python -m etl.analytics.run_all [--modulo seasonality]
uv run --project .. python -m analytics.evaluation --model tfidf_matcher --walk-forward
```

**Cualquier cambio a un modelo de scoring pasa por el harness de evaluación**
(`etl/analytics/evaluation/`: splits, walk-forward, métricas, variantes). No se toca un
scorer sin correrlo.

---

## Arquitectura (estado real)

### Backend — `backend/app/`

Monolito modular, **en migración a capas** (F3). Ya existen `repositories/`, `domain/` e
`infra/`, pero muchos routers todavía llevan consultas SQLAlchemy inline: eso se va
moviendo agregado por agregado.

```
api/            15 routers. HTTP y autorización por dependencia (deps.py).
domain/         Reglas puras, sin IO. Hoy: el puerto de cobro.
infra/          Adaptadores externos. Hoy: billing/ (MercadoPago + Stripe).
repositories/   Acceso a datos. Hoy: analytics (sync y async).
services/       Lógica de negocio como funciones de módulo.
                services/bi/ está partido por dominio (precio, competencia,
                comprador, oportunidad, temporal, mercado, panel), con _base.py
                como único punto de acceso a las tablas de analytics.
core/           security.py (JWT), plan_limits.py (cuotas), email.py
observability/  logging JSON con request_id (contextvar) + Sentry opt-in
db/             sesión async (asyncpg) y sync (psycopg2)
models/         SQLAlchemy
schemas/        Pydantic — todos van aquí
tasks/          Celery
```

**Routers**: auth, users, tenders, alerts, empresas, documentos, postulaciones, estado_habil,
bi (22 endpoints), dashboard, billing, webhooks, health, data_inspection.
`data_inspection` requiere auth a nivel de router — **no añadas rutas ahí que la salten**.

**Celery**: 11 jobs. ETL horario, backfill diario, bulk semanal + analytics, estado hábil
cada 6 h, recordatorios de plazo y de vencimiento, precómputo nocturno de matches, watchdog
cada 30 min, trials, radar semanal. Todo en `America/Santiago`.

### Datos

- **PostgreSQL** — transaccional.
- **Parquet + Polars** — sólo cómputo batch. La API **no lee parquets**: el pipeline
  materializa los resultados en el esquema `analytics` de Postgres con índices
  (`etl/analytics/materialize.py`), y `bi_service` los consulta con SQL. Ver
  `docs/decisiones/0006-analytics-en-postgres.md`.
- Migraciones en `backend/alembic/versions/`.

### Frontend — `frontend/`

Next.js 14 App Router + TypeScript + Tailwind + Recharts. Componentes propios (sin design
system). Fetching con `useState`/`useEffect`, token JWT en `localStorage`, llamadas directas
al backend vía `NEXT_PUBLIC_API_URL`.

### ETL — `etl/`

`main.py` orquesta → `extractors/` → `transformers/` → `loaders/DatabaseLoaderV2`.
`analytics/` tiene 15 módulos Polars; `opportunity_scorer` corre último y agrega el resto.
`analytics/evaluation/` es el harness de evaluación.

### Patrones vigentes
- **Auth**: JWT HS256 30 min (sin refresh token) + Google OAuth + roles empresa
  (owner/admin/viewer) + cuotas por plan.
- **Alertas**: preferencias → AlertEngine → `INSERT ON CONFLICT` idempotente → multicanal.
- **BI**: batch en Polars → tablas materializadas en `analytics.*` → consulta con filtros
  empujados a SQL → fallback jerárquico L1→L2→L3 con confianza y tamaño de muestra →
  gating por plan (de la empresa). Hay un golden master (`backend/tests/golden/`) que fija
  el contrato: **cualquier cambio a `services/bi/` tiene que pasarlo.**
- **Rate limiting**: Redis, por IP en `/api/bi/*`, más cuota diaria por tier.
- **Feature flags**: 8 en config; apagadas devuelven 503 con mensaje accionable.

---

## Deuda conocida — no la refuerces

`docs/ARQUITECTURA_REVISION_2026-08.md` es la referencia. Si necesitas apoyarte en alguno de
estos patrones, es señal de que hay que arreglar la causa, no de copiarlo:

- ~~Analytics servido desde caché de parquet en el proceso de la API~~ — **resuelto en F2**: se sirve desde `analytics.*` en Postgres con índices.
- ~~Verificación de membresía repetida a mano en cada endpoint~~ — **resuelto en F3**: `app/api/deps.py`, con test estructural.
- `Column(JSON)` donde corresponde `JSONB` (F4).
- Búsqueda con `ILIKE '%término%'`, que ningún índice puede servir (F4).
- ~~Suscripción y `plan_tier` colgando de `User`~~ — **resuelto en F3**: pertenecen a la empresa.
- `subprocess.run` desde Celery hacia el ETL (F2).
- **`conftest.py` mantiene a mano el DDL de 11 tablas en SQLite, y hay un tercer DDL en
  `test_dashboard_tasks.py`.** Es la deuda que más veces ha mordido: columna `alert_metadata`
  que en el modelo es `metadata`, archivos `.db` viejos que sombrean el esquema, timestamps
  sin zona horaria, y cada columna nueva hay que añadirla a mano en dos sitios. **El arreglo
  es usar el Postgres que CI ya provisiona** en vez de un esquema paralelo.
- 56 hallazgos de ruff silenciados en `pyproject.toml` con su conteo y motivo (F3).

## Hacia dónde va

Decisiones tomadas el 2026-08-05, con su ADR en `docs/decisiones/`:
sólo Chile (sin multi-país), suscripción por empresa con planes por capacidades, nombre TORDO,
LLM acotado a un servidor MCP sobre la base histórica, y pasarela de pago local en v1.

Fases pendientes: **F2** plano de datos analítico → **F3** tenancy, capas y billing por
empresa → **F4** modelo de datos → **F5** frontend → **F6** diferenciación.

---

## Entorno

`cp .env.example .env`. Críticas: `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`,
`MERCADO_PUBLICO_TICKET`, `NEXT_PUBLIC_API_URL`, `APP_NAME`.

Observabilidad: `SENTRY_DSN` (vacío = desactivado), `LOG_JSON` (false en local),
`LOG_LEVEL`, `ENVIRONMENT`.

Feature flags: `FEATURE_ANALYTICS`, `FEATURE_TFIDF`, `FEATURE_BILLING`,
`FEATURE_ESTADO_HABIL`, `FEATURE_DOCUMENTOS`, `FEATURE_CHECKLIST`, `FEATURE_WHATSAPP`.
