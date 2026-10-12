"""El límite por IP, en memoria, y de dónde saca la IP.

Por qué existe
--------------
El limitador anterior usaba `request.client.host`. Detrás del borde de Railway
eso es el balanceador, y detrás del proxy de Next es el servidor de Next: en los
dos casos, **todo internet en un solo cubo** de 60 peticiones por minuto. Un
test que llama siempre desde la misma IP no lo ve nunca — por eso aquí se llama
desde varias.

Lo que se fija (Foco de revisión nº 1 del plan del pivote):

- dos visitantes distintos detrás del proxy, con el secreto → dos cubos;
- una IP falsificada sin el secreto, o con uno equivocado → no se cree;
- un renderizado del servidor de Next (secreto, sin visitante) → exento;
- el 429 con `Retry-After`, y `X-RateLimit-*` también al dejar pasar;
- la memoria: la ventana nueva tira la anterior, y hay techo de claves.
"""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient
from starlette.applications import Starlette
from starlette.datastructures import Headers
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from app.core.limite_ip import (
    CABECERA_SECRETO,
    CABECERA_VISITANTE,
    EXENTA,
    LimitadorEnMemoria,
    LimitePorIPMiddleware,
    aplica,
    avisos_de_configuracion,
    identificar,
)
from app.core.versionado import PREFIJO_API
from app.main import app as app_real
from app.main import limitador_ip

SECRETO = "s3creto-de-prueba-suficientemente-largo"
BALANCEADOR = "100.64.0.7"  # la IP con que el borde de Railway abre la conexión


class Reloj:
    def __init__(self, t: float = 1_000_020.0):
        self.t = t

    def __call__(self) -> float:
        return self.t


async def _eco(request: Request):
    return JSONResponse({"ok": True})


def _app(limite: int = 3, *, secreto: str | None = SECRETO, confiar_xff: bool = False):
    interna = Starlette(
        routes=[
            Route(f"{PREFIJO_API}/cosa", _eco),
            Route("/mcp/", _eco, methods=["GET", "POST"]),
            Route("/health/", _eco),
        ]
    )
    limitador = LimitadorEnMemoria(limite, reloj=Reloj())
    envuelta = LimitePorIPMiddleware(
        interna,
        limitador=limitador,
        prefijo_api=PREFIJO_API,
        secreto=secreto,
        confiar_xff=confiar_xff,
    )
    return envuelta, limitador


def _cliente(app, peer: str = BALANCEADOR) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, client=(peer, 12345)), base_url="http://api"
    )


async def _pedir(cliente, n: int, ruta: str = f"{PREFIJO_API}/cosa", **cabeceras):
    return [await cliente.get(ruta, headers=cabeceras) for _ in range(n)]


# ── El proxy de Next ─────────────────────────────────────────────────────────


async def test_dos_visitantes_tras_el_proxy_tienen_cubos_distintos():
    app, limitador = _app(limite=2)
    async with _cliente(app) as c:
        a = await _pedir(c, 3, **{CABECERA_SECRETO: SECRETO, CABECERA_VISITANTE: "200.1.1.1"})
        b = await _pedir(c, 2, **{CABECERA_SECRETO: SECRETO, CABECERA_VISITANTE: "200.2.2.2"})

    assert [r.status_code for r in a] == [200, 200, 429]
    # El segundo visitante no paga lo que gastó el primero.
    assert [r.status_code for r in b] == [200, 200]
    assert len(limitador) == 2


@pytest.mark.parametrize("secreto", [None, "otro-secreto-que-no-es-el-bueno"], ids=["sin", "malo"])
async def test_sin_el_secreto_la_ip_del_visitante_no_se_cree(secreto):
    """Quien llama directo no puede repartirse en cubos inventando IP."""
    app, limitador = _app(limite=2)
    cabeceras = {} if secreto is None else {CABECERA_SECRETO: secreto}
    async with _cliente(app, peer="203.0.113.9") as c:
        respuestas = [
            await c.get(
                f"{PREFIJO_API}/cosa",
                headers={
                    **cabeceras,
                    CABECERA_VISITANTE: f"10.0.0.{i}",
                    "X-Forwarded-For": f"10.9.9.{i}",
                },
            )
            for i in range(3)
        ]

    assert [r.status_code for r in respuestas] == [200, 200, 429]
    assert len(limitador) == 1  # un solo cubo: el de la conexión


