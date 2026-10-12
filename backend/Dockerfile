# Backend API (FastAPI).
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
# El ETL y los cron tienen su propia imagen (etl/Dockerfile).
WORKDIR /deps
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-default-groups --group api

# Código de la aplicación
WORKDIR /app
COPY backend/ ./

EXPOSE ${PORT:-8000}

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health/ || exit 1

# Migrar y servir. Corre al arrancar el contenedor para que la red privada de
# Railway (postgres.railway.internal) sea alcanzable.
#
# UN worker, y explícito. Ya no por memoria: medido con `make medir-memoria`
# sobre esta misma imagen (2026-10-12), con seis meses de analytics reales y el
# índice en memoria de las páginas públicas (`ANALYTICS_DIR=… make medir-memoria`):
#
#   límite   workers  reposo   pico
#   512 MB      1     103 MB   171 MB
#   512 MB      2     225 MB   378 MB
#   512 MB      4     419 MB   OOM
#   256 MB      1     101 MB   176 MB
#
# Uno cabe en 256 MB, pero Railway cobra la memoria usada y no el límite. Lo que obliga a uno es el límite
# por IP, que vive en memoria de cada proceso (`app/core/limite_ip.py`): con N
# workers hay N cubos por IP y el límite real es N veces el anunciado. Subir
# `WEB_CONCURRENCY` exige antes sacar ese contador del proceso.
#
# `--no-proxy-headers`: de qué IP viene una petición lo decide
# `app/core/limite_ip.py`, con su modelo de confianza escrito. Uvicorn por su
# cuenta reescribe `client` desde X-Forwarded-For si la conexión llega de
# 127.0.0.1, y serían dos reglas distintas para la misma pregunta.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-1} --no-proxy-headers"]
