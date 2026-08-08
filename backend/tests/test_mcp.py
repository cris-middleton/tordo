"""El servidor MCP, ejercitado por HTTP.

**Por HTTP y no llamando a las funciones**, porque los dos fallos que puede tener
esto son de montaje, no de lógica:

- montar una app ASGI dentro de otra **no ejecuta su ciclo de vida**, y sin el
  gestor de sesiones el servidor acepta la conexión y revienta en la primera
  herramienta;
- la credencial llega por una cabecera que **no pasa por el enrutador de
  FastAPI**, así que ninguna dependencia la ve.

Ninguno de los dos lo detecta un test que importe el módulo y llame a la función.

Lo demás que se fija aquí son las decisiones del ADR 0004:

- **cuatro herramientas, no veintidós** — un modelo encadena unas quince llamadas
  donde una persona hace tres, y con `basico` a 3 consultas/día eso agota el plan
  en una conversación;
- **la empresa sale de la clave**, no de un argumento: un modelo inventa
  identificadores en cuanto se lo pides;
- **cada llamada descuenta cuota**, con la misma regla que la API;
- **`confianza` y `n` no se filtran**: un modelo que recibe una banda de precio
  sin saber que salió de cuatro observaciones la presentará como un hecho.
"""

from __future__ import annotations

import json

import pytest
import pytest_asyncio

RUTA = "/mcp/"

CABECERAS_MCP = {
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
}


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

    from app.main import app

    async with (
        LifespanManager(app) as gestionada,
        AsyncClient(transport=ASGITransport(app=gestionada.app), base_url="http://test") as c,
    ):
        yield c


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def datos(cliente):
    """Empresa, usuario y clave **comprometidos de verdad**, y borrados después.

    Depende de `cliente` por el orden, no por lo que devuelve: es quien suelta el
    pozo de conexiones al entrar en el bucle de este módulo. Creado antes, este
    fixture reutilizaría conexiones de otro bucle y fallaría con «attached to a
    different loop» — pero sólo cuando el fichero corre dentro de la suite.

    Es la contrapartida de que el MCP abra sus propias conexiones: no puede ver
    una transacción sin cerrar. Por eso aquí se hace commit y se limpia a mano en
    vez de apoyarse en el rollback del resto de la suite.
    """
    import uuid as _uuid

    from sqlalchemy import delete

    from app.db import AsyncSessionLocal, async_engine

    # También aquí, y no sólo en `cliente`: el orden de creación de fixtures no
    # es algo sobre lo que convenga apostar, y `dispose(close=False)` abandona
    # las conexiones de otro bucle en vez de intentar cerrarlas —cerrarlas desde
    # el bucle equivocado es justamente lo que revienta—.
    await async_engine.dispose(close=False)
    from app.models.empresa import Empresa, EmpresaUsuario
    from app.models.user import User
    from app.services import api_keys as _api_keys

    async with AsyncSessionLocal() as db:
        usuario = User(
            username=f"mcp-{_uuid.uuid4().hex[:8]}",
            email=f"mcp-{_uuid.uuid4().hex[:8]}@tordo-pruebas.cl",
            hashed_password="x",
            is_active=True,
        )
        db.add(usuario)
        await db.flush()
        empresa = Empresa(
            rut_empresa=f"7{_uuid.uuid4().int % 10_000_000}-9",
            nombre_empresa="MCP SpA",
            estado_habil="habil",
        )
        db.add(empresa)
        await db.flush()
        db.add(EmpresaUsuario(empresa_id=empresa.id, user_id=usuario.id, rol="owner"))
        secreto, _ = await _api_keys.crear(
            db, empresa_id=empresa.id, nombre="mcp", creada_por=usuario.id
        )
        revocada, fila_revocada = await _api_keys.crear(
            db, empresa_id=empresa.id, nombre="revocada", creada_por=usuario.id
        )
        await _api_keys.revocar(db, fila_revocada.id, empresa.id)
        await db.commit()
        ids = {
            "clave": secreto,
            "clave_revocada": revocada,
            "empresa_id": empresa.id,
            "usuario_id": usuario.id,
            "empresa_nombre": empresa.nombre_empresa,
        }

    try:
        yield ids
    finally:
        async with AsyncSessionLocal() as db:
            # La empresa arrastra en cascada sus claves y su membresía.
            await db.execute(delete(Empresa).where(Empresa.id == ids["empresa_id"]))
            await db.execute(delete(User).where(User.id == ids["usuario_id"]))
            await db.commit()


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def clave(datos) -> str:
    return datos["clave"]


async def _listar_herramientas(cliente, autorizacion: str | None = None) -> dict:
    cabeceras = dict(CABECERAS_MCP)
    if autorizacion:
        cabeceras["Authorization"] = autorizacion
    await cliente.post(RUTA, json=_inicializar(), headers=cabeceras)
    r = await cliente.post(RUTA, json=_rpc("tools/list", {}, id_=2), headers=cabeceras)
    assert r.status_code == 200, r.text
    return _payload(r)


