# Tordo

Plataforma SaaS para PYMES chilenas que participan en licitaciones públicas. Gestiona alertas, seguimiento de oportunidades y **compliance operativo** (estado hábil, documentos, checklist de postulaciones).

> **Nombre del producto: TORDO.** Decidido el 2026-08-05. El nombre se lee siempre desde
> `APP_NAME` / `BRAND_NAME`; no hardcodear. (Un pivot de marca a "YUCA" quedó descartado —
> si aparece una referencia a YUCA en algún documento, está obsoleta.)
>
> **Estado del proyecto**: Fases 0–6 de `docs/deploy_steps/` ~90 % implementadas. En curso el plan
> de remediación de arquitectura — ver **`docs/ARQUITECTURA_REVISION_2026-08.md`**, que es la
> referencia para cualquier cambio estructural. La especificación de producto es `docs/SPEC.md`.

## Estructura del Proyecto

```
tordo/
├── backend/          # FastAPI + SQLAlchemy + Celery
├── frontend/         # Next.js 14 + Tailwind CSS
├── etl/              # Pipeline de extracción (Mercado Público, estado hábil)
├── infra/            # Docker Compose
├── docs/             # Especificación técnica, planes de negocio, guías, deploy
│   ├── SPEC.md       # Especificación técnica completa (v3.1)
│   ├── deploy_steps/ # Fases de implementación (Fase 0 → 6) + tareas manuales
│   └── assets/       # Assets de diseño (logos fuente, etc.)
└── .env.example      # Variables de entorno de referencia
```

## Inicio Rápido

### Prerrequisitos

