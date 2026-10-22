"""«Lo mejor de hoy en Compra Ágil»: candidatas, historia de la unidad y puntaje.

Spec del pivote §6.2 (paso 9), reordenado en el rediseño §8.1 (2026-10). **Es una
heurística, no un modelo**: todavía no hay verdad contra la que evaluarla (no
sabemos qué Compras Ágiles le convenía cotizar a nadie), así que no pasa por el
harness de evaluación ni pretende ser una probabilidad. Ordena; no predice.

Candidatas
----------
Compras Ágiles activas, abiertas (`esta_abierta()`) y que cierran en **más de
2 horas**: con menos no da tiempo a preparar una cotización, y ponerlas arriba
por ser «poco competidas» sería mandar a alguien a perder el tiempo. Una sin
fecha de cierre no se puede puntuar en tiempo y no entra.

Puntaje
-------
Producto de los factores de `EN_EL_PUNTAJE`, cada uno en [0, 1]. **Un factor sin
dato vale el neutro DE SU ESCALA** (la regla de `NEUTRO_POR_COMPONENTE` del
scorer de oportunidad).

- `competencia = 1 / (1 + cotizaciones recibidas)` — el único dato de
  competencia de una Compra Ágil abierta
  (`informacion_adicional.total_ofertas_recibidas`). Sin dato, 0,5 (= una).
  **No entra en el puntaje** (compuerta G1 del plan 0a, cerrada): el conteo no
  se refresca tras la primera ingesta y casi todas las abiertas dicen cero; se
  informa, no se pesa. Ver `EN_EL_PUNTAJE`.
- `comprador = percentil_ordenes` de la UNIDAD de compra en
  `analytics.compra_agil_unidad`: qué parte de las unidades con Compra Ágil
  emitió menos órdenes en la ventana de 6 meses. **Mide cuánto compra por
  Compra Ágil, no si adjudica lo que publica.** El cociente `órdenes /
  publicadas` que había antes saturaba en 1 para casi todos y era neutro para el
  resto, porque `publicadas` sólo se acumula desde el despliegue (2026-10-11).
  Tres casos, que NO son lo mismo:

  - **historia disponible y la unidad figura**: su percentil.
  - **historia disponible y la unidad NO figura**: 0. La tabla sólo tiene
    unidades con al menos una orden en la ventana, así que ausente = no compró
    nada en seis meses: es un dato, no la falta de uno, y no merece el neutro
    (quedaría por encima de la mitad de las unidades que sí compran).
  - **historia NO disponible todavía** (la tabla no existe o no tiene filas:
    entre el despliegue y la primera corrida semanal): 0,5, el neutro, y la
    respuesta lo dice con `historia_disponible = false` para que el frontend no
    afirme nada del comprador. Sin esto, 0 para todas haría que el orden dependiera
    sólo de tiempo × monto, y la tarjeta diría «sin historial» de compradores que sí lo tienen.
- `tiempo = min(1, horas hasta el cierre / 72)`. A 24 h saturaba más de la mitad
  de las candidatas (la mediana de cierre es 42 h, PIVOTE §6.1) y empataban.
- `monto = 0,5 + 0,5 · monto / (monto + 708.050)`, en [0,5; 1). **Pesa en el
  puntaje, no sólo desempata**: en los extremos de la instantánea (80.000 a
  7.215.100) el factor va de ~0,55 a ~0,96, hasta ~1,7× el puntaje con los demás
  factores iguales. Está porque el criterio de orden sólo se cumple con él: sin
  monto, mayor empate 6 y 37 puntajes distintos; con monto, 2 y 49 (medido el
  2026-10-14 sobre las 50 primeras; el empate de 6 eran seis Compras Ágiles del
  mismo comprador con el mismo cierre y sin cotizaciones). **Es una decisión de producto** —a igual esfuerzo de cotizar, más
  monto vale más— **y se revisa**, no una verdad medida. Sin monto, 0,75.

  **El tope de Compra Ágil vale lo mismo que sin monto (0,75).** El monto es el
  «disponible» que declara el comprador, y muchos declaran el tope legal (100 UTM)
  en vez de lo que piensan gastar: premiarlo ponía arriba a quien declaró el tope,
  no a la compra más grande (el 2026-10-16 las cinco primeras valían $7,2
  millones). La UTM cambia cada mes, así que el tope **se lee del dato**
  (`tope_compra_agil`): el mayor monto que declaran al menos `REPETICIONES_TOPE`
  (3) Compras Ágiles guardadas, abiertas o no. El tope se repite cientos de veces;
  un monto mal tipeado sobre él (72.151.000), una: con el máximo a secas, ese
  error subía la referencia y el tope dejaba de reconocerse en toda la lista, sin
  que nada fallara. En la copia local el mayor monto de agosto de 2026 es
  exactamente 100 UTM de agosto (7.164.900), y en la instantánea del 2026-10-14,
  100 UTM de octubre (7.215.100). Un monto a menos de `TOLERANCIA_TOPE` (2 %) del
  tope, por arriba o por abajo, ES el tope: cubre el del mes anterior (agosto queda a un 0,7 % de octubre;
  a principio de mes, el tope nuevo aún no se repite y el viejo hace de
  referencia) y los redondeos hacia abajo («7.200.000»), y deja fuera 7.000.000 (a
  un 3 %), un presupuesto redondo. Sólo cuentan montos desde `TOPE_MINIMO`: un
  monto chico repetido no es el tope. Sin ninguno que cumpla, no hay tope (pasa en
  una base con pocas Compras Ágiles: tests, desarrollo).

Orden: puntaje descendente; a igual puntaje (los ceros de las unidades ausentes
incluidos) tiempo × monto descendente —sólo como clave de orden, el puntaje no se
toca—; luego cierre ascendente y código. El criterio de que ordena
(mayor empate ≤ 5 y ≥ 30 puntajes distintos entre las 50 primeras) se mide sobre
una instantánea con el reloj fijo (`ahora`).

La historia se une por el RUT de la unidad (`rut_organismo` de la Compra Ágil =
`RutUnidadCompra` de las órdenes), sin pasar por el código del organismo: por
código, cada unidad heredaba la historia de su organismo entero (la FACh son 14
RUT bajo un solo código). `analytics.comprador_rut` sólo sirve ya al filtro
`codigo_organismo` de la ficha del comprador. LEFT JOIN: una unidad sin historia
sale igual, con `comprador` nulo: factor 0 si la historia está disponible (no
compró nada en la ventana) o neutro si aún no lo está. Una unidad que no se puede
casar con ninguna orden cuenta como «sin historia» y va al final. Sin analytics, la
lista sale entera y sin historia en vez de fallar.

`ahora` fija el reloj: en producción es `now()` de Postgres.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Float,
    Integer,
    and_,
    case,
    cast,
    column,
    func,
    literal,
    null,
    select,
    table,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tiempo import ZONA_CHILE
from app.models.convocatoria import TipoConvocatoria
from app.models.licitacion import Licitacion
from app.repositories.analytics import SCHEMA, existe_tabla
from app.repositories.licitaciones import coincide_termino, esta_abierta, referencia_reloj
from app.utils.rut import CEROS_INICIALES, FUERA_DE_RUT

#: Lo que vale un factor sin dato: el centro de su escala [0, 1].
#: El monto vive en [0,5; 1), así que su centro es 0,75.
NEUTRO_POR_FACTOR = {"competencia": 0.5, "comprador": 0.5, "tiempo": 0.5, "monto": 0.75}
#: El factor comprador de una unidad que NO figura en una `compra_agil_unidad`
#: poblada: no tuvo órdenes en la ventana, y eso es un dato, no un hueco.
COMPRADOR_SIN_ORDENES = 0.0
#: Los factores que viajan en la respuesta, y los que se multiplican.
FACTORES = ("competencia", "comprador", "tiempo", "monto")
#: Compuerta G1 del plan 0a, cerrada el 2026-10-15 (medida en producción, sólo
#: lectura): el conteo de cotizaciones NO se refresca después de la primera
#: ingesta. Queda congelado, casi siempre en 0, y un factor así no ordena y
#: miente a quien lo lee. Por eso la competencia se INFORMA (sigue en
#: `FACTORES`, viaja en la respuesta) pero NO pesa (rediseño §8.1.1), y el
#: frontend no muestra el conteo (`MOSTRAR_COTIZACIONES`). Mostrarlo exige antes
#: un refresco de las abiertas en el ETL (rama 5B; no existe y gasta cuota).
#: Volver a pesarla sería una decisión nueva.
EN_EL_PUNTAJE = tuple(f for f in FACTORES if f != "competencia")
#: Referencia de ESCALA, no un umbral: la mediana del monto TOTAL por orden de
#: Compra Ágil (OC 2025-10..2026-03, 365.299 órdenes), aplicada al monto
#: ESTIMADO de la Compra Ágil abierta (la mediana de las candidatas de la
#: instantánea, 775.000, la respalda). En ese monto el factor vale 0,75.
MONTO_REFERENCIA = 708_050.0
#: Un monto a menos de esta fracción del tope de Compra Ágil ES el tope: vale el
#: neutro. 2 %: más que lo que se mueve la UTM en un mes, menos que la distancia
#: de 7.000.000 (un presupuesto redondo) al tope de octubre de 2026.
TOLERANCIA_TOPE = 0.02
#: El tope es un monto que declaran muchas Compras Ágiles; un error de tipeo, una.
REPETICIONES_TOPE = 3
#: Por debajo de esto, un monto guardado no puede ser el tope de Compra Ágil
#: (100 UTM desde el 12-12-2024, Ley 21.634): ChileCompra lo cifraba en $6.669.200
#: en noviembre de 2024, y la UTM no ha hecho más que subir. No es el tope: es el
#: piso que lo distingue de un monto chico que se repite mucho (1.000.000).
TOPE_MINIMO = 6_000_000.0
#: Menos que esto hasta el cierre no da tiempo a cotizar.
HORAS_MINIMAS = 2
#: El factor tiempo satura aquí. A 24 h saturaba más de la mitad de las
#: candidatas (mediana de cierre: 42 h, PIVOTE §6.1) y empataban en 1.
HORAS_SATURACION = 72

#: Por organismo: la ficha pública del comprador (`services/publico/paginas.py`).
TABLA_HISTORIA = "compra_agil_comprador"
#: Por unidad (RUT): el puntaje.
TABLA_UNIDAD = "compra_agil_unidad"
TABLA_RUT = "comprador_rut"

_historia = table(
    TABLA_HISTORIA,
    column("CodigoOrganismoPublico"),
    column("ventana_desde"),
    column("ventana_hasta"),
    schema=SCHEMA,
)
_rut = table(TABLA_RUT, column("rut"), column("CodigoOrganismoPublico"), schema=SCHEMA)

#: La historia del ORGANISMO que sirve la ficha pública. No la usa el puntaje,
#: y no se toca: la importa `services/publico/paginas.py`.
CAMPOS_HISTORIA = (
    "ordenes",
    "publicadas",
    "proveedores_distintos",
    "cuota_lider_pct",
    "monto_p25",
    "monto_mediana",
    "monto_p75",
)

#: La historia de la UNIDAD que publica cada Compra Ágil.
CAMPOS_UNIDAD = (
    "ordenes",
    "proveedores_distintos",
    "cuota_lider_pct",
    "monto_p25",
    "monto_mediana",
    "monto_p75",
    "percentil_ordenes",
)

_unidad = table(
    TABLA_UNIDAD,
    column("rut"),
    *[column(c) for c in CAMPOS_UNIDAD],
    column("ventana_desde"),
    column("ventana_hasta"),
    schema=SCHEMA,
)


def _sin_ceros(rut):
    """Un RUT ya normalizado, sin ceros a la izquierda; NULL si no queda nada.

    La Compra Ágil puede traer `061.608.700-2` donde la orden dice `61.608.700-2`.
    El ETL ya escribe la clave sin ceros (`rut_normalizado`, la misma regla de
    `app.utils.rut`), pero `comprador_rut` materializada antes de ese cambio los
    conserva hasta la próxima corrida semanal: por eso se quitan de los DOS lados
    de cada unión, y con la tabla nueva la operación no cambia nada.

    `nullif`: `'0'` o `'000'` quedarían en `''`, y un RUT vacío de un lado se
    uniría con uno que sólo sean ceros del otro. NULL no se une con nada.
    """
    return func.nullif(func.regexp_replace(rut, CEROS_INICIALES, ""), "")


def _rut_normalizado(columna=None):
    """`app.utils.rut.normalizar_rut` en SQL; por defecto sobre `licitaciones.rut_organismo`."""
    columna = Licitacion.rut_organismo if columna is None else columna
    return _sin_ceros(func.regexp_replace(func.upper(columna), FUERA_DE_RUT, "", "g"))


def _ofertas_recibidas():
    """El conteo de cotizaciones, o NULL si no es un entero (o no viene).

    Como mucho nueve cifras: viene del payload de Mercado Público, y uno que no
    cabe en un `integer` hacía fallar el `CAST` —y con él la lista entera, un
    500— en vez de contar como ilegible.
    """
    texto = Licitacion.informacion_adicional["total_ofertas_recibidas"].astext
    return case((texto.op("~")("^[0-9]{1,9}$"), cast(texto, Integer)), else_=null())


def _ofertas_al():
    """Cuándo se escribió la fila por última vez (`fecha_actualizacion`).

    Es la mejor cota que hay de cuándo se vio el conteo de cotizaciones, pero no
    es una lectura garantizada: cualquier escritura de la fila la mueve.
    """
    return func.coalesce(Licitacion.fecha_actualizacion, Licitacion.fecha_extraccion)


def _horas_restantes(ahora: datetime | None = None):
    return func.extract("epoch", Licitacion.fecha_cierre - referencia_reloj(ahora)) / 3600.0


async def tope_compra_agil(db: AsyncSession) -> float | None:
    """El tope de Compra Ágil en pesos, o None si ningún monto lo parece.

    Es el mayor monto, desde `TOPE_MINIMO`, que declaran al menos
    `REPETICIONES_TOPE` Compras Ágiles guardadas. Sobre TODAS, no sobre las
    candidatas ni sobre lo filtrado: una búsqueda no cambia cuál es el tope. Una
    consulta aparte y no una subconsulta: así se lee una vez por petición, no una
    vez por cada sitio donde el factor monto aparece en la consulta grande.
    """
    monto = Licitacion.monto_estimado
    mayor = (
        await db.execute(
            select(monto)
            .where(
                Licitacion.tipo_convocatoria == TipoConvocatoria.COMPRA_AGIL.value,
                monto >= TOPE_MINIMO,
            )
            .group_by(monto)
            .having(func.count() >= REPETICIONES_TOPE)
            .order_by(monto.desc())
            .limit(1)
        )
    ).scalar()
    return float(mayor) if mayor is not None else None


def _es_tope(monto_estimado, tope: float | None):
    """¿El monto está a menos de un 2 % del tope? Falso, nunca NULL, sin tope o sin monto."""
    if tope is None:
        return literal(False)
    monto = cast(monto_estimado, Float)
    # A los dos lados: a principio de mes el tope nuevo (algo más alto) aún no se
    # repite y hace de referencia el viejo; muy por encima, es otra cosa (un error).
    return func.coalesce(
        monto.between(tope * (1.0 - TOLERANCIA_TOPE), tope * (1.0 + TOLERANCIA_TOPE)), False
    )


def _candidatas(ahora: datetime | None = None):
    return and_(
        Licitacion.activo.is_(True),
        Licitacion.tipo_convocatoria == TipoConvocatoria.COMPRA_AGIL.value,
        esta_abierta(ahora),
        Licitacion.fecha_cierre.is_not(None),
        _horas_restantes(ahora) > HORAS_MINIMAS,
    )


def _unidades():
    """Una fila por RUT SIN CEROS: la unidad con más órdenes (y, a igualdad, el RUT menor).

    El ETL es único por la cadena exacta, así que `0616087002` y `616087002`
    pueden convivir; sin esto, quitar los ceros al unir devolvía la misma Compra
    Ágil dos veces, con dos historias, ocupando dos puestos del ranking.
    """
    clave = _sin_ceros(_unidad.c.rut)
    return (
        select(clave.label("rut_sin_ceros"), *[_unidad.c[c] for c in CAMPOS_UNIDAD])
        .where(clave.is_not(None))
        .distinct(clave)
        .order_by(clave, _unidad.c.ordenes.desc().nulls_last(), _unidad.c.rut)
        .subquery("unidades")
    )


def _ruts():
    """Una fila por RUT sin ceros: el código de la variante más corta (la canónica)."""
    clave = _sin_ceros(_rut.c.rut)
    return (
        select(clave.label("rut_sin_ceros"), _rut.c.CodigoOrganismoPublico)
        .where(clave.is_not(None))
        .distinct(clave)
        .order_by(clave, func.length(_rut.c.rut), _rut.c.rut)
        .subquery("ruts")
    )


def _factores(
    ofertas, horas, percentil, monto_estimado, figura=None, es_tope=None
) -> dict[str, Any]:
    """Cada factor como expresión SQL en [0, 1], ya con su neutro.

    `percentil` es None cuando no hay historia por unidad (el neutro para todas).
    Con historia, `figura` dice si la unidad está en la tabla: si no figura vale
    `COMPRADOR_SIN_ORDENES`, no el neutro (ver el docstring del módulo).
    `es_tope` dice si el monto es el tope de Compra Ágil: si lo es, vale el neutro.
    """
    if es_tope is None:
        es_tope = literal(False)
    f_competencia = case(
        (ofertas.is_(None), NEUTRO_POR_FACTOR["competencia"]),
        else_=1.0 / (1.0 + ofertas),
    )
    if percentil is None:
        f_comprador = literal(NEUTRO_POR_FACTOR["comprador"], Float)
    else:
        f_comprador = case(
            (figura, func.coalesce(cast(percentil, Float), NEUTRO_POR_FACTOR["comprador"])),
            else_=COMPRADOR_SIN_ORDENES,
        )
    f_tiempo = func.least(1.0, horas / float(HORAS_SATURACION))
    monto = cast(monto_estimado, Float)
    # [0,5; 1): un monto chico no hunde a la Compra Ágil, sólo la deja detrás
    # de otra igual de buena y más grande. NULL > 0 es NULL: sin monto (o 0),
    # neutro. El neutro (0,75, el centro de la escala) queda sobre un monto real
    # muy chico (80.000 da 0,55): no saber no es peor que saber que es poco.
    # El tope de Compra Ágil no dice cuánto se va a comprar: vale lo que «sin monto».
    f_monto = case(
        (es_tope, NEUTRO_POR_FACTOR["monto"]),
        (monto > 0, 0.5 + 0.5 * monto / (monto + MONTO_REFERENCIA)),
        else_=NEUTRO_POR_FACTOR["monto"],
    )
    return {
        "competencia": cast(f_competencia, Float),
        "comprador": cast(f_comprador, Float),
        "tiempo": cast(f_tiempo, Float),
        "monto": cast(f_monto, Float),
    }


def _producto(factores: dict[str, Any]):
    puntaje = literal(1.0, Float)
    for nombre in EN_EL_PUNTAJE:
        puntaje = puntaje * factores[nombre]
    return puntaje


async def hay_historia_de_unidades(db: AsyncSession) -> bool:
    """¿Ya hay historia por unidad? La tabla existe Y tiene al menos una fila.

    Entre el despliegue de la API y la primera corrida semanal con este código,
    `compra_agil_unidad` no existe (o, tras un fallo a medias, está vacía): ahí no
    se sabe nada de ninguna unidad, y eso NO es «esta unidad no compra».
    """
    if not await existe_tabla(db, TABLA_UNIDAD):
        return False
    return (await db.execute(select(literal(1)).select_from(_unidad).limit(1))).first() is not None


async def destacadas(
    db: AsyncSession,
    *,
    limite: int,
    region: str | None = None,
    terminos: list[str] | None = None,
    codigo_organismo: str | None = None,
    ahora: datetime | None = None,
    con_historia: bool | None = None,
) -> list[dict[str, Any]]:
    """Las `limite` mejores candidatas, ya puntuadas. Una fila = un dict plano.

    `codigo_organismo` filtra por comprador (la página pública del comprador).
    Una Compra Ágil ingerida sólo trae el RUT, así que el código se alcanza por
    `analytics.comprador_rut`; **sin esa tabla no hay forma de saber de quién es
    cada una, y la respuesta es una lista vacía**, no un error.

    `con_historia` es el resultado de `hay_historia_de_unidades`; quien ya lo
    preguntó (el router, que además lo devuelve) lo pasa para no sondear dos veces.
    Con historia, una unidad que no figura vale `COMPRADOR_SIN_ORDENES`; sin ella,
    todas valen el neutro y ninguna lleva `tiene_historia`.
    """
    # Un código vacío o de espacios (`?codigo_organismo=`) es «sin filtro», no
    # «el comprador sin código»: comparado tal cual no casaba con nada y la
    # respuesta era una lista vacía.
    codigo_organismo = (codigo_organismo or "").strip() or None
    if con_historia is None:
        con_historia = await hay_historia_de_unidades(db)
    if codigo_organismo is not None and not await existe_tabla(db, TABLA_RUT):
        return []
    ofertas = _ofertas_recibidas()
    horas = _horas_restantes(ahora)

    unidades = _unidades() if con_historia else None
    if unidades is not None:
        historia = {c: unidades.c[c] for c in CAMPOS_UNIDAD}
        tiene_historia = unidades.c.rut_sin_ceros.is_not(None)
    else:
        historia = {c: null() for c in CAMPOS_UNIDAD}
        tiene_historia = literal(False)
    es_tope = _es_tope(Licitacion.monto_estimado, await tope_compra_agil(db))
    factores = _factores(
        ofertas,
        horas,
        historia["percentil_ordenes"] if unidades is not None else None,
        Licitacion.monto_estimado,
        tiene_historia if unidades is not None else None,
        es_tope,
    )
    puntaje = _producto(factores)

    consulta = select(
        Licitacion.codigo_externo,
        Licitacion.nombre,
        Licitacion.nombre_organismo,
        Licitacion.region,
        cast(Licitacion.monto_estimado, Float).label("monto_estimado"),
        es_tope.label("monto_es_tope"),
        Licitacion.fecha_publicacion,
        Licitacion.fecha_cierre,
        horas.label("horas_restantes"),
        ofertas.label("ofertas_recibidas"),
        _ofertas_al().label("ofertas_al"),
        tiene_historia.label("tiene_historia"),
        *[expr.label(nombre) for nombre, expr in historia.items()],
        *[expr.label(f"f_{nombre}") for nombre, expr in factores.items()],
        puntaje.label("puntaje"),
    )
    origen = Licitacion.__table__
    if unidades is not None:
        origen = origen.outerjoin(unidades, unidades.c.rut_sin_ceros == _rut_normalizado())
    ruts = _ruts() if codigo_organismo is not None else None
    if ruts is not None:
        origen = origen.join(ruts, ruts.c.rut_sin_ceros == _rut_normalizado())
    consulta = consulta.select_from(origen).where(_candidatas(ahora))
    if region:
        # Mismo criterio que el catálogo: la API manda regiones con espacios.
        consulta = consulta.where(func.trim(Licitacion.region) == region.strip())
    for termino in terminos or []:
        consulta = consulta.where(coincide_termino(termino))
    if codigo_organismo is not None:
        consulta = consulta.where(ruts.c.CodigoOrganismoPublico == codigo_organismo)

    # Empates (los ceros incluidos) por tiempo × monto: una unidad ausente da puntaje
    # 0 sea cual sea el tiempo o el monto, y sin esto el fondo quedaría por cierre.
    # Es sólo una clave de orden: el puntaje no se infla ni se muestra.
    consulta = consulta.order_by(
        puntaje.desc(),
        (factores["tiempo"] * factores["monto"]).desc(),
        Licitacion.fecha_cierre.asc(),
        Licitacion.codigo_externo.asc(),
    ).limit(limite)
    return [dict(fila) for fila in (await db.execute(consulta)).mappings().all()]


async def ventana(db: AsyncSession) -> tuple[date | None, date | None]:
    """La ventana de la historia; (None, None) sin analytics.

    Primero la de las unidades; si todavía no existe (entre el despliegue y la
    primera corrida semanal), la de los organismos: es la misma corrida.
    """
    for tabla in (_unidad, _historia):
        if not await existe_tabla(db, tabla.name):
            continue
        fila = (
            await db.execute(
                select(tabla.c.ventana_desde, tabla.c.ventana_hasta)
                .where(tabla.c.ventana_desde.is_not(None))
                .limit(1)
            )
        ).first()
        if fila:
            return fila[0], fila[1]
    return None, None


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
