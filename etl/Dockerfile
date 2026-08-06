# Pipeline ETL.
#
# IMPORTANTE: el contexto de build es la RAÍZ del repo (pyproject.toml y uv.lock
# viven ahí):
#   docker-compose: build: { context: .., dockerfile: etl/Dockerfile }
#
# El código se importa como paquete `etl.*`, así que vive bajo /workspace/etl y
# PYTHONPATH apunta a /workspace. En desarrollo, compose monta el repo sobre
# /workspace y el código de la imagen queda sombreado — es intencional.
FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    postgresql-client \
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
    PYTHONPATH=/workspace \
    PATH="/opt/venv/bin:$PATH"

# Capa de dependencias cacheable — sólo el grupo `etl`.
WORKDIR /deps
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-default-groups --group etl

WORKDIR /workspace/etl
COPY etl/ ./

CMD ["python", "main.py"]
