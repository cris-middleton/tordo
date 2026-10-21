"""Las guardas que toda petición pasa antes de llegar a una ruta.

Cada una cierra un camino concreto para tumbar o ensuciar una API de 512 MB y un
solo worker: un cuerpo de cientos de megabytes al MCP, un `%00` que acababa en
500, un `X-Request-ID` sin cota que se repetía en cada log, y muchos renderizados
exentos del límite a la vez.
"""

from __future__ import annotations

import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient
from sentry_sdk.scrubber import DEFAULT_DENYLIST, EventScrubber
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from app.core import limite_ip
from app.core.endurecimiento import MAX_CUERPO, EndurecimientoMiddleware
from app.core.limite_ip import (
    CABECERA_SECRETO,
    CABECERA_VISITANTE,
    LimitadorEnMemoria,
    LimitePorIPMiddleware,
)
from app.core.versionado import PREFIJO_API
from app.main import app as app_real
from app.observability.sentry import CABECERAS_PRIVADAS

SECRETO = "s3creto-de-prueba-suficientemente-largo"


async def _eco(request: Request):
    cuerpo = await request.body()
    return JSONResponse({"largo": len(cuerpo)})


def _app():
    interna = Starlette(routes=[Route("/mcp/", _eco, methods=["GET", "POST"])])
    return EndurecimientoMiddleware(interna)


def _cliente(app) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://api")


# ── Cuerpo acotado ───────────────────────────────────────────────────────────


async def test_un_cuerpo_normal_pasa():
    async with _cliente(_app()) as c:
        r = await c.post("/mcp/", content=b"x" * 500)
    assert r.status_code == 200
    assert r.json() == {"largo": 500}


async def test_un_cuerpo_grande_se_corta_por_content_length():
    async with _cliente(_app()) as c:
        r = await c.post("/mcp/", content=b"x" * (MAX_CUERPO + 1))
    assert r.status_code == 413


async def test_un_cuerpo_grande_sin_content_length_se_corta_al_contar():
    """Por trozos (`Transfer-Encoding: chunked`) no hay largo declarado."""

    async def trozos():
        for _ in range(10):
            yield b"x" * (MAX_CUERPO // 4)

    async with _cliente(_app()) as c:
        r = await c.post("/mcp/", content=trozos())
    assert r.status_code == 413


# ── NUL ──────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "ruta",
    [
        f"{PREFIJO_API}/tenders/?search=a%00b",
        f"{PREFIJO_API}/tenders/codigo/x%00",
        f"{PREFIJO_API}/compra-agil/destacadas?codigo_organismo=%00",
    ],
)
def test_un_nul_es_422_y_no_500(ruta):
    """Postgres no admite el carácter 0: llegaba al driver y salía 500."""
    r = TestClient(app_real, raise_server_exceptions=False).get(ruta)
    assert r.status_code == 422


# ── Cabeceras ────────────────────────────────────────────────────────────────


def test_toda_respuesta_lleva_las_cabeceras_de_endurecimiento():
    r = TestClient(app_real).get("/health/")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert r.headers["x-frame-options"] == "DENY"


# ── X-Request-ID ─────────────────────────────────────────────────────────────


def test_un_request_id_valido_se_respeta_y_uno_raro_se_reemplaza():
    # Sin `with`: el ciclo de vida del MCP sólo puede arrancar una vez por
    # proceso, y lo arranca `tests/test_mcp.py`.
    c = TestClient(app_real)
    bueno = c.get("/health/", headers={"X-Request-ID": "abc-123"})
    largo = c.get("/health/", headers={"X-Request-ID": "a" * 500})
    raro = c.get("/health/", headers={"X-Request-ID": "<script>"})
    assert bueno.headers["x-request-id"] == "abc-123"
    assert len(largo.headers["x-request-id"]) == 32
    assert raro.headers["x-request-id"] != "<script>"


# ── Renderizados exentos, en fila ────────────────────────────────────────────


async def test_los_renderizados_exentos_no_pasan_de_cuatro_a_la_vez():
    """Una ficha ISR se genera con el slug que trae la URL y va exenta del límite:
    mil slugs inventados eran mil consultas a la vez. Se encolan, no se rechazan."""
    activas = 0
    maximo = 0

    async def lenta(request: Request):
        nonlocal activas, maximo
        activas += 1
        maximo = max(maximo, activas)
        await asyncio.sleep(0.01)
        activas -= 1
        return JSONResponse({"ok": True})

    interna = Starlette(routes=[Route(f"{PREFIJO_API}/cosa", lenta)])
    app = LimitePorIPMiddleware(
        interna,
        limitador=LimitadorEnMemoria(1000),
        prefijo_api=PREFIJO_API,
        secreto=SECRETO,
        confiar_xff=False,
    )
    async with _cliente(app) as c:
        respuestas = await asyncio.gather(
            *(c.get(f"{PREFIJO_API}/cosa", headers={CABECERA_SECRETO: SECRETO}) for _ in range(20))
        )
    assert {r.status_code for r in respuestas} == {200}
    assert maximo == limite_ip.MAX_EXENTAS_A_LA_VEZ


# ── Sentry ───────────────────────────────────────────────────────────────────


def test_sentry_no_recibe_el_secreto_del_proxy_ni_la_ip_del_visitante():
    """`send_default_pii=False` sólo filtra la lista propia de Sentry: el secreto
    y la IP viajaban en cada error. Se prueba con el mismo depurador que se
    configura en `setup_sentry`."""
    evento = {
        "request": {
            "headers": {
                CABECERA_SECRETO.title(): SECRETO,
                CABECERA_VISITANTE.title(): "200.1.2.3",
                "Accept": "application/json",
            }
        }
    }
    EventScrubber(denylist=DEFAULT_DENYLIST + CABECERAS_PRIVADAS).scrub_event(evento)
    cabeceras = evento["request"]["headers"]
    assert SECRETO not in str(cabeceras)
    assert "200.1.2.3" not in str(cabeceras)
    assert cabeceras["Accept"] == "application/json"
