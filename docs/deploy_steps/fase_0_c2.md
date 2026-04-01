# Fase 0 — Preparación del Proyecto
**Complejidad**: 2 · **LLM recomendado**: Haiku 4.5 o similar  
**Semana**: 1 · **Duración estimada**: 5–6 días

> **Actualizado por auditoría v3.1 (Marzo 2026)**: Se agregaron correcciones de bugs
> preexistentes detectados en auditoría del codebase. Leer la Sección 0.3 del SPEC.md
> antes de comenzar para entender el estado real del proyecto.

---

## Contexto del Proyecto

Estás trabajando en **LicitaFácil**, un SaaS B2B para PYMES chilenas que participan en licitaciones públicas de Mercado Público. El producto resuelve **compliance operativo**: mantener el "estado hábil" en el Registro de Proveedores, gestionar documentos con fechas de vencimiento, y hacer checklist de anexos por licitación.

El codebase base ya existe en:
```
saas_licitaciones/
├── backend/          → FastAPI + SQLAlchemy + Celery + Redis
├── frontend/         → Next.js 14 + Tailwind CSS + TypeScript
├── etl/              → Python ETL que consume API de Mercado Público
├── infra/
│   └── docker-compose.yml
└── .env.example
```

El archivo de especificaciones técnicas completo está en `SPEC.md` en la raíz del proyecto. **Léelo antes de empezar**.

---

## Objetivo de esta Fase

Dejar el proyecto limpio y con las dependencias, configuraciones e infraestructura local lista para el desarrollo del pivot. **No se implementa ninguna feature nueva en esta fase**.

### Bugs preexistentes a resolver en esta fase

| Bug | Descripción breve | Tarea |
|---|---|---|
| #2 | `/api/data` endpoints sin autenticación — cualquier anónimo puede leer toda la DB | 0.3 |
| #3 | `aiosmtplib` en requirements pero nunca usado | 0.5 |
| #4 | Token expiry = 30 min → silently log out users | 0.12 |
| #5 | `uvicorn --reload` en docker-compose → no usar en producción | 0.8 |
| #6 | ETL command comentado en docker-compose → no ejecuta nada | 0.8 |
| #7 | Ticket API Mercado Público hardcodeado en ETL config | 0.12 |

---

## Tareas

### 0.1 — Crear rama de trabajo
```bash
git checkout -b v3-yuca
```

### 0.2 — Ocultar analytics con feature flag (frontend)

En `frontend/app/dashboard/analytics/page.tsx`, envolver todo el contenido con:
```tsx
// Leer variable de entorno
const analyticsEnabled = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === 'true'
if (!analyticsEnabled) {
  redirect('/dashboard')
}
```
O bien, en `frontend/components/Layout.tsx`, ocultar el ítem de navegación de Analytics condicionalmente con `process.env.NEXT_PUBLIC_ANALYTICS_ENABLED`.

Agregar a `frontend/.env.local` (y `.env.example`):
```
NEXT_PUBLIC_ANALYTICS_ENABLED=false
```

### 0.3 — [Bug #2] Mover debug endpoints al router de desarrollo (backend)

> **⚠️ Seguridad crítica**: El router actual `/api/data` en `backend/app/api/data_inspection.py`
> no tiene autenticación alguna. Cualquier usuario anónimo puede consultar toda la DB.

En `backend/app/main.py`, cambiar el registro del router para que solo cargue si `DEBUG=true`:
```python
# backend/app/main.py
from app.config import settings  # NOTA: actualmente está en app.config, no app.core.config

if settings.debug:  # NOTA: el field es 'debug' (lowercase) en la clase Settings actual
    from app.api import data_inspection
    app.include_router(
        data_inspection.router, prefix="/api/data", tags=["debug"]
    )
```
Verificar que `settings.debug` sea `bool` en `backend/app/config.py`.

### 0.4 — Reemplazar pypdf2 por pypdf

En `backend/requirements.txt`:
- Eliminar la línea `pypdf2==3.0.1` (o cualquier versión de pypdf2)
- Agregar: `pypdf==4.2.0`

### 0.5 — [Bug #3] Limpiar y actualizar dependencias del backend

**Eliminar** de `backend/requirements.txt`:
- `aiosmtplib==3.0.1` — nunca se usa; el email usa `smtplib` de stdlib
- La segunda ocurrencia de `httpx==0.25.2` (está duplicada)

