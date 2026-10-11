"""Acceso a licitaciones.

Los routers que consultan esta tabla —`tenders` y `bi`— repetían la misma
condición: `activo == True`.

Esa condición no es un detalle de estilo. `activo=False` es como el ETL marca lo
que Mercado Público retiró; una licitación retirada que se cuela en un listado
es una invitación a preparar una oferta imposible. Repetida en varios sitios, es
cuestión de tiempo que el siguiente no la lleve — y de hecho llegó a **faltar**
en un endpoint.

El módulo **ejecuta**, no sólo construye. Devolver un `Select` para que el router
lo ejecutara dejaba media consulta a cada lado y el `db.execute` seguía viviendo
en la capa HTTP.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import Select, and_, asc, case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.licitacion import Licitacion

# Cuántas candidatas se traen para reordenar por similitud semántica. El coseno
# se calcula en memoria, así que el tope es lo que impide que una búsqueda de
# una palabra común cargue el catálogo entero.
POOL_SEMANTICO = 200

# Columnas por las que se puede ordenar en SQL. `relevance` no está: lo resuelve
# un camino propio.
COLUMNAS_ORDENABLES = {
    "fecha_publicacion": Licitacion.fecha_publicacion,
    "fecha_cierre": Licitacion.fecha_cierre,
    "monto_estimado": Licitacion.monto_estimado,
    "nombre": Licitacion.nombre,
}


def coincide_termino(termino: str):
    """Cómo se decide que una licitación coincide con un término.

    Dos vías, ambas con índice:

    - `busqueda @@ plainto_tsquery('spanish', t)` — palabras, con stemming.
      Encuentra "servicio" buscando "servicios". Cubre nombre y descripción.
    - `nombre_norm ILIKE '%t%'` — fragmentos a mitad de palabra, sobre el índice
      de trigramas. Es lo que salva buscar "valvul".

    El término se normaliza igual que el texto indexado. Si sólo se normalizara
    un lado, buscar con tilde dejaría de encontrar lo que se indexó sin ella.
    """
    sin_tildes = func.inmutable_unaccent(termino)
    return or_(
        Licitacion.busqueda.op("@@")(func.plainto_tsquery("spanish", sin_tildes)),
        Licitacion.nombre_norm.ilike(func.inmutable_unaccent(f"%{termino}%")),
    )


@dataclass(frozen=True)
class Filtros:
    """Los filtros del listado, en un objeto para no arrastrar siete parámetros."""

    estado: str | None = None
    codigo_organismo: str | None = None
    #: Mecanismo de compra. Varios valores separados por coma se combinan con OR:
    #: quien filtra "compra ágil o convenio marco" está preguntando por el
    #: mercado que NO es licitación, no por uno de los dos.
    tipos_convocatoria: list[str] = field(default_factory=list)
    region: str | None = None
    monto_minimo: float | None = None
    monto_maximo: float | None = None
    # Todos los términos tienen que coincidir (AND). Es la semántica de filtro
    # precisa que ya tenía el buscador; el modo relevancia la amplía a OR.
    terminos: list[str] = field(default_factory=list)


def esta_abierta():
    """Se puede postular: publicada y sin cerrar.

    Es la primera clave de TODO orden del listado. Sin ella, buscar «limpieza»
    devolvía primero licitaciones cerradas o adjudicadas —el orden era sólo por
    fecha de publicación—, y ordenar por cierre ascendente empezaba por las que
    cerraron hace meses. Quien busca, busca a qué postular.
    """
    return and_(
        Licitacion.estado == "Publicada",
        or_(Licitacion.fecha_cierre.is_(None), Licitacion.fecha_cierre > func.now()),
    )


def abierta_en_memoria(lic: Licitacion) -> bool:
    """`esta_abierta`, para filas ya cargadas (el reordenado semántico)."""
    if lic.estado != "Publicada":
        return False
    return lic.fecha_cierre is None or lic.fecha_cierre > datetime.now(UTC)


def abiertas_primero():
    """Clave de orden: 0 para las abiertas, 1 para el resto."""
    return case((esta_abierta(), 0), else_=1)


def _base() -> Select:
    """Sólo licitaciones vigentes, con su detalle cargado.

    Es el único sitio donde se decide qué es una licitación «que existe».
    """
    return (
        select(Licitacion)
        .options(selectinload(Licitacion.detalle))
        .where(Licitacion.activo.is_(True))
    )


def _con_filtros(filtros: Filtros, *, aplicar_terminos: bool = True) -> Select:
    consulta = _base()
    if filtros.estado:
        consulta = consulta.where(Licitacion.estado == filtros.estado)
    if filtros.codigo_organismo:
        consulta = consulta.where(Licitacion.codigo_organismo == filtros.codigo_organismo)
    if filtros.tipos_convocatoria:
        consulta = consulta.where(Licitacion.tipo_convocatoria.in_(filtros.tipos_convocatoria))
    if filtros.region:
        # La API manda las regiones con espacios al final («Región del Biobío »,
        # «Región de Tarapacá  ») y el selector no: comparadas tal cual, filtrar
        # por región no encontraba nada en 9 de las 16. El ETL ya las limpia al
        # guardar; el `trim` cubre las filas guardadas antes.
        consulta = consulta.where(func.trim(Licitacion.region) == filtros.region.strip())
    if filtros.monto_minimo:
        consulta = consulta.where(Licitacion.monto_estimado >= filtros.monto_minimo)
    if filtros.monto_maximo:
        consulta = consulta.where(Licitacion.monto_estimado <= filtros.monto_maximo)
    if aplicar_terminos:
        for termino in filtros.terminos:
            consulta = consulta.where(coincide_termino(termino))
    return consulta


async def buscar(
    db: AsyncSession,
    filtros: Filtros,
    *,
    orden: str | None = None,
    ascendente: bool = False,
    salto: int = 0,
    limite: int = 20,
) -> tuple[list[Licitacion], int]:
    """Una página de licitaciones y el total que cumple los filtros.

    Se ordena por columna; un valor desconocido cae en fecha de publicación, que
    es el orden por defecto del producto.
    """
    consulta = _con_filtros(filtros)

    total = int(
        (await db.execute(select(func.count()).select_from(consulta.subquery()))).scalar() or 0
    )

    columna = COLUMNAS_ORDENABLES.get(orden or "", Licitacion.fecha_publicacion)
    ordenada = consulta.order_by(
        abiertas_primero(), (asc if ascendente else desc)(columna).nulls_last()
    )

    filas = (await db.execute(ordenada.offset(salto).limit(limite))).scalars().all()
    return list(filas), total


async def pool_para_relevancia(db: AsyncSession, filtros: Filtros) -> list[Licitacion]:
    """Candidatas para reordenar por similitud semántica.

    Los términos se combinan con **OR**, no con AND: el ranking por coseno es lo
    que decide el orden, así que ampliar el conjunto deja que aparezcan
    sinónimos cercanos que la consulta estricta habría descartado.
    """
    consulta = _con_filtros(filtros, aplicar_terminos=False)
    clausulas = [coincide_termino(t) for t in filtros.terminos]
    if clausulas:
        consulta = consulta.where(or_(*clausulas))
    # Las abiertas primero también aquí: el pool es de 200, y llenarlo de
    # cerradas recientes dejaba fuera justo las que se pueden postular.
    consulta = consulta.order_by(abiertas_primero(), desc(Licitacion.fecha_publicacion)).limit(
        POOL_SEMANTICO
    )
    return list((await db.execute(consulta)).scalars().all())


async def obtener(db: AsyncSession, licitacion_id: int) -> Licitacion | None:
    """Por id interno. Sólo activas."""
    return (await db.execute(_base().where(Licitacion.id == licitacion_id))).scalar_one_or_none()


async def obtener_por_codigo(db: AsyncSession, codigo_externo: str) -> Licitacion | None:
    """Por el código de Mercado Público, que es el que se ve en la URL."""
    return (
        await db.execute(_base().where(Licitacion.codigo_externo == codigo_externo))
    ).scalar_one_or_none()