- Docker y Docker Compose
- [`uv`](https://docs.astral.sh/uv/) — gestor de dependencias Python (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Python 3.11 o 3.12 (`uv` lo instala si no lo tienes)
- Node.js 20+ (frontend)

### Configuración

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/cris-middleton/tordo.git
   cd tordo
   ```

2. **Setup del entorno** — instala dependencias y los hooks de pre-commit
   ```bash
   make setup
   ```

   > Los hooks de pre-commit son **por clone**. Los worktrees comparten el
   > directorio de hooks con el checkout principal, así que basta instalarlos
   > una vez. En un clone nuevo: `make hooks`.

3. **Crear archivo de entorno**
   ```bash
   cp .env.example .env
   # Editar .env con tu configuración
   ```

4. **Levantar el stack**
   ```bash
   make dev-up-d     # todos los servicios en segundo plano
   make migrate      # aplicar migraciones
   make dev-logs     # seguir los logs
   ```

5. **Acceder a los servicios**
   | Servicio | URL |
   |----------|-----|
   | Backend API | http://localhost:8000 |
   | API Docs (Swagger) | http://localhost:8000/docs |
   | Frontend | http://localhost:3000 |
   | PostgreSQL | localhost:5432 |
   | Redis | localhost:6379 |

   > **Nota**: Si el frontend corre en Docker y hace llamadas API desde el navegador, configura `NEXT_PUBLIC_API_URL=http://localhost:8000` en `.env` para que el cliente pueda alcanzar el backend.

## Desarrollo

### Flujo de trabajo

1. **Leer** `CLAUDE.md` (reglas de trabajo y mapa de arquitectura)
2. **Leer** `docs/ARQUITECTURA_REVISION_2026-08.md` antes de cualquier cambio estructural
3. **Consultar** `docs/SPEC.md` para el alcance de producto
4. **Revisar** `docs/deploy_steps/tareas_manuales.md` — servicios externos aún pendientes
   (Stripe live, Google OAuth, Twilio WABA, dominio + SSL)

**Toda feature se desarrolla en un worktree**, nunca ramificando en el checkout
principal:

```bash
make worktree NOMBRE=mi-feature   # rama + .env + dependencias, en un paso
cd ../tordo-worktrees/mi-feature
```

Luego PR a `main`; CI en verde es la única puerta. No hay rama ni entorno de staging
— es deliberado, ver `CLAUDE.md`.
`docs/deploy_steps/fase_*.md` es el roadmap original (fases 0–6, ~90 % ejecutado); se conserva
como referencia histórica del alcance, no como plan vigente.

### Comandos

`make help` lista todo. Los más usados:

```bash
make install       # dependencias Python desde uv.lock
make hooks         # instalar hooks de pre-commit (una vez por clone)
make lint          # ruff check + format --check (lo mismo que CI)
make lint-fix      # autocorregir
make test          # backend + ETL
make dev-up-d      # stack completo en segundo plano
make db-shell      # psql
```

Las dependencias viven en un único `pyproject.toml` en la raíz, con grupos
`api`, `etl` y `dev`, y un solo `uv.lock`. No hay `requirements.txt`.

### Backend (fuera de Docker)

```bash
cd backend
SECRET_KEY=dev uv run --project .. uvicorn app.main:app --reload
```

### Frontend

```bash
make front-install
make front-dev
```

### ETL

```bash
cd etl
uv run --project .. python main.py
```

## Servicios (Docker Compose)

| Servicio | Descripción |
|----------|-------------|
| **backend** | API REST FastAPI |
| **frontend** | Aplicación Next.js |
| **etl** | Pipeline de extracción de datos |
| **celery_worker** | Procesamiento asíncrono de alertas |
| **celery_beat** | Programador de tareas periódicas |
| **db** | PostgreSQL 15 |
| **redis** | Cola de tareas y caché |
| **minio** | Almacenamiento S3-compatible de documentos (dev) |
| **flower** | Monitoreo de tareas Celery |

> Las imágenes de backend y ETL se construyen con **contexto en la raíz del repo**
> (ahí viven `pyproject.toml` y `uv.lock`), no dentro de `backend/` o `etl/`.

## Migraciones de Base de Datos

```bash
make migrate-create MSG="descripción"   # crear migración
make migrate                            # aplicar
make migrate-status                     # revisión actual
make downgrade                          # revertir la última
```

> **Nunca uses `alembic revision` directamente.** Rompe las cadenas de
> `down_revision`, cosa que ya pasó en este repo. Siempre `make migrate-create`.

## Testing

```bash
make test          # backend + ETL
make test-backend
make test-etl
make test-cov      # backend con cobertura
```

`test_readiness_check` necesita una base de datos real: se salta en local si el
stack no está levantado, y es obligatorio en CI (que provisiona Postgres y Redis).

## CI

`.github/workflows/ci.yml` corre en cada PR a `main`: lint, validación de
migraciones (una sola cabeza y el ciclo completo `upgrade → downgrade → upgrade`
contra Postgres limpio), tests de backend y ETL, lint/tests/build del frontend,
y construcción de ambas imágenes Docker.

## Variables de Entorno

Ver `.env.example` para la lista completa. Variables críticas:

- `DATABASE_URL` — Conexión PostgreSQL
- `REDIS_URL` — Cola Celery
- `SECRET_KEY` — JWT (cambiar en producción)
- `MERCADO_PUBLICO_TICKET` — API ChileCompra (ticket demo incluido en .env.example)
- `APP_NAME` — Nombre de la aplicación (`TORDO`)

> **Los `.env` nunca se commitean.** Si una credencial llega a un commit, rótala de inmediato:
> quitarla del repo después no la invalida.

## Documentación Relacionada

| Documento | Para qué |
|---|---|
| `CLAUDE.md` | **Reglas de trabajo y mapa de arquitectura. Empieza aquí.** |
| `AGENTS.md` | Versión corta de las reglas, para herramientas que leen `AGENTS.md` |
| `docs/decisiones/` | ADRs — decisiones caras de revertir, una por archivo |
| `.claude/skills/` | Procedimientos para lo que ya salió mal aquí: endpoints con `empresa_id`, migraciones |
| `docs/ARQUITECTURA_REVISION_2026-08.md` | Revisión de arquitectura y plan de remediación por fases |
| `docs/SPEC.md` | Especificación técnica de producto |
| `docs/tordo_plan_saas.md` | Plan de negocio |
| `docs/COMANDOS_ETL.md` | Comandos del pipeline ETL |
| `docs/mercado_publico_faq.md` | Dominio: cómo funciona Mercado Público |
| `docs/ANALISIS_PROBLEMAS_DATOS.md`, `docs/VALIDACION_ESTRUCTURA_DATOS.md` | Calidad y estructura de los datos |
| `docs/deploy_steps/` | Despliegue y tareas manuales pendientes |
| `docs/_archive/` | Histórico. **No es documentación vigente.** |

## Licencia

[Agregar licencia]
