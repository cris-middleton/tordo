# Tordo

Plataforma SaaS para PYMES chilenas que participan en licitaciones públicas. Gestiona alertas, seguimiento de oportunidades y **compliance operativo** (estado hábil, documentos, checklist de postulaciones).

> **Estado del proyecto**: En pivot hacia **YUCA** (SPEC v3.1). Ver `docs/SPEC.md` para la especificación técnica completa y `docs/deploy_steps/` para el plan de implementación por fases.

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
- Python 3.11+ (desarrollo local)
- Node.js 18+ (frontend)

### Configuración

1. **Clonar el repositorio**
   ```bash
   git clone <repository-url>
   cd saas_licitaciones
   ```

2. **Crear archivo de entorno**
   ```bash
   cp .env.example .env
   # Editar .env con tu configuración
   ```

3. **Levantar servicios con Docker Compose**
   ```bash
   cd infra
   docker-compose up -d
   ```

4. **Aplicar migraciones**
   ```bash
   cd backend
   alembic upgrade head
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

### Flujo de Implementación (Pivot YUCA)

El desarrollo sigue un plan por fases documentado en `docs/deploy_steps/`:

1. **Leer** `docs/SPEC.md` (especificación técnica)
2. **Revisar** `docs/deploy_steps/tareas_manuales.md` (tareas que requieren acción humana)
3. **Ejecutar** las fases en orden: `fase_0_c2.md` → `fase_1_c3.md` → ...

### Backend

```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate
# Linux/macOS: source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### ETL

```bash
cd etl
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
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

> MinIO (almacenamiento de documentos) y Flower (monitoreo de Celery) se agregarán en Fase 0 del plan de implementación.

## Migraciones de Base de Datos

```bash
cd backend
# Crear nueva migración
alembic revision --autogenerate -m "descripción"

# Aplicar migraciones
alembic upgrade head

# Rollback
alembic downgrade -1
```

## Testing

```bash
cd backend
pytest

# Con cobertura
pytest --cov=app tests/
```

## Variables de Entorno

Ver `.env.example` para la lista completa. Variables críticas:

- `DATABASE_URL` — Conexión PostgreSQL
- `REDIS_URL` — Cola Celery
- `SECRET_KEY` — JWT (cambiar en producción)
- `MERCADO_PUBLICO_TICKET` — API ChileCompra (ticket demo incluido en .env.example)
- `APP_NAME` — Nombre de la aplicación (placeholder hasta definir marca final)

## Documentación Relacionada

- **docs/SPEC.md** — Especificación técnica completa, arquitectura, modelo de datos, roadmap
- **docs/deploy_steps/** — Plan de implementación por fases
- **docs/** — Guías de desarrollo, referencia de API, planes de negocio

## Licencia

[Agregar licencia]
