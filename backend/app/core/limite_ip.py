"""Límite de peticiones por IP, en memoria, sobre toda la superficie pública.

Se aplica a `/api/v1/*` y a `/mcp`. No a `/health` (lo consulta la plataforma),
ni a `/docs`, `/openapi.json` o `/`: no sirven datos.

**En memoria, y por eso exige UN worker.** Los contadores viven en el proceso:
con `WEB_CONCURRENCY=N` cada worker lleva los suyos y el límite real pasa a ser
N veces el anunciado — sin error, sin aviso del propio límite. La API corre un
solo worker por decisión medida (ver `backend/Dockerfile`), y Redis se fue con
Celery en el paso 5 del pivote público (`docs/PIVOTE_PUBLICO_2026-10.md`, D11).
`avisos_de_configuracion` lo dice al arrancar si alguien sube los workers.

Ventana fija de un minuto. Al cambiar de minuto se tira el diccionario entero:
todo lo que había pertenece a la ventana anterior, así que la memoria la acota
el número de IP distintas EN UN MINUTO, no el histórico. Y aun así hay techo
(`MAX_CLAVES`): pasado, una IP nueva entra sin contarse en lo que queda de
minuto. Fallar abierto con las nuevas es mejor que desalojar a las que ya se
cuentan — que son, por definición, las que más piden.

Modelo de confianza: de dónde sale la IP
-----------------------------------------
`request.client.host` es quien abrió la conexión. Detrás del borde de Railway
eso es el balanceador, y limitar por él metería a todo internet en un solo cubo.
Hay tres casos, en este orden:

1. **El servidor de Next** (spec §7.4). Manda `X-Tordo-Proxy` con el secreto
   compartido (`PROXY_SECRETO`) y, si la petición es de un visitante, su IP en
   `X-Tordo-Visitante`. Con el secreto válido —comparado en tiempo constante—
   se cree esa cabecera: cada visitante tiene su cubo, y el sitio no es uno
   solo. Sin `X-Tordo-Visitante` es un renderizado del servidor (SSR/ISR) y va
   **exento**: si no, todas las páginas saldrían de las IP compartidas de Vercel
   y el límite estrangularía al propio sitio.

   Es una cabecera propia y no `X-Forwarded-For` porque **el borde de Railway
   reescribe `X-Forwarded-For`**: lo que mandara el proxy no llegaría. Medido
   por la comunidad de Railway (2026): un valor inventado por el cliente no
   aparece en ninguna parte de la cadena que recibe la aplicación.

2. **Un cliente directo** (integrador, modelo vía MCP) detrás de Railway. Con
   `CONFIAR_X_FORWARDED_FOR=true` se toma la PRIMERA entrada de
   `X-Forwarded-For`, que es la que pone el borde. Sólo es seguro porque el
   borde descarta la del cliente; por eso es una opción y viene apagada: en
   cualquier otro despliegue esa entrada la escribe quien llama.

3. **Lo demás**: la dirección de la conexión.

Sin `PROXY_SECRETO` no se exime nada ni se cree `X-Tordo-Visitante`: falla
cerrado para la confianza y abierto para la disponibilidad (nadie se queda sin
servicio, pero el sitio entero comparte el cubo del servidor de Next).

IPv6 se agrupa por /64: es lo que recibe un solo cliente, y contarlo por
dirección dejaría a cualquiera rotar entre 2⁶⁴ cubos.
"""

from __future__ import annotations

import asyncio
import hmac
import ipaddress
import json
import logging
import math
import time
from collections.abc import Callable
from dataclasses import dataclass

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)

#: Cabecera con el secreto compartido entre el servidor de Next y la API.
CABECERA_SECRETO = "x-tordo-proxy"
#: Cabecera con la IP del visitante, puesta por el servidor de Next.
CABECERA_VISITANTE = "x-tordo-visitante"

#: Techo de IP distintas que se cuentan dentro de un mismo minuto. Cada entrada
#: son ~150 bytes (clave + entero en un dict): 50.000 son ~8 MB.
MAX_CLAVES = 50_000

#: Un secreto más corto que esto se acepta, pero se avisa al arrancar.
LARGO_MINIMO_SECRETO = 16


@dataclass(frozen=True)
class Decision:
    permitido: bool
    limite: int
    restantes: int
    reinicio_en: int  # segundos hasta que empieza la ventana siguiente


