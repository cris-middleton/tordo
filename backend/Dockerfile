# Backend API (FastAPI) — también usada por celery_worker y celery_beat.
#
# IMPORTANTE: el contexto de build es la RAÍZ del repo, no backend/, porque
# pyproject.toml y uv.lock viven en la raíz.
#   docker-compose: build: { context: .., dockerfile: backend/Dockerfile }
#   Railway:        root del servicio "/", dockerfilePath "backend/Dockerfile"
FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1 \
    # Los contenedores corren como root y montan el código del host. Sin esto,
    # Python deja __pycache__/ de root dentro del árbol de trabajo, y entonces
    # `git worktree remove` (y `make worktree-clean`) fallan con Permission
    # denied — el worktree queda anclado con cientos de MB en disco. El bytecode
    # de las dependencias ya lo precompiló uv con UV_COMPILE_BYTECODE, así que
    # aquí no se pierde arranque: sólo se deja de cachear el código propio.
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH"

# Capa de dependencias: sólo manifiesto + lock, para que Docker la cachee
# mientras el código cambia.
#
# La API sólo necesita el grupo `api` (sin pandas/numpy/bs4: imagen más chica).
# Pero el celery_worker lanza el ETL como subproceso, y ése sí necesita el grupo
# `etl`. Por eso los grupos son un build arg en vez de estar fijos: en compose,
# celery_worker construye con ambos.
#
# Sin esto el worker revienta con ModuleNotFoundError (pytz, pandas...) en cuanto
# corre la tarea horaria, y el ETL deja de funcionar en silencio.
ARG UV_GROUPS="--group api"
WORKDIR /deps
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-default-groups ${UV_GROUPS}

# Código de la aplicación
WORKDIR /app
COPY backend/ ./

EXPOSE ${PORT:-8000}

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health/ || exit 1

# Migrar y servir. Corre al arrancar el contenedor para que la red privada de
# Railway (postgres.railway.internal) sea alcanzable.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
