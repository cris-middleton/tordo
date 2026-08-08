"""Las herramientas que el MCP expone.

**Cuatro, no veintidós, y es la decisión de diseño que hay que respetar.**

La razón es económica y está medida en el [ADR 0004]: una persona hace unas tres
consultas de BI para evaluar una licitación; **un modelo encadena unas quince**
para responder una sola pregunta. Con las cuotas actuales —`basico` 3/día,
`pyme` 50/día— exponer los 22 endpoints uno a uno agotaría el plan de un usuario
en una sola conversación, y la culpa parecería del plan.

La salida es **menos herramientas que devuelvan más**: `panel_de_licitacion`
responde en una llamada lo que en la API son cuatro. Si algún día se exponen los
endpoints uno a uno, **hay que rehacer las cuotas primero**.

Vive DENTRO de la aplicación, no como cliente de su propia API (ADR 0004). Así
hereda la autenticación por clave, la cuota y `services/bi/` llamado directo. La
razón de fondo no es la latencia: reimplementar la autorización es de donde salió
la fuga de `/licitacion-match`.

[ADR 0004]: ../../../docs/decisiones/0004-llm-solo-mcp.md
"""

from __future__ import annotations

import logging
from typing import Any

from app.config import settings
from app.db import AsyncSessionLocal
from app.mcp import autenticacion
from app.repositories import licitaciones as repo_licitaciones
from app.services import bi as bi_service
from mcp.server.mcpserver import Context, MCPServer
from mcp.server.transport_security import TransportSecuritySettings

logger = logging.getLogger(__name__)

#: Cuántos productos de la licitación se consultan para el panel. El mismo tope
#: que usa el endpoint equivalente: más allá, la respuesta deja de caber en una
#: ventana de contexto sin aportar.
MAX_PRODUCTOS = 10

INSTRUCCIONES = """\
Datos de Mercado Público (ChileCompra) para la empresa dueña de la clave de API.

Cada llamada descuenta de la cuota diaria de consultas del plan, así que conviene
`panel_de_licitacion` —que responde de una vez precio, competencia, comprador y
ventana— antes que encadenar herramientas sueltas.

**Las bandas de precio vienen siempre con `confianza` y `n` (tamaño de muestra).
Menciónalos.** Una mediana calculada con cuatro órdenes no es un precio de
mercado, y presentarla como un hecho es el error más caro que puedes cometer
aquí.

Los precios están en pesos chilenos.
"""

servidor = MCPServer(
    name=f"{settings.app_name}",
    version=settings.app_version,
    instructions=INSTRUCCIONES,
)


async def _llamante(ctx: Context) -> autenticacion.Llamante:
    """Resuelve quién llama y le cobra la consulta. Una sesión propia por
    llamada: el MCP no pasa por `get_db`, que es una dependencia de FastAPI."""
    async with AsyncSessionLocal() as db:
        llamante = await autenticacion.resolver(db, ctx.headers)
    autenticacion.cobrar_consulta(llamante)
    return llamante


def _error(exc: Exception) -> dict[str, Any]:
    """Un error que el modelo pueda contar al usuario.

    Se devuelve como resultado y no como excepción del protocolo a propósito: un
    fallo de transporte deja al modelo sin nada que decir, y «no tienes cuota»
    es información útil, no una avería.
    """
    detalle = getattr(exc, "detail", None)
    if isinstance(detalle, dict):
        return {"error": detalle.get("mensaje", "No se pudo completar la consulta.")}
    return {"error": str(exc) or "No se pudo completar la consulta."}


@servidor.tool(
    title="Panel de una licitación",
    description=(
        "Todo lo que hace falta para decidir si postular a una licitación, en una "
        "sola llamada: perfil del comprador y cómo paga, si la ventana de "
        "preparación es holgada o apretada, los competidores habituales, y las "
        "bandas de precio de sus productos con su confianza. Úsala en vez de "
        "encadenar varias herramientas."
    ),
)
async def panel_de_licitacion(ctx: Context, codigo: str) -> dict[str, Any]:
    """`codigo` es el código externo de Mercado Público, p. ej. `1057401-1-LP24`."""
    try:
        llamante = await _llamante(ctx)
    except Exception as exc:
        return _error(exc)

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

        panel = bi_service.get_licitacion_panel(
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
            "empresa": llamante.empresa.nombre_empresa,
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
    ctx: Context, codigo_producto: str, organismo_id: str | None = None
) -> dict[str, Any]:
    try:
        await _llamante(ctx)
    except Exception as exc:
        return _error(exc)

    try:
        # `confianza` y `n` vienen dentro y NO se filtran: un modelo que recibe
        # una banda sin saber que se calculó con cuatro observaciones la
        # presentará como un hecho.
        return bi_service.get_precio_producto(
            codigo_producto=codigo_producto, organismo_id=organismo_id
        )
    except Exception as exc:
        logger.error("[MCP] precio_de_producto(%s) falló: %s", codigo_producto, exc)
        return _error(exc)


@servidor.tool(
    title="Perfil de un comprador",
    description=(
        "Cómo se comporta un organismo público: en cuántos días paga, qué tan "
        "transparente es su historial y sus señales de riesgo. Sirve para decidir "
        "si conviene trabajar con él antes de mirar el precio."
    ),
)
async def perfil_de_comprador(ctx: Context, organismo_id: str) -> dict[str, Any]:
    try:
        await _llamante(ctx)
    except Exception as exc:
        return _error(exc)

    try:
        return bi_service.get_comprador(organismo_id)
    except Exception as exc:
        logger.error("[MCP] perfil_de_comprador(%s) falló: %s", organismo_id, exc)
        return _error(exc)


@servidor.tool(
    title="Buscar productos por nombre",
    description=(
        "Encuentra el código ONU de un producto a partir de su nombre. Es el paso "
        "previo a `precio_de_producto`: el catálogo usa códigos, y el usuario "
        "habla de «guantes» o «papel». Devuelve cuántas transacciones tiene cada "
        "uno, que es lo que indica si el precio será fiable."
    ),
)
async def buscar_productos(ctx: Context, texto: str, limite: int = 20) -> dict[str, Any]:
    try:
        await _llamante(ctx)
    except Exception as exc:
        return _error(exc)

    try:
        return bi_service.get_productos(q=texto, limit=min(limite, 50))
    except Exception as exc:
        logger.error("[MCP] buscar_productos(%s) falló: %s", texto, exc)
        return _error(exc)


def aplicacion():
    """La app ASGI del MCP, para montar dentro de la de FastAPI.

    `stateless_http`: cada petición se resuelve sola, sin sesión que recordar. Es
    obligatorio aquí — el despliegue puede tener varias réplicas, y una sesión en
    memoria haría que la segunda petición cayera en un proceso que no sabe nada
    de la primera.

    **La protección contra DNS rebinding se apaga a propósito**, y conviene decir
    por qué porque viene activada. Su defecto es una lista blanca de `Host` que
    sólo contiene `localhost`: con ella, servido desde un dominio real, **todas**
    las peticiones responden `421 Misdirected Request`. Y lo que protege no
    aplica aquí — el ataque es una página web que alcanza un servidor **local**
    del visitante; éste es remoto y **exige una clave de API en cada llamada**,
    así que una petición rebotada llega sin credencial y no obtiene nada.
    """
    return servidor.streamable_http_app(
        streamable_http_path="/",
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )
