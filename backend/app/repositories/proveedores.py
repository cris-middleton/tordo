"""Resolver el RUT de una empresa al código de proveedor de ChileCompra.

**Por qué hace falta un traductor.** `analytics.competitors_by_market` identifica
al proveedor por `CodigoProveedor`, y ese campo **no es un RUT**: es el
identificador interno de Mercado Público. De los 4.204.598 registros de la tabla
real, **cero** contienen un guion. La única función que cruzaba a la empresa del
usuario con esa tabla —`get_mi_posicion`— le pasaba el RUT normalizado a
`12345678-9`, así que no coincidía nunca: la pantalla «Tu posición» respondía
«tu empresa todavía no tiene órdenes en este rubro» a todo el mundo, incluida
una empresa con historial.

El puente está en `ordenes_compra`, que guarda las dos cosas: el ETL escribe
`codigo_proveedor` y `rut_proveedor` desde el detalle de cada orden.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orden_compra import OrdenCompra


def variantes_rut(rut: str) -> list[str]:
    """Las formas en que un mismo RUT puede estar escrito en la base.

    Se comparan como literales contra la columna en vez de normalizarla en SQL
    a propósito: normalizar en la consulta obliga a un índice por expresión, y
    en este repo esos están prohibidos porque Alembic los compara mal y dejan
    deriva perpetua (ver CLAUDE.md). Tres literales contra una columna indexada
    resuelven lo mismo sin esa deuda.
    """
    limpio = str(rut or "").replace(".", "").replace(" ", "").upper()
    if not limpio:
        return []

    sin_guion = limpio.replace("-", "")
    if len(sin_guion) < 2:
        return []

    con_guion = f"{sin_guion[:-1]}-{sin_guion[-1]}"
    cuerpo, dv = sin_guion[:-1], sin_guion[-1]
    # Con puntos: 12.345.678-9. Se agrupa de a tres desde la derecha.
    grupos = []
    while cuerpo:
        grupos.insert(0, cuerpo[-3:])
        cuerpo = cuerpo[:-3]
    con_puntos = f"{'.'.join(grupos)}-{dv}"

    # `dict.fromkeys` y no `set`: el orden importa para que la consulta sea
    # estable entre corridas y el plan de Postgres no cambie sin motivo.
    return list(dict.fromkeys([con_guion, sin_guion, con_puntos]))


async def codigo_por_rut(db: AsyncSession, rut: str) -> str | None:
    """Código de proveedor de ChileCompra para un RUT, o `None` si no ha
    aparecido nunca como proveedor en una orden de compra.

    Devuelve el código de la orden más reciente: un RUT puede haber quedado
    asociado a más de un código a lo largo de los años (sucursales, cambios de
    razón social), y el último es el que sigue vigente.
    """
    variantes = variantes_rut(rut)
    if not variantes:
        return None

    consulta = (
        select(OrdenCompra.codigo_proveedor)
        .where(
            OrdenCompra.rut_proveedor.in_(variantes),
            OrdenCompra.codigo_proveedor.is_not(None),
        )
        .order_by(OrdenCompra.fecha_publicacion.desc())
        .limit(1)
    )
    return (await db.execute(consulta)).scalar_one_or_none()
