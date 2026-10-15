"""Las redirecciones de la API no bajan a http:// (spec del rediseño §8.4).

En Railway el TLS termina en el borde: la app recibe `scheme=http`, y Starlette
construye el `Location` de `redirect_slashes` con ese esquema
(`URL(scope=…)`). `https://api.tordo.cl/mcp` mandaba a `http://…/mcp/`: el
cliente repetía el POST **en claro**, el borde lo devolvía con un 301 a https y
el POST llegaba convertido en GET. Pasaba en las 29 redirecciones por barra
final, `/health` incluida.

**No se arregla confiando en `X-Forwarded-Proto`.** uvicorn corre con
`--no-proxy-headers` y la única regla de confianza en cabeceras de reenvío es
`app/core/limite_ip.py`. Un `Location` relativo no necesita saber el esquema:
el cliente lo resuelve contra la URL que pidió (RFC 9110 §10.2.2).

Middleware ASGI puro, como `LimitePorIPMiddleware`: no envuelve el cuerpo, así
que no rompe el streaming del MCP.
"""

from __future__ import annotations

from urllib.parse import urlsplit

from starlette.datastructures import URL, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send


def location_relativa(location: str, origen_propio: str) -> str:
    """El `Location` sin esquema ni host si apunta a este mismo origen.

    `origen_propio` es el `netloc` de la petición (`Host`, con puerto si lo
    trae). Un destino de otro host se devuelve intacto: volverlo relativo lo
    mandaría a una ruta nuestra que no existe. Tampoco se vuelve relativo un
    camino que empiece por `//` o `/\\`: sin esquema, el cliente lo leería como host.
    """
    partes = urlsplit(location)
    if partes.scheme not in ("http", "https") or partes.netloc.lower() != origen_propio.lower():
        return location
    relativa = partes.path or "/"
    # `//evil.com/` y `/\evil.com/` los resuelve un cliente contra OTRO host
    # (referencia de esquema relativo): un camino que empieza así no se puede
    # entregar sin esquema. El absoluto sigue siendo este mismo host.
    if relativa.startswith(("//", "/\\")):
        return location
    if partes.query:
        relativa += f"?{partes.query}"
    if partes.fragment:
        relativa += f"#{partes.fragment}"
    return relativa


class LocationRelativaMiddleware:
    """Reescribe a relativo el `Location` propio de toda respuesta 3xx."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # El mismo origen con que Starlette construye el Location de la redirección.
        propio = URL(scope=scope).netloc

        async def enviar(mensaje: Message) -> None:
            if mensaje["type"] == "http.response.start" and 300 <= mensaje["status"] < 400:
                cabeceras = MutableHeaders(scope=mensaje)
                destino = cabeceras.get("location")
                if destino is not None:
                    cabeceras["location"] = location_relativa(destino, propio)
            await send(mensaje)

        await self.app(scope, receive, enviar)


#: Donde vive el MCP (`app.mount` en `main.py`). Un `Mount` sólo casa con
#: `/mcp/…`, así que `/mcp` a secas redirigía.
RUTA_MCP = "/mcp"


class MCPSinBarraMiddleware:
    """`/mcp` se sirve como `/mcp/`, sin redirigir.

    La URL que la gente copia en su cliente MCP es `https://api.tordo.cl/mcp`.
    Con el 307, cada mensaje JSON-RPC costaba una ida y vuelta más y **dos**
    unidades del límite por IP (`limite_ip.aplica` cuenta `/mcp` y `/mcp/`), y
    no todos los clientes repiten un POST tras una redirección. Es una reescritura
    interna antes del enrutado, sólo de la ruta exacta: `/mcpx` sigue siendo 404.
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["path"] == RUTA_MCP:
            con_barra = f"{RUTA_MCP}/"
            scope = {**scope, "path": con_barra, "raw_path": con_barra.encode()}
        await self.app(scope, receive, send)
