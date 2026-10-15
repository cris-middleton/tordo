"""La app tal como la ve detrás del borde de Railway.

El cliente habla HTTPS; el borde termina el TLS y reenvía en HTTP con
`X-Forwarded-Proto: https` y su `X-Forwarded-For`. uvicorn corre con
`--no-proxy-headers`, así que la app recibe `scheme=http`. Es la situación en
que `redirect_slashes` escribía `Location: http://…` (spec del rediseño §8.4).
"""

from __future__ import annotations

from starlette.types import ASGIApp, Receive, Scope, Send


def borde_tls(app: ASGIApp) -> ASGIApp:
    async def envoltura(scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            scope = {
                **scope,
                "scheme": "http",
                "headers": [
                    *scope["headers"],
                    (b"x-forwarded-proto", b"https"),
                    (b"x-forwarded-for", b"203.0.113.7"),
                ],
            }
        await app(scope, receive, send)

    return envoltura
