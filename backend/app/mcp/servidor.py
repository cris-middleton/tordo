"""Las herramientas que el MCP expone.

**Cuatro, no veinte, y es la decisión de diseño que hay que respetar.**

La razón está medida en el [ADR 0004]: una persona hace unas tres consultas de BI
para evaluar una licitación; **un modelo encadena unas quince** para responder
una sola pregunta. Nació para no agotar la cuota diaria de un plan en una
conversación; desde el pivote público ya no hay cuotas, pero el motivo de fondo
sigue: cada llamada es carga sobre la base, y **menos herramientas que devuelvan
más** —`panel_de_licitacion` responde en una llamada lo que en la API son
cuatro— es lo que mantiene acotada la de un cliente anónimo.

Vive DENTRO de la aplicación, no como cliente de su propia API (ADR 0004): llama
a `services/bi/` directo.

**Es anónimo** desde el pivote a sitio público (docs/PIVOTE_PUBLICO_2026-10.md):
no hay cuentas, así que no hay clave que pedir.

[ADR 0004]: ../../../docs/decisiones/0004-llm-solo-mcp.md
"""

from __future__ import annotations

import logging
from functools import partial
from typing import Annotated, Any

import anyio
from pydantic import Field

from app.api import limites
from app.config import settings
from app.db import AsyncSessionLocal
from app.observability import request_id_ctx
from app.repositories import licitaciones as repo_licitaciones
from app.services import bi as bi_service
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings

logger = logging.getLogger(__name__)

#: Cuántos productos de la licitación se consultan para el panel. El mismo tope
#: que usa el endpoint equivalente: más allá, la respuesta deja de caber en una
#: ventana de contexto sin aportar.
MAX_PRODUCTOS = 10

INSTRUCCIONES = """\
Datos públicos de Mercado Público (ChileCompra).

Conviene `panel_de_licitacion` —que responde de una vez precio, competencia,
comprador y ventana— antes que encadenar herramientas sueltas.

**Las bandas de precio vienen siempre con `confianza` y `n` (tamaño de muestra).
Menciónalos.** Una mediana calculada con cuatro órdenes no es un precio de
mercado, y presentarla como un hecho es el error más caro que puedes cometer
aquí.

Los precios están en pesos chilenos.
"""

#: Los argumentos, con las mismas cotas que la API REST (`app/api/limites.py`).
#: `tests/test_parametros_acotados.py` sólo recorre el OpenAPI, así que el MCP se
#: saltaba los topes: un `texto` de megabytes llegaba entero a la búsqueda.
Codigo = Annotated[str, Field(min_length=1, max_length=limites.CODIGO)]
Texto = Annotated[str, Field(min_length=1, max_length=limites.TEXTO)]

#: Cuántas herramientas corren a la vez. Los servicios de BI son síncronos
#: (psycopg2): llamados directo desde una corrutina bloqueaban el bucle, y con un
#: solo worker toda la API REST esperaba a que terminara un panel. Ahora van a un
#: hilo, y este tope evita que un cliente que lance diez a la vez meta diez
#: consultas pesadas en 512 MB.
_HILOS_MCP = anyio.CapacityLimiter(2)


async def _en_hilo(funcion, /, **kwargs):
    """Corre un servicio síncrono de BI fuera del bucle de eventos."""
    return await anyio.to_thread.run_sync(partial(funcion, **kwargs), limiter=_HILOS_MCP)


servidor = MCPServer(
    name=f"{settings.app_name}",
    version=settings.app_version,
    instructions=INSTRUCCIONES,
)


def _error(exc: Exception) -> dict[str, Any]:
    """Un error que el modelo pueda contar al usuario, SIN el detalle interno.

    Se devuelve como resultado y no como excepción del protocolo a propósito: un
    fallo de transporte deja al modelo sin nada que decir.

    El texto de la excepción no sale: el MCP es anónimo, y un error de Postgres o
    de Polars trae SQL y rutas de ficheros — lo mismo que el manejador de 500 de
    la API REST esconde. Lo que sí sale es el `request_id`, que lleva al
    traceback en los logs.
    """
    return {
        "error": "No se pudo completar la consulta.",
        "request_id": request_id_ctx.get(),
    }


@servidor.tool(
    title="Panel de una licitación",
    description=(
        "Todo lo que hace falta para decidir si postular a una licitación, en una "
        "sola llamada: perfil del comprador, si la ventana de "
        "preparación es holgada o apretada, los competidores habituales, y las "
        "bandas de precio de sus productos con su confianza. Úsala en vez de "
        "encadenar varias herramientas."
    ),
)
async def panel_de_licitacion(codigo: Codigo) -> dict[str, Any]:
    """`codigo` es el código externo de Mercado Público, p. ej. `1057401-1-LP24`."""
    try:
        async with AsyncSessionLocal() as db:
            lic = await repo_licitaciones.obtener_por_codigo(db, codigo)
        if lic is None:
            return {
                "error": (
                    f"No hay ninguna licitación con código «{codigo}». Puede que no "
                    f"esté ingerida todavía o que el código esté mal escrito."
                )
            }

        codigos: list[str] = []
        for item in lic.items or []:
            if not isinstance(item, dict):
                continue
            codigo_producto = (
                item.get("codigoProductoONU")
                or item.get("CodigoProducto")
                or item.get("codigo_producto")
            )
            if codigo_producto and str(codigo_producto) not in codigos:
                codigos.append(str(codigo_producto))
            if len(codigos) >= MAX_PRODUCTOS:
                break

        panel = await _en_hilo(
            bi_service.get_licitacion_panel,
            codigo_externo=codigo,
            organismo_id=lic.codigo_organismo,
            product_codes=codigos,
        )
        return {
            "licitacion": {
                "codigo": lic.codigo_externo,
                "nombre": lic.nombre,
                "estado": lic.estado,
                "cierra": lic.fecha_cierre.isoformat() if lic.fecha_cierre else None,
                "monto_estimado": float(lic.monto_estimado) if lic.monto_estimado else None,
                "organismo": lic.nombre_organismo,
            },
            **panel,
        }
    except Exception as exc:
        logger.error("[MCP] panel_de_licitacion(%s) falló: %s", codigo, exc, exc_info=True)
        return _error(exc)


