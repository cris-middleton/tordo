"""Ninguna redirección de la API baja a http:// (spec del rediseño §8.4).

Detrás de Railway el TLS termina en el borde y uvicorn corre con
`--no-proxy-headers`: la app cree servir `http`, y el `Location` que construye
`redirect_slashes` lo decía. `https://api.tordo.cl/mcp` mandaba a
`http://api.tordo.cl/mcp/`; el cliente repetía el POST en claro, el borde lo
devolvía con un 301 a https y el POST llegaba convertido en GET. Lo mismo en
`/health` y en las 29 redirecciones por barra final.

El arreglo no confía en ninguna cabecera de reenvío: el `Location` propio se
devuelve RELATIVO y el cliente lo resuelve contra la URL que pidió.
"""

from __future__ import annotations

import re

import httpx
import pytest
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.redirecciones import (
    LocationRelativaMiddleware,
    MCPSinBarraMiddleware,
    location_relativa,
)
from app.core.versionado import PREFIJO_API
from app.main import app, limitador_ip
from tests.borde_tls import borde_tls
from tests.rutas import MINIMO_PLAUSIBLE, iter_rutas


def _cliente(**kwargs) -> httpx.AsyncClient:
    transporte = httpx.ASGITransport(app=borde_tls(app), raise_app_exceptions=False)
    return httpx.AsyncClient(transport=transporte, base_url="https://api.tordo.cl", **kwargs)


@pytest.mark.parametrize(
    ("ruta", "destino"),
    [
        ("/health", "/health/"),
        # `/tenders` ya no redirige: tiene su ruta sin barra (`test_tenders_sin_barra.py`).
        (f"{PREFIJO_API}/bi/rubros/", f"{PREFIJO_API}/bi/rubros"),
        (
            f"{PREFIJO_API}/bi/rubros/?limit=1&offset=20",
            f"{PREFIJO_API}/bi/rubros?limit=1&offset=20",
        ),
    ],
)
async def test_la_redireccion_por_barra_final_es_relativa(ruta, destino):
    async with _cliente() as c:
        r = await c.get(ruta)

    assert r.status_code == 307
    assert r.headers["location"] == destino


async def test_seguir_la_redireccion_no_baja_a_http():
    pedidas: list[str] = []

    async def anotar(peticion: httpx.Request) -> None:
        pedidas.append(str(peticion.url))

    async with _cliente(follow_redirects=True, event_hooks={"request": [anotar]}) as c:
        r = await c.get("/health")

    assert r.status_code == 200
    assert pedidas == ["https://api.tordo.cl/health", "https://api.tordo.cl/health/"]


def _rutas_get() -> list[str]:
    rutas = {
        re.sub(r"\{[^}]+\}", "x", prefijo + ruta.path)
        for prefijo, ruta in iter_rutas(app)
        if "GET" in ruta.methods
    }
    rutas.discard("/")
    return sorted(rutas)


async def test_ninguna_redireccion_por_barra_lleva_esquema():
    redirecciones: dict[str, str] = {}
    async with _cliente() as c:
        for ruta in _rutas_get():
            otra = ruta[:-1] if ruta.endswith("/") else f"{ruta}/"
            r = await c.get(otra)
            if 300 <= r.status_code < 400:
                redirecciones[otra] = r.headers.get("location", "")

    # Guarda: medido el 2026-10-14, las 29 rutas GET (todas salvo `/`) redirigen
    # al cambiarles la barra. Con cero, este test comprobaría el vacío.
    assert len(redirecciones) >= MINIMO_PLAUSIBLE, redirecciones
    absolutas = {
        ruta: destino for ruta, destino in redirecciones.items() if not destino.startswith("/")
    }
    assert absolutas == {}


def test_un_location_de_otro_origen_no_se_toca():
    ajeno = "https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx"
    assert location_relativa(ajeno, "api.tordo.cl") == ajeno
    assert location_relativa("/ya/relativa", "api.tordo.cl") == "/ya/relativa"


def test_location_relativa_conserva_consulta_y_fragmento():
    assert location_relativa("http://api.tordo.cl/a/?q=1&r=2#f", "api.tordo.cl") == "/a/?q=1&r=2#f"
    assert location_relativa("http://api.tordo.cl", "api.tordo.cl") == "/"


def test_el_host_se_compara_sin_mayusculas_y_con_puerto():
    assert location_relativa("http://API.tordo.cl/x/", "api.tordo.cl") == "/x/"
    assert location_relativa("http://localhost:8000/x/", "localhost:8000") == "/x/"
    assert (
        location_relativa("http://localhost:9000/x/", "localhost:8000")
        == "http://localhost:9000/x/"
    )


@pytest.mark.parametrize("ruta", ["//evil.com/", "/\\evil.com/"])
def test_un_location_no_se_vuelve_relativo_de_esquema(ruta):
    """`http://host//evil.com/` → `//evil.com/` lo resolvería un cliente contra OTRO host.

    Sin quitar el esquema sigue siendo el mismo host (peor caso: el http de antes).
    """
    absoluto = f"http://localhost{ruta}"
    assert location_relativa(absoluto, "localhost") == absoluto


def test_los_middlewares_son_asgi_puros():
    """`BaseHTTPMiddleware` envuelve el cuerpo y rompe el streaming del MCP."""
    assert not issubclass(LocationRelativaMiddleware, BaseHTTPMiddleware)


@pytest.mark.parametrize("metodo", ["GET", "POST", "DELETE"])
async def test_mcp_sin_barra_no_redirige(metodo):
    """Un 307 en cada mensaje JSON-RPC es una ida y vuelta más, dos unidades del
    límite por IP, y un POST que algunos clientes no repiten."""
    async with _cliente() as c:
        r = await c.request(metodo, "/mcp")

    assert not 300 <= r.status_code < 400, r.headers.get("location")


async def test_mcp_sin_barra_sigue_contando_en_el_limite():
    # Se mira el contador y no las cabeceras `X-RateLimit-*`: sin el ciclo de
    # vida del MCP la petición revienta dentro del montaje y el 500 lo escribe
    # `ServerErrorMiddleware`, por fuera del limitador. El autouse
    # `_limite_por_ip_limpio` lo deja a cero antes de cada test.
    async with _cliente() as c:
        await c.post("/mcp", json={})

    assert len(limitador_ip) == 1


async def test_solo_se_reescribe_mcp_exacto():
    async with _cliente() as c:
        r = await c.get("/mcpx")

    assert r.status_code == 404


def test_el_alias_de_mcp_tambien_es_asgi_puro():
    assert not issubclass(MCPSinBarraMiddleware, BaseHTTPMiddleware)
