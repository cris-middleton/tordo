"""Lo que toda petición pasa antes de llegar a una ruta.

Tres guardas pequeñas, en un middleware ASGI puro (no envuelve la respuesta, así
que no rompe el *streaming* del MCP):

- **Un cuerpo acotado.** La API REST sólo responde a GET; lo único que recibe un
  cuerpo es el MCP, y su SDK lo lee entero en memoria antes de mirarlo. El límite
  por IP cuenta peticiones, no bytes: dos POST de unos cientos de megabytes
  bastaban para tumbar los 512 MB de la API. Se corta por `Content-Length` y,
  si no viene, contando lo que llega.
- **Ningún NUL.** Postgres no admite el carácter 0 en un texto: `?search=a%00b`
  llegaba a asyncpg o psycopg2, que lo rechazan con una excepción, y el
  manejador genérico lo convertía en un 500 registrado como error del servidor.
  Es un parámetro inválido: 422.
- **Cabeceras de endurecimiento** en toda respuesta: `nosniff` (un JSON con texto
  de un tercero no se interpreta como HTML), sin `Referer` hacia fuera y sin
  enmarcar (`/docs` es HTML).
"""

from __future__ import annotations

import json

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

#: Bytes que se aceptan en un cuerpo. Un mensaje JSON-RPC del MCP mide unos
#: cientos de bytes; 64 KB deja margen de sobra sin dejar entrar un archivo.
MAX_CUERPO = 64 * 1024

CABECERAS_SEGURIDAD = [
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
    (b"x-frame-options", b"DENY"),
]


async def _responder(send: Send, estado: int, detalle: str) -> None:
    cuerpo = json.dumps({"detail": detalle}, ensure_ascii=False).encode()
    await send(
        {
            "type": "http.response.start",
            "status": estado,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(cuerpo)).encode()),
                *CABECERAS_SEGURIDAD,
            ],
        }
    )
    await send({"type": "http.response.body", "body": cuerpo})


def lleva_nul(scope: Scope) -> bool:
    """¿Trae la ruta o la query un carácter 0, escrito tal cual o como `%00`?"""
    crudo = scope.get("raw_path") or scope.get("path", "").encode()
    query = scope.get("query_string", b"")
    return b"\x00" in crudo or b"%00" in crudo or b"\x00" in query or b"%00" in query


class EndurecimientoMiddleware:
    def __init__(self, app: ASGIApp, *, max_cuerpo: int = MAX_CUERPO):
        self.app = app
        self.max_cuerpo = max_cuerpo

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        if lleva_nul(scope):
            await _responder(send, 422, "La petición lleva un carácter nulo (%00).")
            return

        cabeceras = dict(scope.get("headers") or [])
        declarado = cabeceras.get(b"content-length")
        if declarado is not None:
            try:
                largo = int(declarado)
            except ValueError:
                largo = self.max_cuerpo + 1
            if largo > self.max_cuerpo:
                await _responder(send, 413, "El cuerpo de la petición es demasiado grande.")
                return

        if declarado is None and scope.get("method") not in ("GET", "HEAD", "OPTIONS"):
            # Sin largo declarado (por trozos) se lee aquí, contando, y se le
            # entrega a la ruta ya entero. Cortar a mitad de la lectura de la
            # ruta no sirve: su propio manejador de errores respondería 500.
            trozos: list[bytes] = []
            leidos = 0
            while True:
                mensaje = await receive()
                if mensaje["type"] != "http.request":
                    break
                trozos.append(mensaje.get("body", b""))
                leidos += len(trozos[-1])
                if leidos > self.max_cuerpo:
                    await _responder(send, 413, "El cuerpo de la petición es demasiado grande.")
                    return
                if not mensaje.get("more_body", False):
                    break
            entregado = False

            async def receive_releido() -> Message:
                nonlocal entregado
                if not entregado:
                    entregado = True
                    return {"type": "http.request", "body": b"".join(trozos), "more_body": False}
                return await receive()

            receive = receive_releido

        async def enviar(mensaje: Message) -> None:
            if mensaje["type"] == "http.response.start":
                MutableHeaders(scope=mensaje).update(
                    {k.decode(): v.decode() for k, v in CABECERAS_SEGURIDAD}
                )
            await send(mensaje)

        await self.app(scope, receive, enviar)