@servidor.tool(
    title="Precio de referencia de un producto",
    description=(
        "Bandas de precio históricas de un producto (código ONU): percentiles 10 a "
        "90, con el nivel de datos usado, la confianza y el tamaño de muestra. "
        "Si se indica organismo, usa sus datos y sólo cae al sector o al país "
        "cuando no tiene suficientes."
    ),
)
async def precio_de_producto(
    codigo_producto: Codigo, organismo_id: Codigo | None = None
) -> dict[str, Any]:
    try:
        # `confianza` y `n` vienen dentro y NO se filtran: un modelo que recibe
        # una banda sin saber que se calculó con cuatro observaciones la
        # presentará como un hecho.
        return await _en_hilo(
            bi_service.get_precio_producto,
            codigo_producto=codigo_producto,
            organismo_id=organismo_id,
        )
    except Exception as exc:
        logger.error("[MCP] precio_de_producto(%s) falló: %s", codigo_producto, exc)
        return _error(exc)


@servidor.tool(
    title="Perfil de un comprador",
    description=(
        "Cómo se comporta un organismo público: qué tan transparente es su "
        "historial, cuánto de lo que llama termina adjudicando y sus señales de "
        "riesgo. Sirve para decidir si conviene trabajar con él antes de mirar el "
        "precio."
    ),
)
async def perfil_de_comprador(organismo_id: Codigo) -> dict[str, Any]:
    try:
        return await _en_hilo(bi_service.get_comprador, organismo_id=organismo_id)
    except Exception as exc:
        logger.error("[MCP] perfil_de_comprador(%s) falló: %s", organismo_id, exc)
        return _error(exc)


@servidor.tool(
    title="Buscar productos por nombre",
    description=(
        "Encuentra el código ONU de un producto a partir de su nombre. Es el paso "
        "previo a `precio_de_producto`: el catálogo usa códigos, y el usuario "
        "habla de «guantes» o «papel». Busca por palabras, en cualquier orden y con "
        "sus plurales y algunos sinónimos («lápiz» también trae «bolígrafo»; «pc», "
        "computadores): no hace falta probar variantes. Devuelve cuántas "
        "transacciones tiene cada uno, que es lo que indica si el precio será fiable."
    ),
)
async def buscar_productos(texto: Texto, limite: int = 20) -> dict[str, Any]:
    try:
        return await _en_hilo(bi_service.get_productos, q=texto, limit=max(1, min(limite, 50)))
    except Exception as exc:
        logger.error("[MCP] buscar_productos(%s) falló: %s", texto, exc)
        return _error(exc)


#: Los hosts con los que arranca `MCP_HOSTS_PERMITIDOS` si nadie la toca.
HOSTS_LOCALES = frozenset({"localhost", "127.0.0.1"})


def aviso_de_hosts(*, entorno: str, hosts: list[str]) -> str | None:
    """Lo que conviene avisar al arrancar sobre la lista blanca del MCP.

    En producción, una lista con sólo nombres locales es casi seguro un olvido:
    el MCP responde 421 a todo lo que llega por el dominio público y nada falla
    al desplegar. Como los avisos del límite por IP, no impide arrancar.
    """
    if entorno != "production":
        return None
    if {h.strip().lower() for h in hosts if h.strip()} <= HOSTS_LOCALES:
        return (
            "MCP_HOSTS_PERMITIDOS sólo tiene localhost/127.0.0.1 en producción: el MCP "
            "responderá 421 a todo lo que llegue por el dominio público. Añade el dominio "
            "(p. ej. MCP_HOSTS_PERMITIDOS=api.tordo.cl)."
        )
    return None


def seguridad_de_transporte() -> TransportSecuritySettings:
    """La protección contra DNS rebinding, con la lista blanca de `MCP_HOSTS_PERMITIDOS`.

    Estuvo apagada mientras cada llamada exigía una clave de API: una petición
    rebotada llegaba sin credencial y no obtenía nada. **Desde que el MCP es
    anónimo ese argumento ya no vale**, así que vuelve a encenderse.

    El `Host` llega con puerto (`localhost:8000`), así que cada nombre se acepta
    solo y con cualquier puerto. Lo mismo el `Origin`, en http y https: un
    cliente sin navegador no lo manda, y entonces no se comprueba.

    Un dominio real que no esté en la lista responde **421** a todo. Al
    desplegar, `MCP_HOSTS_PERMITIDOS` tiene que llevar el dominio público.
    """
    hosts = settings.mcp_hosts_permitidos
    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=[h for host in hosts for h in (host, f"{host}:*")],
        allowed_origins=[
            o
            for host in hosts
            for esquema in ("http", "https")
            for o in (f"{esquema}://{host}", f"{esquema}://{host}:*")
        ],
    )


def aplicacion():
    """La app ASGI del MCP, para montar dentro de la de FastAPI.

    `stateless_http`: cada petición se resuelve sola, sin sesión que recordar. Es
    obligatorio aquí — el despliegue puede tener varias réplicas, y una sesión en
    memoria haría que la segunda petición cayera en un proceso que no sabe nada
    de la primera.
    """
    return servidor.streamable_http_app(
        streamable_http_path="/",
        stateless_http=True,
        json_response=True,
        transport_security=seguridad_de_transporte(),
    )
