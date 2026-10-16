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
from datetime import datetime, timedelta

from sqlalchemy import DateTime, Select, and_, asc, case, desc, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.tiempo import ZONA_CHILE, hoy_chile, inicio_del_dia
from app.models.convocatoria import TipoConvocatoria
from app.models.licitacion import Licitacion

# Columnas por las que se puede ordenar. `relevance` no está: no es una columna
# sino una puntuación contra los términos, y la resuelve `buscar_por_relevancia`.
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
    # Todos los términos tienen que coincidir (AND), también al ordenar por
    # relevancia: el orden no cambia QUÉ se encuentra, sólo en qué orden sale.
    terminos: list[str] = field(default_factory=list)
    #: Sólo lo que se puede postular ahora (`esta_abierta`). Es la MISMA
    #: condición que cuenta la portada (`contar_abiertas`) y la que ordena el
    #: listado: `estado="Publicada"` no basta, porque no mira el cierre.
    abiertas: bool = False


def referencia_reloj(ahora: datetime | None = None):
    """El «ahora» de una consulta: `now()` de Postgres, o un instante fijo.

    Un `datetime` sin zona horaria se rechaza: Postgres lo leería en la zona de
    la sesión y la medición dependería de dónde corre.
    """
    if ahora is None:
        return func.now()
    if ahora.tzinfo is None:
        raise ValueError("`ahora` tiene que llevar zona horaria (datetime con tzinfo).")
    return literal(ahora, DateTime(timezone=True))


def esta_abierta(ahora: datetime | None = None):
    """Se puede postular: publicada y sin cerrar.

    Es la primera clave de TODO orden del listado. Sin ella, buscar «limpieza»
    devolvía primero licitaciones cerradas o adjudicadas —el orden era sólo por
    fecha de publicación—, y ordenar por cierre ascendente empezaba por las que
    cerraron hace meses. Quien busca, busca a qué postular.

    Es también el filtro `abiertas` del catálogo y lo que cuenta la portada
    (`contar_abiertas`, `GET /publico/portada`): una sola definición, para que
    el número que se lee en la portada sea el total al que lleva su enlace.

    `ahora` fija el reloj (tests y la medición del orden de «lo mejor de hoy»);
    sin él manda `now()` de Postgres, como en producción.
    """
    referencia = referencia_reloj(ahora)
    return and_(
        Licitacion.estado == "Publicada",
        or_(Licitacion.fecha_cierre.is_(None), Licitacion.fecha_cierre > referencia),
    )


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
    if filtros.abiertas:
        consulta = consulta.where(esta_abierta())
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


def puntuacion_relevancia(terminos: list[str]):
    """Cuánto se parece una licitación a lo que se buscó. Mayor es mejor.

    Suma tres señales, todas sobre el texto ya normalizado (sin tildes, con
    stemming) que usa `coincide_termino`, así que puntúa lo mismo que filtra:

    - `ts_rank_cd` con **todos** los términos juntos: densidad de cobertura, que
      premia que aparezcan cerca. «guantes de nitrilo quirúrgicos» gana a una
      ficha que dice «nitrilo» en el nombre y «quirúrgicos» tres párrafos abajo.
    - `ts_rank` con **cualquiera** de ellos: cuántas veces aparecen. Sostiene el
      orden cuando un término es sólo un fragmento («valvul») y la consulta
      conjunta queda sin lexemas.
    - lo mismo, sólo sobre el **nombre**: el nombre es lo que la entidad dice
      que compra; la descripción, a menudo, el pliego entero.

    No se pesa con `setweight` en la columna generada porque eso es una
    migración que reescribe la tabla para ganar lo que aquí se gana sumando.
    Un fragmento que sólo coincide por trigrama puntúa 0 y sale igual, al final:
    el filtro decide qué sale; esto, en qué orden.
    """
    todos = func.plainto_tsquery("spanish", func.inmutable_unaccent(" ".join(terminos)))
    cualquiera = func.plainto_tsquery("spanish", func.inmutable_unaccent(terminos[0]))
    for termino in terminos[1:]:
        # `||` entre dos tsquery es OR. Se compone con plainto_tsquery por
        # término para que nada de lo que escribe el usuario se interprete como
        # sintaxis (ver `test_la_sintaxis_de_tsquery_no_se_interpreta`).
        cualquiera = cualquiera.op("||")(
            func.plainto_tsquery("spanish", func.inmutable_unaccent(termino))
        )
    nombre = func.to_tsvector("spanish", func.coalesce(Licitacion.nombre_norm, ""))
    return (
        func.ts_rank_cd(Licitacion.busqueda, todos)
        + func.ts_rank(Licitacion.busqueda, cualquiera)
        + func.ts_rank(nombre, cualquiera)
    )


