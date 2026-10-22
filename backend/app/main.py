import logging
import os
import re
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.api import bi, compra_agil, health, publico, tenders
from app.api.documentacion import DESCRIPCION, ETIQUETAS
from app.config import settings
from app.core.endurecimiento import EndurecimientoMiddleware
from app.core.errores_validacion import validacion_en_espanol
from app.core.limite_ip import LimitadorEnMemoria, LimitePorIPMiddleware, avisos_de_configuracion
from app.core.redirecciones import LocationRelativaMiddleware, MCPSinBarraMiddleware
from app.core.versionado import PREFIJO_API
from app.mcp.servidor import aplicacion as aplicacion_mcp
from app.mcp.servidor import aviso_de_hosts
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

for _aviso in avisos_de_configuracion(
    entorno=settings.environment,
    secreto=settings.proxy_secreto,
    confiar_xff=settings.confiar_x_forwarded_for,
    workers=os.environ.get("WEB_CONCURRENCY"),
):
    logger.warning(_aviso)
if _aviso_mcp := aviso_de_hosts(entorno=settings.environment, hosts=settings.mcp_hosts_permitidos):
    logger.warning(_aviso_mcp)


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

# Límite por IP sobre `/api/v1/*` y `/mcp`, en memoria (`app/core/limite_ip.py`,
# donde está el modelo de confianza). Se añade ANTES que CORS para quedar por
# dentro: así un 429 sale con sus cabeceras CORS, y un preflight lo contesta
# CORS sin gastar cupo.
#
# El prefijo se compone con `PREFIJO_API` y no se escribe a mano. Con la ruta
# literal, versionar la API dejó al limitador anterior sin coincidir con nada —
# y no falla: simplemente deja de limitar, en silencio.
limitador_ip = LimitadorEnMemoria(settings.limite_por_minuto)
app.add_middleware(
    LimitePorIPMiddleware,
    limitador=limitador_ip,
    prefijo_api=PREFIJO_API,
    secreto=settings.proxy_secreto,
    confiar_xff=settings.confiar_x_forwarded_for,
)

# CORS middleware. Sin credenciales: desde el pivote público no hay sesión ni
# cookie que mandar, y quien habla con el backend es el servidor de Next.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


#: Un `X-Request-ID` que llega de fuera se acepta sólo si parece uno: se repite
#: en la respuesta, en cada línea de log y en el error del MCP, y sin cota un
#: cliente metía ahí lo que quisiera, del largo que quisiera.
_REQUEST_ID_VALIDO = re.compile(r"[A-Za-z0-9-]{1,64}")


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Propagate an inbound X-Request-ID or mint one, and echo it on the response.

    The id is what correlates a user-facing error with the server-side traceback,
    so it is the only error detail we hand back to the client.
    """

    async def dispatch(self, request: Request, call_next):
        entrante = request.headers.get("X-Request-ID") or ""
        request_id = entrante if _REQUEST_ID_VALIDO.fullmatch(entrante) else uuid.uuid4().hex
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

# El más externo: reescribe a relativo el Location de cualquier 3xx propio, venga
# de donde venga (`app/core/redirecciones.py`). Sin esto, detrás del TLS de
# Railway cada redirección por barra final bajaba a http:// (spec §8.4).
app.add_middleware(LocationRelativaMiddleware)

# Y por fuera de todo, `/mcp` se sirve como `/mcp/` sin redirigir: es la URL que
# la gente pega en su cliente MCP. El límite por IP la sigue contando.
app.add_middleware(MCPSinBarraMiddleware)

# Lo más externo: cuerpo acotado, ningún `%00` y las cabeceras de endurecimiento
# en toda respuesta, también en un 429 o un 413 (`app/core/endurecimiento.py`).
app.add_middleware(EndurecimientoMiddleware, cors_todos="*" in settings.cors_origins)


# Un parámetro inválido es un 422 con la lista de Pydantic, como siempre, pero con
# cada `msg` en español: lo lee una persona (`app/core/errores_validacion.py`).
app.add_exception_handler(RequestValidationError, validacion_en_espanol)


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
    # Con `CORS_ORIGINS=*` (producción) el origen no está en la lista y el 500 le
    # llegaba a un integrador como «Network Error», sin su `request_id`.
    if "*" in settings.cors_origins:
        headers["Access-Control-Allow-Origin"] = "*"
    elif origin in settings.cors_origins:
        headers["Access-Control-Allow-Origin"] = origin

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
# (`/tenders`, `/bi`) y no saben nada de la versión: publicar una v2 es montar
# los mismos routers bajo otro prefijo, no editar cada fichero.
#
# `/health` queda FUERA de la versión a propósito: lo consulta el healthcheck de
# la plataforma, no un cliente de la API. Versionarlo obligaría a tocar la
# configuración de Railway cada vez que suba la versión, que es justo lo que el
# versionado intenta evitar.
for router in (tenders.router, bi.router, compra_agil.router, publico.router):
    app.include_router(router, prefix=PREFIJO_API)

app.include_router(health.router)

# El MCP va FUERA de `/api/v1`, y no es una excepción caprichosa: MCP versiona su
# propio protocolo (`protocol_version` en cada handshake). Colgarlo de nuestra
# versión REST prometería que una v2 nuestra cambia el protocolo, que es falso, y
# que el protocolo no cambia sin que cambiemos la v, que también.
# Responde en `/mcp/` y, por `MCPSinBarraMiddleware`, también en `/mcp` sin redirigir.
app.mount("/mcp", aplicacion_mcp())


# El pre-warm de artefactos de BI vivía aquí: cargaba en segundo plano 60 MB de
# parquets de precios y un modelo TF-IDF de 71 MB para que la primera petición no
# tumbara al worker. Ya no hace falta — el BI se sirve desde Postgres con índices
# (docs/decisiones/0006-analytics-en-postgres.md), así que no hay nada pesado que
# precargar y el arranque no depende del sistema de archivos.
#
# El TF-IDF tampoco: salió de la API en el paso 8 del pivote público. El orden por
# relevancia lo hace Postgres y `tests/test_api_sin_tfidf.py` impide que vuelva.


#: El `robots.txt` de la API. La documentación se puede rastrear; los datos no:
#: un rastreador recorriendo `/api/v1/bi/*` cuenta en el límite por IP y le pide
#: consultas pesadas a un proceso de 512 MB que ya murió por memoria con tráfico
#: ligero. Lo que se indexa del sitio vive en tordo.cl, con su propio sitemap.
#: Se pedía 17 veces al día y respondía 404 (logs del 2026-10-21). El esquema
#: también: `/docs` y `/redoc` lo piden con JavaScript, y sin él salen vacías.
ROBOTS_TXT = f"User-agent: *\nAllow: /docs\nAllow: /redoc\nAllow: {app.openapi_url}\nDisallow: /\n"


@app.get("/robots.txt", tags=["raiz"], include_in_schema=False)
async def robots_txt():
    return PlainTextResponse(ROBOTS_TXT)


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