async def test_el_renderizado_del_servidor_de_next_esta_exento():
    """Sin visitante y con el secreto: es SSR/ISR. Si contara, las IP
    compartidas de Vercel estrangularían al propio sitio."""
    app, limitador = _app(limite=1)
    async with _cliente(app) as c:
        respuestas = await _pedir(c, 5, **{CABECERA_SECRETO: SECRETO})

    assert {r.status_code for r in respuestas} == {200}
    assert "x-ratelimit-limit" not in respuestas[0].headers
    assert len(limitador) == 0


async def test_sin_secreto_configurado_nadie_queda_exento():
    """Falla cerrada para la confianza: un secreto vacío no se iguala con nada."""
    app, _ = _app(limite=1, secreto=None)
    async with _cliente(app) as c:
        respuestas = await _pedir(c, 2, **{CABECERA_SECRETO: ""})
    assert [r.status_code for r in respuestas] == [200, 429]


# ── Clientes directos detrás de Railway ─────────────────────────────────────


async def test_detras_de_railway_cuenta_la_primera_ip_de_x_forwarded_for():
    """Con CONFIAR_X_FORWARDED_FOR, dos clientes directos tras el mismo
    balanceador no comparten cubo."""
    app, limitador = _app(limite=1, confiar_xff=True)
    async with _cliente(app) as c:
        a = await _pedir(c, 2, **{"X-Forwarded-For": "190.5.5.5, 151.101.1.1"})
        b = await _pedir(c, 1, **{"X-Forwarded-For": "190.6.6.6, 151.101.1.1"})
    assert [r.status_code for r in a] == [200, 429]
    assert [r.status_code for r in b] == [200]
    assert len(limitador) == 2


async def test_sin_confiar_x_forwarded_for_se_ignora():
    app, limitador = _app(limite=1, confiar_xff=False)
    async with _cliente(app) as c:
        a = await _pedir(c, 1, **{"X-Forwarded-For": "190.5.5.5"})
        b = await _pedir(c, 1, **{"X-Forwarded-For": "190.6.6.6"})
    assert a[0].status_code == 200
    assert b[0].status_code == 429
    assert len(limitador) == 1


def test_ipv6_se_agrupa_por_64():
    """Un cliente IPv6 recibe un /64 entero: por dirección rotaría sin fin."""
    claves = {
        identificar(Headers(), ip, secreto=None, confiar_xff=False)
        for ip in ("2001:db8:1:2::1", "2001:db8:1:2:ffff::9")
    }
    assert claves == {"2001:db8:1:2::/64"}
    assert identificar(Headers(), "::ffff:200.1.1.1", secreto=None, confiar_xff=False) == (
        "200.1.1.1"
    )


def test_visitante_ilegible_desde_el_proxy_no_exime():
    clave = identificar(
        Headers(headers={CABECERA_SECRETO: SECRETO, CABECERA_VISITANTE: "no-es-una-ip"}),
        BALANCEADOR,
        secreto=SECRETO,
        confiar_xff=False,
    )
    assert clave is not EXENTA
    assert clave == BALANCEADOR


# ── Respuestas ───────────────────────────────────────────────────────────────


async def test_429_con_retry_after_y_cabeceras_tambien_al_dejar_pasar():
    app, _ = _app(limite=2)
    async with _cliente(app) as c:
        primera, segunda, tercera = await _pedir(c, 3)

    assert primera.headers["x-ratelimit-limit"] == "2"
    assert primera.headers["x-ratelimit-remaining"] == "1"
    assert segunda.headers["x-ratelimit-remaining"] == "0"
    assert int(primera.headers["x-ratelimit-reset"]) > 0

    assert tercera.status_code == 429
    assert tercera.json()["detail"]
    assert 1 <= int(tercera.headers["retry-after"]) <= 60
    assert tercera.headers["x-ratelimit-remaining"] == "0"