async def buscar_por_relevancia(
    db: AsyncSession,
    filtros: Filtros,
    *,
    ascendente: bool = False,
    salto: int = 0,
    limite: int = 20,
) -> tuple[list[Licitacion], int]:
    """Como `buscar`, ordenado por `puntuacion_relevancia`.

    Sin términos no hay contra qué puntuar y se cae al orden por defecto —
    con el mismo filtro, así que «relevancia sin escribir nada» lista todo.

    Antes esto lo hacía el TF-IDF del ETL cargado DENTRO de la API (~165 MB por
    proceso) sobre un pool de 200 candidatas en memoria; ahora es una consulta,
    y el total es exacto en vez de «hasta 200».
    """
    if not filtros.terminos:
        return await buscar(db, filtros, ascendente=ascendente, salto=salto, limite=limite)

    consulta = _con_filtros(filtros)
    total = int(
        (await db.execute(select(func.count()).select_from(consulta.subquery()))).scalar() or 0
    )

    puntuacion = puntuacion_relevancia(filtros.terminos)
    ordenada = consulta.order_by(
        abiertas_primero(),
        (asc if ascendente else desc)(puntuacion),
        desc(Licitacion.fecha_publicacion),
    )
    filas = (await db.execute(ordenada.offset(salto).limit(limite))).scalars().all()
    return list(filas), total


@dataclass(frozen=True)
class PorCierre:
    """Compras Ágiles abiertas según el día de Chile en que cierran."""

    hoy: int
    manana: int
    dos_tres_dias: int
    #: Desde el cuarto día, y las que no tienen cierre (abiertas por eso).
    despues: int


@dataclass(frozen=True)
class ConteoAbiertas:
    licitaciones: int
    compra_agil: int
    #: Suma `compra_agil`: los cuatro tramos cubren cualquier cierre.
    compra_agil_por_cierre: PorCierre


async def contar_abiertas(db: AsyncSession, ahora: datetime | None = None) -> ConteoAbiertas:
    """Cuántas se pueden postular ahora, y las Compras Ágiles según cuándo cierran.

    La tira de cifras de la portada (`GET /publico/portada`, spec del rediseño
    §6.6). **Misma definición que el filtro `abiertas` del catálogo** —`activo`
    y `esta_abierta()`—, así que cada cifra es el total que lista
    `/licitaciones?abiertas=1` con su mecanismo.

    «No Compra Ágil» incluye Convenio Marco y Trato Directo si alguna vez se
    ingieren: la pregunta de la portada es «licitaciones» frente a «Compra
    Ágil». No es lo mismo que las candidatas de «Lo mejor de hoy», que además
    exigen más de 2 h hasta el cierre.

    El reparto por cierre (lectura 3 de la portada, docs/IDENTIDAD_Y_PORTADA_2026-10.md
    §3.5) cuenta **días de Chile**: una Compra Ágil que cierra a las 23:30 de
    Santiago cierra «hoy» aunque en UTC ya sea mañana. Los bordes se calculan en
    Python (`inicio_del_dia`); los tramos son contiguos y el último no tiene techo,
    así que **los cuatro suman `compra_agil`** con cualquier reloj. Sin cierre
    cuenta en «después».

    Una sola pasada por la tabla, con `count(*) FILTER`. `ahora` fija el reloj
    (tests); sin él, `now()` de Postgres y el día de `hoy_chile()`.
    """
    dia = ahora.astimezone(ZONA_CHILE).date() if ahora is not None else hoy_chile()
    manana, pasado, en_cuatro = (inicio_del_dia(dia + timedelta(days=n)) for n in (1, 2, 4))
    es_compra_agil = Licitacion.tipo_convocatoria == TipoConvocatoria.COMPRA_AGIL.value
    cierre = Licitacion.fecha_cierre
    fila = (
        await db.execute(
            select(
                func.count().filter(~es_compra_agil),
                func.count().filter(es_compra_agil),
                func.count().filter(es_compra_agil, cierre < manana),
                func.count().filter(es_compra_agil, cierre >= manana, cierre < pasado),
                func.count().filter(es_compra_agil, cierre >= pasado, cierre < en_cuatro),
                func.count().filter(es_compra_agil, or_(cierre.is_(None), cierre >= en_cuatro)),
            ).where(Licitacion.activo.is_(True), esta_abierta(ahora))
        )
    ).one()
    licitaciones, compra_agil, hoy, manana_n, dos_tres, despues = (int(n) for n in fila)
    return ConteoAbiertas(
        licitaciones=licitaciones,
        compra_agil=compra_agil,
        compra_agil_por_cierre=PorCierre(
            hoy=hoy, manana=manana_n, dos_tres_dias=dos_tres, despues=despues
        ),
    )


async def obtener(db: AsyncSession, licitacion_id: int) -> Licitacion | None:
    """Por id interno. Sólo activas."""
    return (await db.execute(_base().where(Licitacion.id == licitacion_id))).scalar_one_or_none()


async def obtener_por_codigo(db: AsyncSession, codigo_externo: str) -> Licitacion | None:
    """Por el código de Mercado Público, que es el que se ve en la URL."""
    return (
        await db.execute(_base().where(Licitacion.codigo_externo == codigo_externo))
    ).scalar_one_or_none()
