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

- **Flujo:** worktree → `make ci` en verde → PR a `main` → **Actions en verde** → merge →
  despliegue.
- Los worktrees **no heredan archivos gitignoreados**: cada uno necesita su propio
  `.env` y su propio `node_modules` (el target copia el primero e instala el segundo).
  Los hooks de pre-commit, en cambio, se comparten con el checkout principal.

#### GitHub Actions sí corre. `make ci` es el ensayo previo

Este archivo decía que Actions no estaba habilitado y que `.github/workflows/ci.yml` no
corría. **Ya no es cierto**: `actions/permissions` devuelve `enabled=true` y el workflow
ejecuta sus seis jobs —lint, migraciones, tests de backend, tests de ETL, frontend y build
de imágenes— en cada `pull_request` contra `main`. Verificado sobre once PRs seguidos.

Dos cosas que sí conviene saber:

- **Un PR abierto durante una caída de Actions se queda sin checks para siempre.** GitHub no
  dispara retroactivamente: hay que cerrar y reabrir el PR para gatillar el evento. Pasó con
  una pila entera durante un `major_outage`.
- **`make ci` sigue valiendo la pena antes de pushear.** Levanta un Postgres efímero y corre
  lo mismo en local, así que el ciclo de vuelta es de minutos en vez de esperar al runner. Lo
  que más se olvida es siempre lo mismo: el ciclo de migraciones y el build del frontend.
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
  Los targets `migrate*` corren alembic **en el host**, no dentro del contenedor: dentro
  fallaban desde cualquier worktree, así que esta regla y la de trabajar en worktrees se
  contradecían. Sólo hace falta `DATABASE_URL`; no hace falta levantar el stack.
- CI valida que haya exactamente una cabeza y que `upgrade head` + `downgrade base` corran
  limpios contra una base vacía. Una migración que no revierte no pasa.
- **`alembic check` es bloqueante.** Los modelos y las migraciones ya no divergen: si cambias
  un modelo, la migración va en el mismo PR.
- **La unicidad se declara UNA vez, como restricción.** `unique=True` en la columna basta —
  la convención de `app/db/__init__.py` la nombra `uq_<tabla>_<columna>`. **Nunca
  `unique=True, index=True`**: eso genera un índice único en vez de una restricción, y una
  restricción UNIQUE ya trae su propio índice. `index=True` es sólo para búsquedas no únicas.
- **La convención de nombres afecta a las migraciones ya escritas**, porque Alembic se la pasa
  a `op.create_table`. Una base nueva y una antigua pueden salir con nombres distintos para la
  misma restricción. Si tocas restricciones únicas, prueba la migración en las dos rutas (§5.0).
- **Revisa siempre el esqueleto que genera autogenerate antes de commitearlo.** `env.py` ya
  estuvo sin importar los modelos, y con `target_metadata` vacío autogenerate propone borrar
  la base entera con toda naturalidad. Corregido y con test (`tests/test_alembic_metadata.py`),
  pero la lección se mantiene: autogenerate propone, no decide.

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
- **Clave primaria: `UUID` para entidades de negocio, `BigInteger` para las de ingesta.**
  Las de ingesta crecen sin techo y `integer` se queda corto; las de negocio se exponen en
  URLs y no conviene que sean adivinables.
- **Las dos reglas anteriores las verifica `tests/test_convenciones_modelo.py`**, con
  trinquete: hoy hay deuda (24 tablas y 302 columnas sin comentario, 16 PK `integer`), así que
  el test **no exige arreglarla** — falla si aparece deuda **nueva**. La deuda vive en
  `tests/convenciones_baseline.json` y sólo puede encoger.
  Al arreglar algo: `cd backend && uv run --project .. python tests/regenerar_baseline.py`.
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
- **Nunca hardcodear un color.** La paleta vive en tokens (`app/globals.css`) y se consume por
  Tailwind. Los componentes tenían 112 hexes; hoy tienen cero.
- **Nunca `text-white` sobre un fondo de token.** Los rellenos se invierten con el tema: en
  claro `bg-accent` es teal oscuro con etiqueta blanca, en oscuro es teal claro con etiqueta
  navy. Usa `text-onAccent`, `text-onPrimary`, `text-onGold`… `__tests__/on-color.test.ts`
  falla si alguien lo olvida, y hace falta: **el error es invisible en tema claro**, que es el
  que se revisa por defecto, porque ahí `on-accent` justamente ES blanco.
- **Si tocas un token de color, revalida el contraste.** Los 166 pares del sistema están
  verificados contra WCAG AA — cada tinta contra cada superficie, en ambos temas. El bug de
  `.alert-info` (texto invisible en tema claro) nació de cambiar un token a ojo.
- Las superficies que deben verse oscuras siempre —el hero, la tarjeta Pro, los paneles de
  autenticación— se marcan con la clase `dark` sobre `bg-brand-navy`, y los tokens se
  invierten solos dentro. No repintes a mano.
