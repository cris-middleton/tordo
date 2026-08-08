import logging
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.api import (
    alerts,
    auth,
    bi,
    billing,
    dashboard,
    data_inspection,
    documentos,
    empresas,
    estado_habil,
    health,
    postulaciones,
    tenders,
    users,
    webhooks,
)
from app.api.documentacion import DESCRIPCION, ETIQUETAS
from app.config import settings
from app.core.versionado import PREFIJO_API
from app.mcp.servidor import aplicacion as aplicacion_mcp
from app.mcp.servidor import servidor as servidor_mcp
from app.observability import request_id_ctx, setup_logging, setup_sentry

# Antes de cualquier otra cosa: si el logging no está configurado, los mensajes
# de arranque se pierden y Sentry no captura los fallos de inicialización.
setup_logging(level=settings.log_level, json_output=settings.log_json)
setup_sentry(
    dsn=settings.sentry_dsn,
    environment=settings.environment,
    release=settings.app_version,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def ciclo_de_vida(_app: FastAPI):
    """Arranca el gestor de sesiones del MCP.

    Montar una app ASGI dentro de otra **no ejecuta su ciclo de vida**, y sin
    eso el servidor MCP acepta la conexión y falla en la primera herramienta.
    No hay forma de que lo detecte un test que sólo importe la app: hay que
    ejercitarlo por HTTP, y por eso `tests/test_mcp.py` lo hace.
    """
    async with servidor_mcp.session_manager.run():
        yield


app = FastAPI(
    lifespan=ciclo_de_vida,
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug,
    # La descripción viaja DENTRO del esquema OpenAPI: la ve quien abre `/docs`,
    # quien genera un cliente y quien se descarga el JSON. Un README aparte se
    # queda viejo sin que nada falle.
    description=DESCRIPCION,
    openapi_tags=ETIQUETAS,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class BIRateLimitMiddleware(BaseHTTPMiddleware):
    """60 peticiones por minuto y por IP sobre los endpoints de BI.

    Falla abierto si Redis no responde: quedarse sin límite es peor que quedarse
    sin BI.

    El prefijo se compone con `PREFIJO_API` y no se escribe a mano. Con la ruta
    literal, versionar la API dejó este middleware sin coincidir con nada — y no
    falla: simplemente deja de limitar, en silencio, los 22 endpoints más caros
    del producto.
    """

    RUTA_BI = f"{PREFIJO_API}/bi/"

    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith(self.RUTA_BI):
            return await call_next(request)

        ip = (request.client.host if request.client else None) or "unknown"
        minute = datetime.now(UTC).strftime("%Y%m%d%H%M")
        key = f"rl:bi:{ip}:{minute}"

        try:
            import redis as _redis

            r = _redis.from_url(settings.redis_url, decode_responses=True, socket_connect_timeout=1)
            count = r.incr(key)
            if count == 1:
                r.expire(key, 60)
            if count > 60:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Demasiadas solicitudes. Intenta de nuevo en un minuto."},
                    headers={"Retry-After": "60"},
                )
        except Exception as exc:
            logger.warning("BIRateLimitMiddleware Redis error: %s", exc)

        return await call_next(request)


app.add_middleware(BIRateLimitMiddleware)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Propagate an inbound X-Request-ID or mint one, and echo it on the response.

    The id is what correlates a user-facing error with the server-side traceback,
    so it is the only error detail we hand back to the client.
    """

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        request.state.request_id = request_id
        # También al contexto de logging, para que todo log emitido durante esta
        # petición lo lleve — incluso desde servicios que no ven el `request`.
        token = request_id_ctx.set(request_id)
        try:
            response = await call_next(request)
        finally:
            request_id_ctx.reset(token)
        response.headers["X-Request-ID"] = request_id
        return response


app.add_middleware(RequestIDMiddleware)


@app.exception_handler(Exception)
async def catch_all_exception_handler(request: Request, exc: Exception):
    """Return 500 JSON with CORS headers so browsers don't mask the real error as 'Network Error'.

    The exception type and message stay in the logs — leaking them to the client
    exposes SQL fragments, file paths and values. The client gets a request_id
    to quote instead. In debug mode the detail is included for local development.
    """
    request_id = getattr(request.state, "request_id", None) or uuid.uuid4().hex
    logger.exception(
        "Unhandled exception on %s [request_id=%s]: %s", request.url.path, request_id, exc
    )

    origin = request.headers.get("origin", "")
    headers = {"X-Request-ID": request_id}
    if origin in settings.cors_origins:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"

    detail = "Error interno del servidor."
    if settings.debug:
        detail = f"{detail} [debug] {type(exc).__name__}: {exc}"

    return JSONResponse(
        status_code=500,
        content={"detail": detail, "request_id": request_id},
        headers=headers,
    )


# ── Rutas ────────────────────────────────────────────────────────────────────
#
# El prefijo vive AQUÍ y en un solo sitio. Los routers declaran su ruta relativa
# (`/tenders`, `/empresas`…) y no saben nada de la versión: publicar una v2 es
# montar los mismos routers bajo otro prefijo, no editar catorce ficheros.
#
# `/health` queda FUERA de la versión a propósito: lo consulta el healthcheck de
# la plataforma, no un cliente de la API. Versionarlo obligaría a tocar la
# configuración de Railway cada vez que suba la versión, que es justo lo que el
# versionado intenta evitar.
for router in (
    data_inspection.router,
    auth.router,
    users.router,
    tenders.router,
    alerts.router,
    empresas.router,
    documentos.router,
    documentos.file_router,
    postulaciones.router,
    estado_habil.router,
    bi.router,
    dashboard.router,
    billing.router,
    webhooks.router,
):
    app.include_router(router, prefix=PREFIJO_API)

app.include_router(health.router)

# El MCP va FUERA de `/api/v1`, y no es una excepción caprichosa: MCP versiona su
# propio protocolo (`protocol_version` en cada handshake). Colgarlo de nuestra
# versión REST prometería que una v2 nuestra cambia el protocolo, que es falso, y
# que el protocolo no cambia sin que cambiemos la v, que también.
app.mount("/mcp", aplicacion_mcp())


# El pre-warm de artefactos de BI vivía aquí: cargaba en segundo plano 60 MB de
# parquets de precios y un modelo TF-IDF de 71 MB para que la primera petición no
# tumbara al worker. Ya no hace falta — el BI se sirve desde Postgres con índices
# (docs/decisiones/0006-analytics-en-postgres.md), así que no hay nada pesado que
# precargar y el arranque no depende del sistema de archivos.
#
# El TF-IDF sigue cargándose en el proceso bajo FEATURE_TFIDF; sacarlo a un job
# nocturno es lo que queda de F2.


@app.get("/", tags=["raiz"])
async def root():
    """Punto de entrada: versión y dónde está la documentación."""
    return {
        "status": "active",
        # El nombre se lee de la configuración: estaba escrito a mano, y
        # renombrar el producto habría dejado el anterior aquí para siempre.
        "message": f"{settings.app_name} API",
        "version": settings.app_version,
        "docs": "/docs",
        "redoc": "/redoc",
    }