class LimitadorEnMemoria:
    """Contador de ventana fija por clave. Sin hilos: lo usa un solo bucle asyncio."""

    def __init__(
        self,
        limite: int,
        *,
        ventana_s: int = 60,
        max_claves: int = MAX_CLAVES,
        reloj: Callable[[], float] = time.time,
    ):
        self.limite = limite
        self.ventana_s = ventana_s
        self.max_claves = max_claves
        self._reloj = reloj
        self._ventana: int | None = None
        self._cuentas: dict[str, int] = {}
        self._avisado_lleno = False

    def __len__(self) -> int:
        return len(self._cuentas)

    def reiniciar(self) -> None:
        self._ventana = None
        self._cuentas.clear()
        self._avisado_lleno = False

    def consumir(self, clave: str) -> Decision:
        ahora = self._reloj()
        ventana = int(ahora // self.ventana_s)
        if ventana != self._ventana:
            # Todo lo contado pertenece a la ventana anterior: fuera entero.
            self._ventana = ventana
            self._cuentas.clear()
            self._avisado_lleno = False
        reinicio_en = max(1, math.ceil((ventana + 1) * self.ventana_s - ahora))

        cuenta = self._cuentas.get(clave)
        if cuenta is None and len(self._cuentas) >= self.max_claves:
            if not self._avisado_lleno:
                logger.warning(
                    "límite por IP: %d IP distintas en un minuto; las nuevas pasan sin contarse",
                    self.max_claves,
                )
                self._avisado_lleno = True
            return Decision(True, self.limite, self.limite, reinicio_en)

        cuenta = (cuenta or 0) + 1
        self._cuentas[clave] = cuenta
        return Decision(
            permitido=cuenta <= self.limite,
            limite=self.limite,
            restantes=max(0, self.limite - cuenta),
            reinicio_en=reinicio_en,
        )


# ── Identidad ────────────────────────────────────────────────────────────────


def _clave_de_ip(texto: str | None) -> str | None:
    """La IP normalizada como clave de cubo, o `None` si no es una IP."""
    if not texto:
        return None
    try:
        ip = ipaddress.ip_address(texto.strip())
    except ValueError:
        return None
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            return str(ip.ipv4_mapped)
        return str(ipaddress.IPv6Network(f"{ip}/64", strict=False))
    return str(ip)


def secreto_valido(presentado: str | None, secreto: str | None) -> bool:
    if not secreto or not presentado:
        return False
    return hmac.compare_digest(presentado.encode(), secreto.encode())


#: Lo que devuelve `identificar` para una petición exenta.
EXENTA = None

#: Cuántas peticiones exentas (renderizados del servidor de Next) se atienden a
#: la vez; las demás esperan turno. Una página ISR se genera en el primer pedido
#: con el slug que trae la URL, así que quien pida mil slugs distintos dispara mil
#: renderizados que el límite no cuenta. Se encolan, y la API no tiene más de
#: estas abiertas que las que caben en 512 MB. La portada sola pide cinco a la
#: vez, así que el tope deja sitio para ella y algo más.
MAX_EXENTAS_A_LA_VEZ = 8

#: Cuánto espera turno una exenta antes de rendirse con un 503. Sin tope, una
#: tanda de rastreadores tras la revalidación semanal dejaba la fila creciendo, y
#: la portada (que corta a los 8 s) se cacheaba media hora sin sus bloques. Un 503
#: no se cachea: la página se rehace en el pedido siguiente.
ESPERA_MAXIMA_EXENTA_S = 5.0


def identificar(
    headers: Headers,
    peer: str | None,
    *,
    secreto: str | None,
    confiar_xff: bool,
) -> str | None:
    """La clave del cubo de esta petición, o `EXENTA`. Ver el docstring del módulo."""
    if secreto_valido(headers.get(CABECERA_SECRETO), secreto):
        visitante = headers.get(CABECERA_VISITANTE)
        if not visitante:
            return EXENTA  # renderizado del servidor de Next
        clave = _clave_de_ip(visitante)
        if clave:
            return clave
        # Una IP ilegible desde nuestro propio proxy es un fallo suyo: no se
        # exime por eso. Cae a las reglas generales.
        logger.warning("límite por IP: %s ilegible desde el proxy", CABECERA_VISITANTE)

    if confiar_xff:
        primera = (headers.get("x-forwarded-for") or "").split(",")[0]
        clave = _clave_de_ip(primera)
        if clave:
            return clave

    return _clave_de_ip(peer) or (peer or "desconocido")


def aplica(ruta: str, prefijo_api: str) -> bool:
    """¿Cuenta esta ruta? `/api/v1/*` y `/mcp`; nada más."""
    return (
        ruta == prefijo_api
        or ruta.startswith(prefijo_api + "/")
        or ruta == "/mcp"
        or ruta.startswith("/mcp/")
    )


# ── Middleware ───────────────────────────────────────────────────────────────


def _cabeceras(decision: Decision) -> list[tuple[bytes, bytes]]:
    """`X-RateLimit-*` también al dejar pasar: enterarse por el 429 es tarde."""
    return [
        (b"x-ratelimit-limit", str(decision.limite).encode()),
        (b"x-ratelimit-remaining", str(decision.restantes).encode()),
        (b"x-ratelimit-reset", str(decision.reinicio_en).encode()),
    ]


async def _responder_ocupado(send: Send) -> None:
    """503 con `Retry-After`: la fila de renderizados exentos está llena."""
    cuerpo = json.dumps(
        {"detail": "El servidor está ocupado. Intenta de nuevo en unos segundos."}
    ).encode()
    await send(
        {
            "type": "http.response.start",
            "status": 503,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(cuerpo)).encode()),
                (b"retry-after", b"5"),
            ],
        }
    )
    await send({"type": "http.response.body", "body": cuerpo})


