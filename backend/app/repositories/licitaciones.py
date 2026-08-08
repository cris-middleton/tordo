"""Acceso a licitaciones.

Cuatro routers consultan esta tabla —`tenders`, `postulaciones`, `dashboard` y
`bi`— y los cuatro repetían la misma condición: `activo == True`.

Esa condición no es un detalle de estilo. `activo=False` es como el ETL marca lo
que Mercado Público retiró; una licitación retirada que se cuela en un listado
es una invitación a preparar una postulación imposible. Repetida en cuatro
sitios, es cuestión de tiempo que la quinta no la lleve — y de hecho **faltaba**
en el endpoint que crea postulaciones.

El módulo **ejecuta**, no sólo construye. Devolver un `Select` para que el router
lo ejecutara dejaba media consulta a cada lado y el `db.execute` seguía viviendo
en la capa HTTP.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import Select, asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.licitacion import Licitacion
from app.repositories import matches as repo_matches

# Cuántas candidatas se traen para reordenar por similitud semántica. El coseno
# se calcula en memoria, así que el tope es lo que impide que una búsqueda de
# una palabra común cargue el catálogo entero.
POOL_SEMANTICO = 200

# Columnas por las que se puede ordenar en SQL. `relevance` y `score_encaje` no
# están: los resuelven caminos propios.
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
    region: str | None = None
    monto_minimo: float | None = None
    monto_maximo: float | None = None
    # Todos los términos tienen que coincidir (AND). Es la semántica de filtro
    # precisa que ya tenía el buscador; el modo relevancia la amplía a OR.
    terminos: list[str] = field(default_factory=list)


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
    if filtros.region:
        consulta = consulta.where(Licitacion.region == filtros.region)
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
    empresa_id=None,
) -> tuple[list[Licitacion], int]:
    """Una página de licitaciones y el total que cumple los filtros.

    `orden="score_encaje"` con una empresa ordena por el encaje precomputado, en
    SQL. El resto de valores ordenan por columna; uno desconocido cae en fecha de
    publicación, que es el orden por defecto del producto.
    """
    consulta = _con_filtros(filtros)

    total = int(
        (await db.execute(select(func.count()).select_from(consulta.subquery()))).scalar() or 0
    )

    if orden == "score_encaje" and empresa_id:
        ordenada = repo_matches.ordenar_por_encaje(consulta, empresa_id, ascendente=ascendente)
    else:
        columna = COLUMNAS_ORDENABLES.get(orden or "", Licitacion.fecha_publicacion)
        ordenada = consulta.order_by((asc if ascendente else desc)(columna))

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
    consulta = consulta.order_by(desc(Licitacion.fecha_publicacion)).limit(POOL_SEMANTICO)
    return list((await db.execute(consulta)).scalars().all())


async def obtener(db: AsyncSession, licitacion_id: int) -> Licitacion | None:
    """Por id interno. Sólo activas."""
    return (await db.execute(_base().where(Licitacion.id == licitacion_id))).scalar_one_or_none()


async def obtener_por_codigo(db: AsyncSession, codigo_externo: str) -> Licitacion | None:
    """Por el código de Mercado Público, que es el que se ve en la URL."""
    return (
        await db.execute(_base().where(Licitacion.codigo_externo == codigo_externo))
    ).scalar_one_or_none()


async def obtener_para_postular(db: AsyncSession, licitacion_id: int) -> Licitacion | None:
    """Como `obtener`, pero sin cargar el detalle.

    Al crear una postulación sólo se necesita el tipo de licitación para elegir
    la plantilla del checklist; traer el detalle sería una consulta de más en el
    camino más caliente del producto.
    """
    return (
        await db.execute(
            select(Licitacion).where(Licitacion.id == licitacion_id, Licitacion.activo.is_(True))
        )
    ).scalar_one_or_none()