- El estado de servidor se maneja con `useState`/`useEffect` (deuda conocida; el objetivo es
  TanStack Query — ver F5).

---

## Comandos

`make help` los lista todos.

```bash
make setup                       # deps + hooks (clone o worktree nuevo)
make hooks                       # sólo hooks
make lint / make lint-fix        # ruff check + format (idéntico a CI)
make test                        # backend + ETL + frontend
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

Next.js 14 App Router + TypeScript + Tailwind + Recharts. Componentes propios. Fetching con
`useState`/`useEffect`, token JWT en `localStorage`, llamadas directas al backend vía
`NEXT_PUBLIC_API_URL`.

**Sistema de diseño por tokens** en `app/globals.css`, mapeado a Tailwind en
`tailwind.config.js`. Paleta "Iridiscencia", sacada del propio logo — el tordo es un pájaro
negro con tornasol azul-verdoso:

- **navy = estructura**, **teal = acción**, **verde = liberado para significar "bueno"**.
  Antes `--color-accent` y `--color-success` valían el mismo hex, así que "esto es de TORDO"
  y "este número es bueno" eran indistinguibles.
- Ningún hex único sirve en ambos temas, así que cada color de acción tiene **dos paradas
  invertidas por tema** más un `--color-on-*` que dice qué etiqueta va encima.
- La landing añade cuatro bandas (`band-1..4`) que dibujan una distribución: el tono se
  profundiza hacia el centro y el centro es el bloque de datos de ChileCompra. Es el mismo
  gesto que P10·P25·P50·P75·P90 en `PriceBandChart`.
- Tipografía: **Archivo** display, **DM Sans** cuerpo, **Varien** sólo para la marca.
  `.cifra` para cifras que se comparan en columna — DM Sans no trae figuras tabulares y
  Archivo sí.
- Tema claro por defecto, con toggle claro/oscuro/sistema en Configuración.

La landing es server component (`app/page.tsx`) y toda su interactividad vive en
`components/landing/LandingClient.tsx`: **no le devuelvas el `'use client'`**, porque Next
ignora `metadata` en componentes cliente y la home perdería título y tarjeta de preview.

### ETL — `etl/`

`main.py` orquesta → `extractors/` → `transformers/` → `loaders/DatabaseLoaderV2`.
`analytics/` tiene 15 módulos Polars; `opportunity_scorer` corre último y agrega el resto.
`analytics/evaluation/` es el harness de evaluación.

### Patrones vigentes
- **Auth**: JWT HS256 30 min (sin refresh token) + Google OAuth + roles empresa
  (owner/admin/viewer) + cuotas por plan.
- **Alertas**: preferencias → AlertEngine → `INSERT ON CONFLICT` idempotente → multicanal.
- **Planes**: el `id` del plan que devuelve `/api/billing/plans` **es** el `plan_tier` que se
  guarda en la empresa (`basico | pyme | pro | enterprise`); `nombre` es sólo lo que se
  muestra. Los límites — documentos, consultas BI, alertas y **asientos** — viven todos en
  `PLAN_QUOTAS` (`core/plan_limits.py`), que es la única tabla que hay que editar.
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
- ~~`Column(JSON)` donde corresponde `JSONB`~~ — **resuelto en F4**: las 26 columnas son JSONB.
  **Toda columna JSON nueva se declara `JSONB`**; `JSON` guarda texto y lo reparsea en cada
  lectura, y no se puede indexar.
- ~~Búsqueda con `ILIKE '%término%'`~~ — **resuelto en F4**: columna generada `busqueda`
  (tsvector español) + GIN, más trigrama sobre `nombre`. **La búsqueda no se escribe a mano**:
  usa `_coincide_termino()` en `api/tenders.py`, que combina las dos vías. Pendiente:
  insensibilidad a tildes (exige una función IMMUTABLE propia).
- ~~Suscripción y `plan_tier` colgando de `User`~~ — **resuelto en F3**: pertenecen a la empresa.
- `subprocess.run` desde Celery hacia el ETL (F2).
- ~~`Base.metadata.create_all()` en el loader del ETL~~ — **resuelto en F4**: verifica el
  esquema y falla con instrucciones. **El esquema sólo lo crean las migraciones.**
- ~~`conftest.py` mantiene a mano el DDL de 11 tablas en SQLite~~ — **resuelto**: el esquema
  lo crean las migraciones (`alembic upgrade head`) sobre Postgres real, y cada test corre
  en una transacción que se revierte.
- **El golden master de BI no corre en `make ci` ni en GitHub Actions**: necesita las tablas
  de `analytics` materializadas, y ahí están vacías. Se salta en silencio. Hasta que se
  resuelva, **un cambio a `services/bi/` sólo está verificado si corres el golden en local**
  con los parquets materializados.
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