async def test_el_mcp_cuenta_y_health_no():
    app, _ = _app(limite=1)
    async with _cliente(app) as c:
        mcp = await _pedir(c, 2, ruta="/mcp/")
        health = await _pedir(c, 3, ruta="/health/")
    assert [r.status_code for r in mcp] == [200, 429]
    assert {r.status_code for r in health} == {200}
    assert "x-ratelimit-limit" not in health[0].headers


@pytest.mark.parametrize(
    "ruta,cuenta",
    [
        (f"{PREFIJO_API}/tenders/", True),
        (f"{PREFIJO_API}/bi/rubros", True),
        ("/mcp", True),
        ("/mcp/", True),
        ("/health/", False),
        ("/health/ready", False),
        ("/docs", False),
        ("/openapi.json", False),
        ("/", False),
        ("/mcpx", False),
        (f"{PREFIJO_API}x/algo", False),
    ],
)
def test_que_rutas_cuentan(ruta, cuenta):
    assert aplica(ruta, PREFIJO_API) is cuenta


def test_la_app_real_lo_monta_sobre_la_api_y_no_sobre_health():
    """El middleware existe en la app que se despliega, no sólo en este fichero.

    Guarda contra el fallo del limitador anterior: con la ruta escrita a mano,
    versionar la API lo dejó sin coincidir con nada, y no falló nada.
    """
    # Sin `with`: el ciclo de vida arranca el gestor del MCP, que sólo se puede
    # arrancar una vez por proceso y lo necesita `test_mcp.py`.
    c = TestClient(app_real)
    # Una ruta que no existe: el 404 lo da el enrutador, por DENTRO del
    # middleware, y no depende de la base.
    api = c.get(f"{PREFIJO_API}/no-existe")
    health = c.get("/health/")
    assert api.headers.get("x-ratelimit-limit") == str(limitador_ip.limite)
    assert "x-ratelimit-limit" not in health.headers


# ── Memoria ──────────────────────────────────────────────────────────────────


def test_la_ventana_nueva_tira_la_anterior():
    reloj = Reloj(1_000_020.0)
    limitador = LimitadorEnMemoria(1, reloj=reloj)
    for i in range(100):
        limitador.consumir(f"10.0.0.{i}")
    assert len(limitador) == 100
    assert not limitador.consumir("10.0.0.1").permitido

    reloj.t += 60
    assert limitador.consumir("10.0.0.1").permitido
    assert len(limitador) == 1


def test_con_el_techo_lleno_una_ip_nueva_pasa_sin_contarse():
    """Fallar abierto con las nuevas, sin desalojar a las que ya se cuentan."""
    limitador = LimitadorEnMemoria(1, max_claves=3, reloj=Reloj())
    for ip in ("1.1.1.1", "2.2.2.2", "3.3.3.3"):
        limitador.consumir(ip)
    assert limitador.consumir("4.4.4.4").permitido
    assert limitador.consumir("4.4.4.4").permitido
    assert len(limitador) == 3
    # Las ya contadas siguen limitadas.
    assert not limitador.consumir("1.1.1.1").permitido


# ── Arranque ─────────────────────────────────────────────────────────────────


def test_avisa_en_produccion_sin_secreto_ni_x_forwarded_for():
    avisos = avisos_de_configuracion(
        entorno="production", secreto=None, confiar_xff=False, workers=None
    )
    assert any("PROXY_SECRETO" in a for a in avisos)
    assert any("CONFIAR_X_FORWARDED_FOR" in a for a in avisos)


def test_avisa_si_hay_mas_de_un_worker():
    avisos = avisos_de_configuracion(
        entorno="production", secreto=SECRETO, confiar_xff=True, workers="4"
    )
    assert avisos == [next(a for a in avisos if "WEB_CONCURRENCY=4" in a)]


def test_en_desarrollo_sin_secreto_no_avisa():
    assert (
        avisos_de_configuracion(entorno="development", secreto=None, confiar_xff=False, workers="1")
        == []
    )
