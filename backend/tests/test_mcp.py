"""El servidor MCP, ejercitado por HTTP.

**Por HTTP y no llamando a las funciones**, porque los dos fallos que puede tener
esto son de montaje, no de lógica:

- montar una app ASGI dentro de otra **no ejecuta su ciclo de vida**, y sin el
  gestor de sesiones el servidor acepta la conexión y revienta en la primera
  herramienta;
- la protección contra DNS rebinding mira la cabecera `Host` **antes** de que
  la petición llegue a ninguna herramienta, así que sólo se ve por HTTP.

Ninguno de los dos lo detecta un test que importe el módulo y llame a la función.

Lo demás que se fija aquí son las decisiones del ADR 0004 que sobreviven al
pivote público (el MCP es anónimo desde entonces):

- **cuatro herramientas, no veinte** — un modelo encadena unas quince llamadas
  donde una persona hace tres;
- **ninguna pide empresa**: un modelo inventa identificadores en cuanto se lo
  pides, y ya no hay empresa a la que pertenecer;
- **`confianza` y `n` no se filtran**: un modelo que recibe una banda de precio
  sin saber que salió de cuatro observaciones la presentará como un hecho.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import httpx2
import pytest
import pytest_asyncio
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from app.api import limites
from app.main import app
from tests.borde_tls import borde_tls

RUTA = "/mcp/"

CABECERAS_MCP = {
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
}

#: `/abierto#mcp` enumera las herramientas a mano: es una página estática.
ABIERTO_TS = Path(__file__).resolve().parents[2] / "frontend" / "lib" / "abierto.ts"


def _rpc(metodo: str, parametros: dict | None = None, id_: int = 1) -> dict:
    cuerpo = {"jsonrpc": "2.0", "id": id_, "method": metodo}
    if parametros is not None:
        cuerpo["params"] = parametros
    return cuerpo


def _inicializar() -> dict:
    return _rpc(
        "initialize",
        {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "tests", "version": "0"},
        },
    )


def _payload(respuesta) -> dict:
    """La respuesta llega como JSON o como un evento SSE, según negocie el cliente."""
    texto = respuesta.text
    if texto.startswith("event:") or texto.startswith("data:"):
        for linea in texto.splitlines():
            if linea.startswith("data:"):
                return json.loads(linea[5:].strip())
        raise AssertionError(f"SSE sin data: {texto[:200]}")
    return respuesta.json()


# Todo el módulo comparte bucle y servidor: el gestor de sesiones del MCP sólo se
# puede arrancar UNA vez por instancia, así que un ciclo de vida por test no es
# posible. Y no hace falta — ninguna prueba de aquí ensucia el estado de otra.
pytestmark = pytest.mark.asyncio(loop_scope="module")


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def cliente(esquema_migrado):
    """Cliente HTTP contra la app REAL, con su ciclo de vida arrancado.

    **No se inyecta la sesión de test**, y es deliberado: el MCP no pasa por
    `get_db` — abre sus propias sesiones con `AsyncSessionLocal`. Sobrescribir la
    dependencia no le afectaría, y creerlo llevaría a escribir datos en una
    transacción que el servidor nunca vería.

    `LifespanManager` y no el contexto de Starlette a pelo: el gestor de sesiones
    abre un grupo de tareas, y entrarlo y salirlo desde tareas distintas —que es
    lo que hace un fixture alrededor de su `yield`— revienta con «cancel scope in
    a different task».
    """
    from asgi_lifespan import LifespanManager
    from httpx import ASGITransport, AsyncClient

    from app.db import async_engine

    # `dispose(close=False)` abandona las conexiones que otro bucle de eventos
    # dejó en el pozo en vez de intentar cerrarlas —cerrarlas desde el bucle
    # equivocado es justamente lo que revienta—. El MCP abre sus propias
    # sesiones con `AsyncSessionLocal`, así que heredaría esas conexiones.
    await async_engine.dispose(close=False)

    async with (
        LifespanManager(app) as gestionada,
        # `localhost` y no `test`: el `Host` tiene que estar en la lista blanca
        # de `MCP_HOSTS_PERMITIDOS`, o la protección contra DNS rebinding
        # responde 421 a todo.
        AsyncClient(transport=ASGITransport(app=gestionada.app), base_url="http://localhost") as c,
    ):
        yield c


async def _listar_herramientas(cliente) -> dict:
    await cliente.post(RUTA, json=_inicializar(), headers=CABECERAS_MCP)
    r = await cliente.post(RUTA, json=_rpc("tools/list", {}, id_=2), headers=CABECERAS_MCP)
    assert r.status_code == 200, r.text
    return _payload(r)


async def _llamar(cliente, herramienta: str, argumentos: dict) -> dict:
    await cliente.post(RUTA, json=_inicializar(), headers=CABECERAS_MCP)
    r = await cliente.post(
        RUTA,
        json=_rpc("tools/call", {"name": herramienta, "arguments": argumentos}, id_=3),
        headers=CABECERAS_MCP,
    )
    assert r.status_code == 200, r.text
    return _payload(r)


def _texto(resultado: dict) -> str:
    contenido = resultado.get("result", {}).get("content") or []
    return " ".join(c.get("text", "") for c in contenido)


# ── Montaje ──────────────────────────────────────────────────────────────────


async def test_el_servidor_responde_al_handshake(cliente):
    """Si el ciclo de vida no arrancó, esto falla — y es exactamente el fallo que
    montar una app dentro de otra provoca en silencio."""
    r = await cliente.post(RUTA, json=_inicializar(), headers=CABECERAS_MCP)

    assert r.status_code == 200, r.text
    assert "serverInfo" in _payload(r)["result"]


async def test_expone_cuatro_herramientas_y_son_de_grano_grueso(cliente):
    """Veinte herramientas —una por endpoint de BI— multiplicarían la carga de
    cada conversación. Si alguien añade una quinta, que sea decidiéndolo."""
    herramientas = {h["name"] for h in (await _listar_herramientas(cliente))["result"]["tools"]}

    assert herramientas == {
        "panel_de_licitacion",
        "precio_de_producto",
        "perfil_de_comprador",
        "buscar_productos",
    }


async def test_todo_argumento_de_texto_tiene_cota(cliente):
    """`tests/test_parametros_acotados.py` recorre el OpenAPI, que no ve el MCP:
    `buscar_productos(texto)` aceptaba megabytes. Las cotas son las de la API."""
    for herramienta in (await _listar_herramientas(cliente))["result"]["tools"]:
        for nombre, esquema in herramienta["inputSchema"]["properties"].items():
            variantes = esquema.get("anyOf", [esquema])
            for variante in variantes:
                if variante.get("type") == "string":
                    assert variante.get("maxLength") in (limites.CODIGO, limites.TEXTO), (
                        f"{herramienta['name']}.{nombre} no tiene maxLength"
                    )


async def test_la_pagina_abierto_lista_las_mismas_herramientas(cliente):
    """Renombrar una herramienta aquí sin tocar `/abierto` publicaría un nombre
    que el servidor ya no tiene: un modelo lo pediría y recibiría un error."""
    texto = ABIERTO_TS.read_text(encoding="utf-8")
    bloque = texto.split("export const HERRAMIENTAS_MCP", 1)[1].split("] as const", 1)[0]
    en_la_pagina = re.findall(r"nombre: '([a-z_]+)'", bloque)
    herramientas = [h["name"] for h in (await _listar_herramientas(cliente))["result"]["tools"]]

    assert sorted(en_la_pagina) == sorted(herramientas)


async def test_ninguna_herramienta_pide_empresa(cliente):
    """No hay empresas desde el pivote público. Si un argumento la pidiera, un
    modelo lo rellenaría con lo que le pareciera."""
    for herramienta in (await _listar_herramientas(cliente))["result"]["tools"]:
        propiedades = set((herramienta.get("inputSchema") or {}).get("properties") or {})
        # La guarda importa: si el esquema dejara de llegar —o cambiara de
        # nombre—, el conjunto quedaría vacío y este test pasaría comprobando la
        # nada, que es justo lo que no se quiere de una prueba de aislamiento.
        assert propiedades, f"{herramienta['name']} llegó sin esquema de entrada"
        assert not {"empresa_id", "empresa", "rut_empresa"} & propiedades, herramienta["name"]


async def test_un_cliente_mcp_real_conecta_sin_barra_detras_del_tls(cliente):
    """El cliente oficial del SDK, configurado con la URL sin barra —la que
    escribe la gente— detrás de un borde TLS como el de Railway.

    `follow_redirects=True` como lo trae el SDK: en proceso el `http://` del 307
    no tiene consecuencias, así que lo que se comprueba son las URL pedidas.
    `cliente` está para arrancar el ciclo de vida del MCP (una vez por módulo).
    """
    pedidas: list[str] = []

    async def anotar(peticion) -> None:
        pedidas.append(str(peticion.url))

    transporte = httpx2.ASGITransport(app=borde_tls(app))
    async with (
        httpx2.AsyncClient(
            transport=transporte, follow_redirects=True, event_hooks={"request": [anotar]}
        ) as http,
        streamable_http_client("https://localhost/mcp", http_client=http) as (lectura, escritura),
        ClientSession(lectura, escritura) as sesion,
    ):
        await sesion.initialize()
        herramientas = await sesion.list_tools()

    assert len(herramientas.tools) == 4
    assert pedidas, "el cliente no pidió nada"
    assert set(pedidas) == {"https://localhost/mcp"}, pedidas


# ── DNS rebinding ────────────────────────────────────────────────────────────


async def test_un_host_fuera_de_la_lista_blanca_recibe_421(cliente):
    """La protección volvió a encenderse cuando el MCP dejó de pedir clave: una
    página que rebota DNS hacia este servidor llega con un `Host` ajeno."""
    r = await cliente.post(
        RUTA, json=_inicializar(), headers={**CABECERAS_MCP, "Host": "atacante.example"}
    )

    assert r.status_code == 421, r.text


async def test_un_origen_ajeno_recibe_403(cliente):
    r = await cliente.post(
        RUTA,
        json=_inicializar(),
        headers={**CABECERAS_MCP, "Origin": "https://atacante.example"},
    )

    assert r.status_code == 403, r.text


async def test_la_lista_blanca_sale_de_la_configuracion(monkeypatch):
    """El dominio público se añade por `MCP_HOSTS_PERMITIDOS`, con y sin puerto."""
    from app.config import settings
    from app.mcp.servidor import seguridad_de_transporte

    monkeypatch.setattr(settings, "mcp_hosts_permitidos", ["tordo.cl"])
    seguridad = seguridad_de_transporte()

    assert seguridad.enable_dns_rebinding_protection is True
    assert {"tordo.cl", "tordo.cl:*"} <= set(seguridad.allowed_hosts)
    assert "https://tordo.cl" in seguridad.allowed_origins
    assert "localhost" not in seguridad.allowed_hosts


# ── Contenido ────────────────────────────────────────────────────────────────


async def test_una_licitacion_inexistente_se_explica(cliente):
    """Y no como un error de protocolo: el modelo tiene que poder decirle al
    usuario que revise el código."""
    resultado = await _llamar(cliente, "panel_de_licitacion", {"codigo": "NO-EXISTE-1"})

    assert "NO-EXISTE-1" in _texto(resultado)


async def test_las_instrucciones_avisan_del_tamano_de_muestra(cliente):
    """Es la salvaguarda que evita el error más caro: presentar como precio de
    mercado una mediana calculada con cuatro órdenes."""
    r = await cliente.post(RUTA, json=_inicializar(), headers=CABECERAS_MCP)

    instrucciones = _payload(r)["result"].get("instructions", "")
    assert "confianza" in instrucciones and "n" in instrucciones


def test_un_error_interno_no_viaja_al_cliente_anonimo():
    """El MCP es anónimo: un error de Postgres o Polars trae SQL y rutas, y no
    puede llegar a quien llama. Sale un mensaje genérico y el `request_id`."""
    from app.mcp import servidor as modulo

    resultado = modulo._error(RuntimeError('relation "analytics.secreta" does not exist'))

    assert "secreta" not in str(resultado)
    assert resultado["error"] == "No se pudo completar la consulta."
    assert "request_id" in resultado


@pytest.mark.parametrize("pedido,esperado", [(-1, 1), (0, 1), (20, 20), (500, 50)])
async def test_el_limite_de_productos_se_acota_por_los_dos_lados(monkeypatch, pedido, esperado):
    """`limite=-1` llegaba a Polars como `.head(-1)`: todo menos la última fila."""
    from app.mcp import servidor as modulo

    recibidos: list[int] = []
    monkeypatch.setattr(
        modulo.bi_service, "get_productos", lambda q, limit: recibidos.append(limit) or {}
    )

    await modulo.buscar_productos("guantes", limite=pedido)

    assert recibidos == [esperado]