async def _llamar(cliente, herramienta: str, argumentos: dict, autorizacion: str | None) -> dict:
    cabeceras = dict(CABECERAS_MCP)
    if autorizacion:
        cabeceras["Authorization"] = autorizacion
    await cliente.post(RUTA, json=_inicializar(), headers=cabeceras)
    r = await cliente.post(
        RUTA,
        json=_rpc("tools/call", {"name": herramienta, "arguments": argumentos}, id_=3),
        headers=cabeceras,
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
    """Veintidós herramientas —una por endpoint de BI— agotarían el plan `basico`
    (3 consultas/día) en una sola conversación. Si alguien añade una quinta, que
    sea decidiéndolo."""
    herramientas = {h["name"] for h in (await _listar_herramientas(cliente))["result"]["tools"]}

    assert herramientas == {
        "panel_de_licitacion",
        "precio_de_producto",
        "perfil_de_comprador",
        "buscar_productos",
    }


async def test_ninguna_herramienta_pide_empresa(cliente):
    """La empresa sale de la CLAVE. Si fuera un argumento, un modelo lo
    rellenaría con lo que le pareciera — y ésa es la definición de fuga entre
    empresas."""
    for herramienta in (await _listar_herramientas(cliente))["result"]["tools"]:
        propiedades = set((herramienta.get("inputSchema") or {}).get("properties") or {})
        # La guarda importa: si el esquema dejara de llegar —o cambiara de
        # nombre—, el conjunto quedaría vacío y este test pasaría comprobando la
        # nada, que es justo lo que no se quiere de una prueba de aislamiento.
        assert propiedades, f"{herramienta['name']} llegó sin esquema de entrada"
        assert not {"empresa_id", "empresa", "rut_empresa"} & propiedades, herramienta["name"]


# ── Credencial ───────────────────────────────────────────────────────────────


async def test_sin_credencial_no_devuelve_datos(cliente):
    resultado = await _llamar(cliente, "buscar_productos", {"texto": "guantes"}, None)

    assert "credencial" in _texto(resultado).lower()


async def test_un_jwt_de_sesion_no_sirve(cliente, datos):
    """El MCP es para clientes sin navegador. Aceptar un token de sesión invitaría
    a pegarlo en un cliente de terceros, y caduca a los 30 minutos igual."""
    from app.core.security import create_access_token

    token = create_access_token({"sub": str(datos["usuario_id"])})

    resultado = await _llamar(cliente, "buscar_productos", {"texto": "guantes"}, f"Bearer {token}")

    assert "clave de api" in _texto(resultado).lower()


async def test_una_clave_revocada_no_sirve(cliente, datos):
    resultado = await _llamar(
        cliente, "buscar_productos", {"texto": "guantes"}, f"Bearer {datos['clave_revocada']}"
    )

    assert "revocada" in _texto(resultado).lower()


# ── Cuota ────────────────────────────────────────────────────────────────────


async def test_cada_llamada_descuenta_cuota(cliente, datos, clave, monkeypatch):
    """Se cobra por herramienta, con la misma función que la API. Es lo que hace
    que la cuota signifique lo mismo por los dos canales."""
    cobradas: list = []
    from app.mcp import autenticacion

    monkeypatch.setattr(
        autenticacion, "consumir_cuota_bi", lambda empresa: cobradas.append(empresa.id)
    )

    await _llamar(cliente, "buscar_productos", {"texto": "guantes"}, f"Bearer {clave}")

    assert cobradas == [datos["empresa_id"]]


async def test_sin_cuota_lo_dice_en_vez_de_reventar(cliente, clave, monkeypatch):
    """Un error de protocolo deja al modelo sin nada que contar. «No te queda
    cuota» es información útil, no una avería."""
    from fastapi import HTTPException

    from app.mcp import autenticacion

    def _sin_cuota(_empresa):
        raise HTTPException(
            status_code=402,
            detail={"bloqueada_por_plan": True, "mensaje": "Se acabaron las consultas de hoy."},
        )

    monkeypatch.setattr(autenticacion, "consumir_cuota_bi", _sin_cuota)

    resultado = await _llamar(cliente, "buscar_productos", {"texto": "guantes"}, f"Bearer {clave}")

    assert "consultas de hoy" in _texto(resultado)


# ── Contenido ────────────────────────────────────────────────────────────────


async def test_una_licitacion_inexistente_se_explica(cliente, clave):
    """Y no como un error de protocolo: el modelo tiene que poder decirle al
    usuario que revise el código."""
    resultado = await _llamar(
        cliente, "panel_de_licitacion", {"codigo": "NO-EXISTE-1"}, f"Bearer {clave}"
    )

    assert "NO-EXISTE-1" in _texto(resultado)


async def test_las_instrucciones_avisan_del_tamano_de_muestra(cliente):
    """Es la salvaguarda que evita el error más caro: presentar como precio de
    mercado una mediana calculada con cuatro órdenes."""
    r = await cliente.post(RUTA, json=_inicializar(), headers=CABECERAS_MCP)

    instrucciones = _payload(r)["result"].get("instructions", "")
    assert "confianza" in instrucciones and "n" in instrucciones