**Agregar** al final de `backend/requirements.txt`:
```txt
# Fase 0 — nuevas dependencias YUCA v3.0
asyncpg==0.29.0
boto3==1.34.0
authlib==1.3.0
stripe==7.0.0
python-multipart==0.0.9
pypdf==4.2.0
Pillow==10.2.0
python-magic==0.4.27
tenacity==8.2.3
slowapi==0.1.9
structlog==24.1.0
flower==2.0.1
duckdb==0.10.0
pandas==2.2.0
scikit-learn==1.4.0
numpy==1.26.0
```

### 0.6 — Limpiar y actualizar dependencias del ETL

**Eliminar** de `etl/requirements.txt` (no son usadas por ningún extractor/transformer):
- `beautifulsoup4==4.12.2`
- `lxml==4.9.3`
- `schedule==1.2.0`

**Agregar** (si no están ya):
```txt
tenacity==8.2.3
pandas==2.2.0
duckdb==0.10.0
```

### 0.7 — Agregar dependencias al frontend

En `frontend/package.json`, en la sección `"dependencies"`:
```json
"@stripe/stripe-js": "^3.0.0",
"@stripe/react-stripe-js": "^2.0.0",
"react-dropzone": "^14.0.0",
"@tanstack/react-query": "^5.0.0",
"react-hot-toast": "^2.4.0"
```
Luego ejecutar: `npm install` en el directorio `frontend/`.

### 0.8 — [Bugs #5, #6] Actualizar docker-compose + agregar MinIO y Flower

> **Bug #5**: El servicio `backend` tiene `--reload` en su command. Eliminarlo.
> **Bug #6**: El servicio `etl` tiene su command comentado. Definir el command o
> migrar el ETL a Celery Beat (recomendado; el command del ETL container puede
> quedar comentado si se usa Celery Beat, pero documentar el por qué).

**Cambiar en el servicio `backend`:**
```yaml
# ANTES (incorrecto para producción):
command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# DESPUÉS:
command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
```

**Agregar estos servicios** al final de la sección `services:` y el volumen correspondiente:

```yaml
  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3

  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
        mc alias set local http://minio:9000 minioadmin minioadmin;
        mc mb local/licitafacil-documentos --ignore-existing;
        mc anonymous set none local/licitafacil-documentos;
        echo 'MinIO bucket ready';
      "

  flower:
    image: mher/flower:2.0
    ports:
      - "5555:5555"
    environment:
      CELERY_BROKER_URL: ${REDIS_URL}
      FLOWER_BASIC_AUTH: admin:${FLOWER_PASSWORD}
    depends_on:
      - redis
    command: celery flower
```

En la sección `volumes:` del docker-compose, agregar:
```yaml
  minio_data:
```

### 0.9 — Actualizar Celery con timezone correcto y beat_schedule

> **Estado actual**: `backend/app/celery_app.py` tiene `timezone="UTC"` y **no tiene
> ningún `beat_schedule`**. Celery Beat está deployado pero no hace nada útil.

En `backend/app/celery_app.py`, reemplazar la configuración completa por la definida
en la Sección 9.6 del `SPEC.md`. Los puntos críticos a cambiar:

```python
# Importar desde app.config (no app.core.config — todavía no existe ahí)
from app.config import settings

celery_app.conf.update(
    # CRÍTICO: cambiar de "UTC" a "America/Santiago"
    timezone="America/Santiago",
    enable_utc=True,
    # NUEVO: agregar estas dos líneas
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # NUEVO: beat_schedule completo (ver Sección 9.6 del SPEC.md para el código completo)
    beat_schedule={
        "etl-licitaciones-diario": { ... },
        "check-estado-habil": { ... },
        # etc — ver SPEC.md sección 9.6
    },
)
```

### 0.10 — Crear core/database.py con asyncpg y mover config.py

**Paso 1**: Crear `backend/app/core/database.py` (nuevo archivo) con el código de la
Sección 9.5 del `SPEC.md`. El archivo existente `backend/app/db/__init__.py` puede
mantenerse para la sesión sync que usa Alembic.

**Paso 2**: Mover `backend/app/config.py` a `backend/app/core/config.py`.

**Paso 3**: Actualizar **todos los imports** en el proyecto de
`from app.config import settings` a `from app.core.config import settings`.
Buscar con: `grep -r "from app.config import" backend/`

Crear o reemplazar `backend/app/core/database.py` con `create_async_engine` con pool configurado:

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,  # Debe ser postgresql+asyncpg://...
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True,
    echo=settings.DEBUG,
)

AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```

**IMPORTANTE**: Agregar también `DATABASE_URL_SYNC` a `core/config.py` (o mantenerlo en
`backend/app/db/__init__.py` para Alembic) para que Alembic siga usando psycopg2
(sin `+asyncpg`). Alembic no soporta drivers async.

### 0.11 — Crear primera migración Alembic: tabla task_failures

Crear el archivo `backend/alembic/versions/0004_add_task_failures.py`:

```python
"""add task_failures table

Revision ID: 0004
Revises: <revision_id_de_la_última_migración>
Create Date: 2026-03-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

def upgrade():
    op.create_table(
        'task_failures',
        sa.Column('id', UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('task_name', sa.String(255), nullable=False),
        sa.Column('task_args', JSONB),
        sa.Column('error_msg', sa.Text),
        sa.Column('failed_at', sa.TIMESTAMP(timezone=True),
                  server_default=sa.func.now()),
        sa.Column('resolved', sa.Boolean, default=False),
        sa.Column('resolved_at', sa.TIMESTAMP(timezone=True)),
    )
    op.create_index(
        'idx_task_failures_unresolved',
        'task_failures', ['failed_at'],
        postgresql_where=sa.text('resolved = FALSE')
    )

def downgrade():
    op.drop_index('idx_task_failures_unresolved')
    op.drop_table('task_failures')
```

Ejecutar: `alembic upgrade head`

### 0.12 — [Bugs #4, #7] Actualizar .env.example

> **Bug #4**: `ACCESS_TOKEN_EXPIRE_MINUTES` está a 30 minutos — los usuarios se
> desloguean solos a los 30 min. Cambiar a 1440 (24h).
> **Bug #7**: `MERCADO_PUBLICO_TICKET` aparece duplicado en el `.env.example`. El
> default en `etl/config.py` es el ticket demo — debe quedar vacío.

Reemplazar/actualizar `.env.example`. Variables críticas a agregar o corregir:
```bash
# App
APP_NAME=YUCA
ACCESS_TOKEN_EXPIRE_MINUTES=1440   # Bug #4: era 30, demasiado corto

# DB (asyncpg para runtime, psycopg2 para Alembic)
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/licitaciones
DATABASE_URL_SYNC=postgresql://postgres:postgres@localhost:5432/licitaciones

# ETL — Bug #7: eliminar el ticket demo hardcodeado
MERCADO_PUBLICO_TICKET=   # dejar vacío; el ETL debe fallar si no está configurado

# S3 / MinIO
S3_BUCKET=yuca-documentos
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
S3_ENDPOINT_URL=http://localhost:9000  # MinIO en local

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# ChileCompra datos abiertos
DATOS_ABIERTOS_CSV_URL=https://datos-abiertos.chilecompra.cl/proveedores/habiles

# Twilio WhatsApp WABA
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=

# Celery / Flower
REDIS_URL=redis://localhost:6379/0
FLOWER_PASSWORD=change-me-in-production

# Feature flags
NEXT_PUBLIC_ANALYTICS_ENABLED=false
ANALYTICS_ENABLED=false
```

### 0.13 — Desactivar ETL de órdenes de compra

En `infra/docker-compose.yml`, en el servicio `etl` o `celery_beat`, comentar la tarea de órdenes de compra. Si está en un archivo de configuración de Celery Beat, agregar un flag `enabled: false` o simplemente no incluir la schedule.

En `backend/app/celery_app.py`, dentro de `beat_schedule`, comentar o eliminar cualquier task relacionada con `ordenes_compra`.

---

## Criterios de Aceptación

- [ ] `docker-compose up` levanta los 9 servicios sin errores (incluidos MinIO y Flower)
- [ ] `uvicorn` arranca **sin** flag `--reload` en el docker-compose
- [ ] Flower accesible en `http://localhost:5555`
- [ ] MinIO accesible en `http://localhost:9001` con usuario `minioadmin/minioadmin`
- [ ] El bucket `yuca-documentos` existe en MinIO
- [ ] `cd backend && alembic upgrade head` aplica la migración sin errores
- [ ] `cd frontend && npm install` completa sin errores
- [ ] La ruta `/dashboard/analytics` redirige a `/dashboard` (feature flag en false)
- [ ] `GET /api/data/tables` retorna 404 o 422 cuando `DEBUG=false` (no 200)
- [ ] No quedan referencias a `pypdf2` en `requirements.txt`
- [ ] No queda `aiosmtplib` en `backend/requirements.txt` (Bug #3)
- [ ] `ACCESS_TOKEN_EXPIRE_MINUTES=1440` en `.env.example` (Bug #4)
- [ ] `MERCADO_PUBLICO_TICKET` sin valor default hardcodeado en `etl/config.py` (Bug #7)

---

## NO implementes en esta fase

- Ninguna feature nueva de producto
- Nada de S3 real (usar MinIO local)
- No modificar modelos de la DB (más allá de `task_failures`)