class LimitePorIPMiddleware:
    """Middleware ASGI puro: no envuelve el cuerpo, así que no rompe el
    streaming del MCP."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        limitador: LimitadorEnMemoria,
        prefijo_api: str,
        secreto: str | None,
        confiar_xff: bool,
    ):
        self.app = app
        self.limitador = limitador
        self.prefijo_api = prefijo_api
        self.secreto = secreto or None
        self.confiar_xff = confiar_xff
        self.exentas = asyncio.Semaphore(MAX_EXENTAS_A_LA_VEZ)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not aplica(scope["path"], self.prefijo_api):
            await self.app(scope, receive, send)
            return

        cliente = scope.get("client")
        clave = identificar(
            Headers(scope=scope),
            cliente[0] if cliente else None,
            secreto=self.secreto,
            confiar_xff=self.confiar_xff,
        )
        if clave is EXENTA:
            try:
                await asyncio.wait_for(self.exentas.acquire(), ESPERA_MAXIMA_EXENTA_S)
            except TimeoutError:
                await _responder_ocupado(send)
                return
            try:
                await self.app(scope, receive, send)
            finally:
                self.exentas.release()
            return

        decision = self.limitador.consumir(clave)
        extra = _cabeceras(decision)

        if not decision.permitido:
            cuerpo = json.dumps(
                {"detail": "Demasiadas solicitudes. Intenta de nuevo en un minuto."}
            ).encode()
            await send(
                {
                    "type": "http.response.start",
                    "status": 429,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(cuerpo)).encode()),
                        (b"retry-after", str(decision.reinicio_en).encode()),
                        *extra,
                    ],
                }
            )
            await send({"type": "http.response.body", "body": cuerpo})
            return

        async def enviar(mensaje: Message) -> None:
            if mensaje["type"] == "http.response.start":
                cabeceras = MutableHeaders(scope=mensaje)
                for nombre, valor in extra:
                    cabeceras.append(nombre.decode(), valor.decode())
            await send(mensaje)

        await self.app(scope, receive, enviar)


# ── Arranque ─────────────────────────────────────────────────────────────────


def avisos_de_configuracion(
    *,
    entorno: str,
    secreto: str | None,
    confiar_xff: bool,
    workers: str | None,
) -> list[str]:
    """Lo que conviene avisar al arrancar. Nada de esto impide arrancar."""
    avisos = []
    produccion = entorno == "production"
    if not secreto:
        if produccion:
            avisos.append(
                "PROXY_SECRETO vacío: el servidor de Next no se exime del límite por IP "
                "y todo el sitio comparte su cubo."
            )
    elif len(secreto) < LARGO_MINIMO_SECRETO:
        avisos.append(
            f"PROXY_SECRETO tiene menos de {LARGO_MINIMO_SECRETO} caracteres: "
            "genera uno con `openssl rand -hex 32`."
        )
    if produccion and not confiar_xff:
        avisos.append(
            "CONFIAR_X_FORWARDED_FOR=false en producción: detrás de Railway el límite "
            "por IP cuenta al balanceador, no al cliente."
        )
    try:
        n_workers = int(workers or 1)
    except ValueError:
        n_workers = 1
    if n_workers > 1:
        avisos.append(
            f"WEB_CONCURRENCY={n_workers}: el límite por IP vive en memoria y cada worker "
            f"cuenta aparte; el límite real es {n_workers}× el anunciado."
        )
    return avisos
