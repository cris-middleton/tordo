"""«Lo mejor de hoy en Compra Ágil»: candidatas, historia del comprador y puntaje.

Spec del pivote §6.2, paso 9. **Es una heurística, no un modelo**: todavía no
hay verdad contra la que evaluarla (no sabemos qué Compras Ágiles le convenía
cotizar a nadie), así que no pasa por el harness de evaluación ni pretende ser
una probabilidad. Ordena; no predice.

Candidatas
----------
Compras Ágiles activas, abiertas (`esta_abierta()`) y que cierran en **más de
2 horas**: con menos no da tiempo a preparar una cotización, y ponerlas arriba
por ser «poco competidas» sería mandar a alguien a perder el tiempo. Una sin
fecha de cierre no se puede puntuar en tiempo y no entra.

Puntaje
-------
Producto de tres factores, cada uno en [0, 1]. **Un factor sin dato vale el
neutro DE SU ESCALA** (la regla de `NEUTRO_POR_COMPONENTE` del scorer de
oportunidad): aquí los tres viven en [0, 1] y el neutro es 0,5.

- `competencia = 1 / (1 + cotizaciones recibidas)` — el único dato de
  competencia de una Compra Ágil abierta es cuántas cotizaciones lleva
  (`informacion_adicional.total_ofertas_recibidas`). Sin dato, 0,5 (= una).
- `comprador = min(1, órdenes / publicadas)` sobre la ventana de
  `analytics.compra_agil_comprador`. **No es una tasa**: la orden sale días
  después de publicar, y por eso sólo se usa sobre la ventana entera y acotado
  a 1. Con menos de `MIN_PUBLICADAS` publicadas, o sin dato, 0,5.
- `tiempo = min(1, horas hasta el cierre / 24)` — más tiempo para cotizar es
  mejor, saturando a las 24 h.

Orden: puntaje descendente, cierre ascendente, código.

La historia del comprador se une por RUT: la Compra Ágil ingerida trae sólo
`rut_organismo`, y la analítica va por código. `analytics.comprador_rut` hace la
traducción. LEFT JOIN: un comprador sin historia sale igual, con `comprador`
nulo y el factor neutro. Si el pipeline todavía no materializó las tablas, la
lista sale entera sin historia en vez de fallar.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import Float, Integer, and_, case, cast, column, func, literal, null, select, table
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tiempo import ZONA_CHILE
from app.models.convocatoria import TipoConvocatoria
from app.models.licitacion import Licitacion
from app.repositories.analytics import SCHEMA, existe_tabla
from app.repositories.licitaciones import coincide_termino, esta_abierta

#: Lo que vale un factor sin dato: el centro de su escala [0, 1].
NEUTRO_POR_FACTOR = {"competencia": 0.5, "comprador": 0.5, "tiempo": 0.5}
#: Con menos publicadas, `órdenes / publicadas` es ruido: 1 de 1 no dice nada.
MIN_PUBLICADAS = 5
#: Menos que esto hasta el cierre no da tiempo a cotizar.
HORAS_MINIMAS = 2
#: El factor tiempo satura aquí: un día entero para cotizar ya es holgado.
HORAS_SATURACION = 24

TABLA_HISTORIA = "compra_agil_comprador"
TABLA_RUT = "comprador_rut"

_historia = table(
    TABLA_HISTORIA,
    column("CodigoOrganismoPublico"),
    column("ordenes"),
    column("publicadas"),
    column("proveedores_distintos"),
    column("cuota_lider_pct"),
    column("monto_p25"),
    column("monto_mediana"),
    column("monto_p75"),
    column("ventana_desde"),
    column("ventana_hasta"),
    schema=SCHEMA,
)
_rut = table(TABLA_RUT, column("rut"), column("CodigoOrganismoPublico"), schema=SCHEMA)

CAMPOS_HISTORIA = (
    "ordenes",
    "publicadas",
    "proveedores_distintos",
    "cuota_lider_pct",
    "monto_p25",
    "monto_mediana",
    "monto_p75",
)


def _rut_normalizado():
    """Como `rut_normalizado` del ETL: sin puntos ni guion, K mayúscula."""
    return func.regexp_replace(func.upper(Licitacion.rut_organismo), "[^0-9K]", "", "g")


def _ofertas_recibidas():
    """El conteo de cotizaciones, o NULL si no es un entero (o no viene)."""
    texto = Licitacion.informacion_adicional["total_ofertas_recibidas"].astext
    return case((texto.op("~")("^[0-9]+$"), cast(texto, Integer)), else_=null())


def _horas_restantes():
    return func.extract("epoch", Licitacion.fecha_cierre - func.now()) / 3600.0


def _candidatas():
    return and_(
        Licitacion.activo.is_(True),
        Licitacion.tipo_convocatoria == TipoConvocatoria.COMPRA_AGIL.value,
        esta_abierta(),
        Licitacion.fecha_cierre.is_not(None),
        _horas_restantes() > HORAS_MINIMAS,
    )


async def _hay_historia(db: AsyncSession) -> bool:
    return await existe_tabla(db, TABLA_HISTORIA) and await existe_tabla(db, TABLA_RUT)


async def destacadas(
    db: AsyncSession,
    *,
    limite: int,
    region: str | None = None,
    terminos: list[str] | None = None,
    codigo_organismo: str | None = None,
) -> list[dict[str, Any]]:
    """Las `limite` mejores candidatas, ya puntuadas. Una fila = un dict plano.

    `codigo_organismo` filtra por comprador (la página pública del comprador).
    Una Compra Ágil ingerida sólo trae el RUT del comprador, así que el código
    se alcanza por `analytics.comprador_rut`; **sin analytics no hay forma de
    saber de quién es cada una, y la respuesta es una lista vacía**, no un
    error: la página del comprador se pinta igual, sin ese bloque.
    """
    con_historia = await _hay_historia(db)
    if codigo_organismo is not None and not con_historia:
        return []
    ofertas = _ofertas_recibidas()
    horas = _horas_restantes()

    if con_historia:
        historia = {c: _historia.c[c] for c in CAMPOS_HISTORIA}
        tiene_historia = _historia.c.CodigoOrganismoPublico.is_not(None)
    else:
        historia = {c: null() for c in CAMPOS_HISTORIA}
        tiene_historia = literal(False)
    publicadas = historia["publicadas"]

    f_competencia = case(
        (ofertas.is_(None), NEUTRO_POR_FACTOR["competencia"]),
        else_=1.0 / (1.0 + ofertas),
    )
    f_comprador = (
        case(
            (
                and_(publicadas.is_not(None), publicadas >= MIN_PUBLICADAS),
                func.least(1.0, cast(historia["ordenes"], Float) / publicadas),
            ),
            else_=NEUTRO_POR_FACTOR["comprador"],
        )
        if con_historia
        else literal(NEUTRO_POR_FACTOR["comprador"], Float)
    )
    f_tiempo = func.least(1.0, horas / float(HORAS_SATURACION))
    puntaje = cast(f_competencia, Float) * cast(f_comprador, Float) * cast(f_tiempo, Float)

    consulta = select(
        Licitacion.codigo_externo,
        Licitacion.nombre,
        Licitacion.nombre_organismo,
        Licitacion.region,
        cast(Licitacion.monto_estimado, Float).label("monto_estimado"),
        Licitacion.fecha_publicacion,
        Licitacion.fecha_cierre,
        horas.label("horas_restantes"),
        ofertas.label("ofertas_recibidas"),
        tiene_historia.label("tiene_historia"),
        *[expr.label(nombre) for nombre, expr in historia.items()],
        cast(f_competencia, Float).label("f_competencia"),
        cast(f_comprador, Float).label("f_comprador"),
        cast(f_tiempo, Float).label("f_tiempo"),
        puntaje.label("puntaje"),
    )
    if con_historia:
        consulta = consulta.select_from(
            Licitacion.__table__.outerjoin(_rut, _rut.c.rut == _rut_normalizado()).outerjoin(
                _historia,
                _historia.c.CodigoOrganismoPublico == _rut.c.CodigoOrganismoPublico,
            )
        )
    consulta = consulta.where(_candidatas())
    if region:
        # Mismo criterio que el catálogo: la API manda regiones con espacios.
        consulta = consulta.where(func.trim(Licitacion.region) == region.strip())
    for termino in terminos or []:
        consulta = consulta.where(coincide_termino(termino))
    if codigo_organismo is not None:
        consulta = consulta.where(_rut.c.CodigoOrganismoPublico == codigo_organismo.strip())

    consulta = consulta.order_by(
        puntaje.desc(), Licitacion.fecha_cierre.asc(), Licitacion.codigo_externo.asc()
    ).limit(limite)
    return [dict(fila) for fila in (await db.execute(consulta)).mappings().all()]


async def ventana(db: AsyncSession) -> tuple[date | None, date | None]:
    """La ventana de la historia del comprador; (None, None) sin analytics."""
    if not await existe_tabla(db, TABLA_HISTORIA):
        return None, None
    fila = (
        await db.execute(
            select(_historia.c.ventana_desde, _historia.c.ventana_hasta)
            .where(_historia.c.ventana_desde.is_not(None))
            .limit(1)
        )
    ).first()
    return (fila[0], fila[1]) if fila else (None, None)


async def actualizado_en(db: AsyncSession) -> datetime | None:
    """La última vez que se ingirió o actualizó una Compra Ágil, en hora de Chile.

    Es lo que la pantalla muestra como «actualizado a las …»: si la corrida
    falla, la página tiene que poder decirlo en vez de mentir.
    """
    valor = (
        await db.execute(
            select(
                func.max(func.coalesce(Licitacion.fecha_actualizacion, Licitacion.fecha_extraccion))
            ).where(Licitacion.tipo_convocatoria == TipoConvocatoria.COMPRA_AGIL.value)
        )
    ).scalar()
    return valor.astimezone(ZONA_CHILE) if valor else None
