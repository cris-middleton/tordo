"""Punto de entrada de los dos cron de Railway.

    uv run python -m etl.cron frecuente [--forzar]
    uv run python -m etl.cron semanal

Sustituye a las tareas de Celery que vivían en `backend/app/tasks/etl_tasks.py`
(retiradas en el paso 5 del pivote), y su `watchdog` de cada 30 minutos lo
sustituye el latido. Ver §3.1 de `docs/PIVOTE_PUBLICO_2026-10.md`.

**`frecuente` se dispara cada hora en UTC y decide él si le toca.** Railway
programa en UTC y Chile cambia de hora dos veces al año: un horario fijo en UTC
correría una hora tarde medio año. Le toca a las 10, 13, 16 y 19 h de Santiago
de lunes a viernes, y a las 12 h el fin de semana; si no, sale con 0 en
segundos, sin red ni base. `--forzar` se salta la puerta.

**`semanal`** reconstruye analytics: descarga masiva de los últimos tres meses,
módulos Polars y materialización en Postgres; al final purga del catálogo lo que
ya no se sirve (`etl/retencion.py`). Va en un servicio aparte porque
Railway descarta una ejecución si la anterior sigue activa, y un reconstruido de
domingo se comería las corridas de Compra Ágil.

**Latido** (Healthchecks.io): `LATIDO_URL_FRECUENTE` y `LATIDO_URL_SEMANAL`.
`/start` al empezar, la URL sola al terminar bien, `/fail` con la cola del error
al fallar. Un ping que falla no tumba la corrida, y salir por la puerta horaria
no es una corrida: no hace ping.

Todo corre en proceso, llamando al código del ETL. Las tareas de Celery lo
hacían con `subprocess` hacia `main.py` (deuda F2), y la única razón para
mantenerlo —aislar la memoria del worker— desaparece con el worker.
"""

from __future__ import annotations

import argparse
import collections
import contextlib
import logging
import os
import sys
import traceback
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx

from etl import almacen, retencion
from etl import main as etl
from etl.analytics import materialize, run_all
from etl.analytics.config import DATA_DIR
from etl.analytics.data_loader import VENTANA_ANALYTICS_MESES
from etl.extractors.compra_agil import CuotaDiariaAgotada
from etl.loaders.analytics_catalog import CATALOGO
from etl.scripts import descargar_datos_masivos as descarga
from etl.shared_imports import TipoConvocatoria

logger = logging.getLogger("etl.cron")

#: El reloj del producto es el de Chile (`backend/app/core/tiempo.py`). Nunca
#: `date.today()`: en el contenedor es UTC.
ZONA_CHILE = ZoneInfo("America/Santiago")

#: Horas de Santiago en que le toca a `frecuente`. Compra Ágil publica el 95 %
#: entre 08 y 18 h y ninguna cierra antes de 24 h (§6.1): cuatro corridas dejan
#: que nada espere más de ~3 h para aparecer.
HORAS_HABILES = (10, 13, 16, 19)
HORAS_FIN_DE_SEMANA = (12,)

#: Lo que la ventana de Compra Ágil retrocede más allá de la corrida anterior:
#: cubre que ésta haya llegado tarde o que la API publique con retraso.
SOLAPE = timedelta(hours=1)

#: Lo más atrás que una corrida mira para recuperar una caída del cron (ver
#: `ventana_compra_agil`). Con tope porque la cuota de Compra Ágil es diaria y
#: el listado se escribe entero al final: si una ventana enorme agotara la cuota
#: a medias no quedaría nada escrito, y la corrida siguiente volvería a pedir la
#: misma ventana, cada día. 72 h son una vez y media la ventana más larga de una
#: corrida normal (~47 h, la primera del lunes o del martes).
RECUPERACION_COMPRA_AGIL = timedelta(hours=72)

#: Lo mismo para el barrido de licitaciones, en días. Cada día es una petición
#: de listado más el detalle de lo nuevo que siga publicado (~500 al día contra
#: 10.000 de cuota de la API clásica).
DIAS_RECUPERACION_LICITACIONES = 5

#: Cuánto del error viaja en el /fail. Healthchecks guarda 10 kB por ping;
#: la cola es lo que dice qué pasó.
MAX_CUERPO_FAIL = 2000

#: La re-consulta de resultados: licitaciones cerradas en los últimos
#: `DIAS_RESULTADOS` sin adjudicación conocida, como mucho
#: `TOPE_RESULTADOS_DIARIO` al día (una vez, en la primera corrida), y ninguna
#: antes de `REINTENTO_RESULTADOS` desde la última vez que se preguntó.
#:
#: El tope es el 5 % de la cuota diaria de la API clásica (10.000, §5.3). Cierran
#: del orden de 500 licitaciones al día, así que cada una se pregunta ~una vez
#: dentro de la ventana, priorizando las nunca consultadas y, entre ellas, las
#: que cerraron antes. 30 días porque la adjudicación llega días o semanas
#: después del cierre; lo que tarde más queda para la descarga masiva.
DIAS_RESULTADOS = 30
TOPE_RESULTADOS_DIARIO = 500
REINTENTO_RESULTADOS = timedelta(days=3)

#: Meses que la semanal vuelve a descargar: ChileCompra regenera los ZIPs de
#: varios meses recientes en cada tanda, cada 2–4 semanas.
MESES_A_REDESCARGAR = 3

#: Meses de `consolidated/` que viven en R2 y se bajan cada semana: la ventana
#: de analytics (36; las bandas de precio leen 12, dentro de ella) más los que se
#: rehacen. La ventana se ancla en el último período con DATOS, que va a lo sumo
#: unas semanas detrás del mes en curso: con este margen, el último período de
#: datos y sus 36 meses caen dentro. Medido sobre la descarga masiva entera:
#: 2007–2026 son ~26 GB (18 de OC, 8 de LIC) y la capa gratuita de R2 son 10 GB;
#: 39 meses son ~4,5 GB. Ver `etl/almacen.py`.
MESES_EN_R2 = VENTANA_ANALYTICS_MESES + MESES_A_REDESCARGAR


TIPO_COMPRA_AGIL = TipoConvocatoria.COMPRA_AGIL.value
TIPO_LICITACION = TipoConvocatoria.LICITACION.value


# ── El calendario ────────────────────────────────────────────────────────────


def horas_programadas(dia: date) -> tuple[int, ...]:
    return HORAS_HABILES if dia.weekday() < 5 else HORAS_FIN_DE_SEMANA


def _en_chile(instante: datetime) -> datetime:
    return instante.astimezone(ZONA_CHILE)


def le_toca(instante: datetime) -> bool:
    """¿Es `instante` una de las horas de `frecuente`? Cuenta la hora, no el minuto."""
    local = _en_chile(instante)
    return local.hour in horas_programadas(local.date())


def es_primera_del_dia(instante: datetime) -> bool:
    local = _en_chile(instante)
    return local.hour == horas_programadas(local.date())[0]


def primera_de_ayer(instante: datetime) -> datetime:
    """La primera corrida programada del día anterior al de `instante`, en Chile."""
    ayer = _en_chile(instante).date() - timedelta(days=1)
    hora = instante
    while True:
        hora = corrida_anterior(hora)
        if hora.date() < ayer:  # pragma: no cover — siempre hay una ayer
            raise AssertionError(f"ninguna corrida programada el {ayer}")
        if hora.date() == ayer and es_primera_del_dia(hora):
            return hora


def corrida_anterior(instante: datetime) -> datetime:
    """La última hora programada ESTRICTAMENTE anterior a la hora de `instante`.

    Se retrocede de hora en hora en UTC y se mira la hora de Chile de cada una:
    así el cambio de hora no se salta ni repite ninguna.
    """
    hora = instante.astimezone(UTC).replace(minute=0, second=0, microsecond=0)
    for _ in range(8 * 24):
        hora -= timedelta(hours=1)
        if le_toca(hora):
            return _en_chile(hora)
    raise AssertionError("ninguna hora programada en ocho días")  # pragma: no cover


def primera_de_hoy(instante: datetime) -> datetime:
    """La hora de la primera corrida programada del día de `instante`, en Chile."""
    dia = _en_chile(instante).date()
    return datetime.combine(dia, time(horas_programadas(dia)[0]), tzinfo=ZONA_CHILE)


def ventana_compra_agil(
    instante: datetime, ultima_escritura: datetime | None = None
) -> tuple[datetime, datetime]:
    """[desde, hasta) del listado de Compra Ágil, en hora de Chile y sin zona.

    Desde la corrida programada anterior menos `SOLAPE`; en la primera del día,
    desde la anterior a la primera de ayer.

    **Y nunca después de la última Compra Ágil escrita** (menos `SOLAPE`, con
    tope `RECUPERACION_COMPRA_AGIL`). Las ventanas toleran que falle UNA
    corrida; si el cron no corre durante días —el 2026-10-21 Railway pausó los
    servicios tras un incidente de seguridad—, lo que cambió entre la última
    corrida buena y la primera que vuelve no lo miraba nadie. La última
    escritura en Postgres es el estado que dice dónde se quedó el catálogo: con
    el cron sano es de la corrida anterior y no cambia nada.

    Sin zona porque la API las espera así: sus marcas son de Chile aunque digan
    `Z` (§6.1). La aritmética se hace en tiempo real, no de reloj, para que el
    día del cambio de hora la ventana no pierda ni gane una hora.
    """
    # La primera del día parte de la corrida anterior a la primera de AYER:
    # ~42 h en sábado o domingo, ~47 h en lunes o martes. Así recoge tanto una
    # corrida intermedia que falló entera como la primera de ayer, cuya ventana
    # nadie más cubría. Antes eran 26 h fijas, que llegan justo hasta la primera
    # de ayer: si ésa fallaba, lo que cambió entre la última de anteayer y ella
    # se perdía. No se guarda cuál fue la última corrida BUENA (no hay dónde sin
    # añadir estado), así que dos primeras del día seguidas fallidas sí dejan
    # hueco. La inserción es idempotente: lo repetido cuesta peticiones, y lo que
    # se añade son sobre todo horas de noche, con pocos cambios.
    referencia = primera_de_ayer(instante) if es_primera_del_dia(instante) else instante
    desde = corrida_anterior(referencia).astimezone(UTC) - SOLAPE
    if ultima_escritura is not None:
        recuperar = max(
            ultima_escritura.astimezone(UTC) - SOLAPE,
            instante.astimezone(UTC) - RECUPERACION_COMPRA_AGIL,
        )
        if recuperar < desde:
            logger.warning(
                "frecuente: la última Compra Ágil se escribió el %s; la ventana se "
                "amplía para recuperar la caída",
                _en_chile(ultima_escritura).strftime("%Y-%m-%d %H:%M"),
            )
            desde = recuperar
    return (
        _en_chile(desde).replace(tzinfo=None),
        _en_chile(instante).replace(tzinfo=None),
    )


def dias_del_barrido(
    instante: datetime, ultima_escritura: datetime | None = None
) -> tuple[date, date] | None:
    """Los días (desde, hasta) de licitaciones que barre esta corrida, o None.

    La primera del día barre anteayer y ayer. **Tras una caída barre desde el
    día de la última licitación escrita** (con tope
    `DIAS_RECUPERACION_LICITACIONES`), y si la primera de hoy no escribió nada
    —no corrió, o la API no respondió—, barre la corrida que venga en su lugar:
    si no, la de mañana encontraría ya escrito lo de hoy y no sabría que hubo
    una caída.
    """
    hoy = _en_chile(instante).date()
    ayer, anteayer = hoy - timedelta(days=1), hoy - timedelta(days=2)
    primera = es_primera_del_dia(instante)
    if ultima_escritura is None:
        return (anteayer, ayer) if primera else None
    if not primera and ultima_escritura >= primera_de_hoy(instante):
        return None
    desde = max(
        min(anteayer, _en_chile(ultima_escritura).date()),
        hoy - timedelta(days=DIAS_RECUPERACION_LICITACIONES),
    )
    return desde, ayer


def periodos_recientes(instante: datetime, n_meses: int) -> list[tuple[int, int]]:
    """Los últimos `n_meses` (año, mes) hasta el mes de `instante`, en Chile."""
    local = _en_chile(instante)
    indice = local.year * 12 + local.month - 1
    return [(i // 12, i % 12 + 1) for i in range(indice - n_meses + 1, indice + 1)]


# ── Las corridas ─────────────────────────────────────────────────────────────


@dataclass
class PasosFrecuente:
    """Las piezas del ETL que usa `frecuente`. Inyectables para los tests."""

    compra_agil: Callable[[datetime, datetime], bool]
    licitaciones: Callable[[str], bool]
    detalles_nuevos: Callable[[], bool]
    barrido: Callable[[str, str], bool]
    resultados: Callable[[], bool]
    revalidar: Callable[[list[str]], object] = lambda _etiquetas: None
    #: Por `tipo_convocatoria`, la última vez que se escribió una fila. Vacío si
    #: no se pudo leer: la corrida sigue con las ventanas de siempre.
    ultimas_escrituras: Callable[[], Mapping[str, datetime]] = dict

    @classmethod
    def reales(cls) -> PasosFrecuente:
        return cls(
            compra_agil=_compra_agil,
            licitaciones=lambda dia: etl.run_etl_licitaciones_v2(dia, dia),
            detalles_nuevos=etl.run_etl_extraer_detalles_nuevos_licitaciones,
            # Lo que hacía la diaria de las 02:00: licitaciones de los días
            # anteriores con sus detalles. Compra Ágil no: su ventana ya la cubre.
            barrido=lambda desde, hasta: etl.run_etl_pipeline_v2(
                fecha_desde=desde, fecha_hasta=hasta, extract_compra_agil=False
            ),
            resultados=lambda: etl.run_etl_resultados_licitaciones(
                dias=DIAS_RESULTADOS,
                limite=TOPE_RESULTADOS_DIARIO,
                reintento=REINTENTO_RESULTADOS,
            ),
            revalidar=Revalidador.desde_entorno().revalidar,
            ultimas_escrituras=etl.ultimas_escrituras,
        )


def _compra_agil(desde: datetime, hasta: datetime) -> bool:
    """El ETL de Compra Ágil, con la cuota agotada contada como FALLO.

    En Celery era un aviso: la cuota vuelve mañana. Aquí nadie mira el worker,
    y si el latido diera la corrida por buena el ranking «de hoy» se quedaría
    quieto sin que nadie se enterase. El mensaje es el que llega en el /fail.
    """
    try:
        return etl.run_etl_compra_agil(
            cambio_desde=desde, cambio_hasta=hasta, cuota_agotada_es_fallo=True
        )
    except CuotaDiariaAgotada as exc:
        logger.error("cuota diaria de Compra Ágil agotada; se restablece mañana (%s)", exc)
        return False


def correr_frecuente(instante: datetime, pasos: PasosFrecuente) -> bool:
    """Compra Ágil, licitaciones de hoy, detalles nuevos y, a primera hora, el
    barrido de anteayer y ayer y la re-consulta de resultados.

    El barrido cubre DOS días por lo mismo que la ventana de Compra Ágil mira
    más allá de la primera de ayer: si ésa falló, su barrido de anteayer no se
    hizo. Cuesta una petición de listado más (el detalle sólo se pide de lo
    nuevo).

    Tras una caída del cron, las dos ventanas parten de la última escritura en
    Postgres (`ventana_compra_agil`, `dias_del_barrido`).

    **El listado de Compra Ágil va primero** (§5.3): nada de lo que venga
    después puede dejarlo sin cuota. La re-consulta de resultados, la más
    prescindible, va la última y sólo una vez al día. Un paso que falla no corta los siguientes
    —son independientes—, pero la corrida queda como fallida.
    """
    hoy = _en_chile(instante).date()
    # Antes de escribir nada: lo que escriba esta corrida taparía la caída.
    ultimas = pasos.ultimas_escrituras()
    desde, hasta = ventana_compra_agil(instante, ultimas.get(TIPO_COMPRA_AGIL))
    barrido = dias_del_barrido(instante, ultimas.get(TIPO_LICITACION))
    logger.info("frecuente: Compra Ágil entre %s y %s", desde, hasta)

    resultados = [
        pasos.compra_agil(desde, hasta),
        pasos.licitaciones(hoy.isoformat()),
        pasos.detalles_nuevos(),
    ]
    if barrido:
        primero, ultimo = (dia.isoformat() for dia in barrido)
        logger.info("frecuente: barrido de licitaciones de %s a %s", primero, ultimo)
        resultados.append(pasos.barrido(primero, ultimo))
    if es_primera_del_dia(instante):
        logger.info("frecuente: re-consulta de resultados de licitaciones cerradas")
        resultados.append(pasos.resultados())
    # Al final y pase lo que pase con los pasos: lo que sí entró merece verse.
    # No cuenta para el resultado (ver `Revalidador`).
    pasos.revalidar(ETIQUETAS_FRECUENTE)
    return all(resultados)


#: Por tipo (`oc`, `lic`), los meses que tenían consolidado antes de purgarlos.
ConDatos = Mapping[str, set[tuple[int, int]]]


@dataclass
class Materializacion:
    """Qué tablas de `analytics.*` se reemplazaron y cuáles fallaron."""

    hechas: list[str]
    fallidas: list[str]


@dataclass
class PasosSemanal:
    bajar: Callable[[], int]
    purgar: Callable[[list[tuple[int, int]]], ConDatos]
    descargar: Callable[[list[tuple[int, int]], ConDatos], bool]
    analytics: Callable[[], list[str]]
    materializar: Callable[[], Materializacion]
    subir: Callable[[], int]
    retener: Callable[[datetime], object]
    revalidar: Callable[[list[str]], object] = lambda _etiquetas: None

    @classmethod
    def reales(cls, instante: datetime) -> PasosSemanal:
        # Falla AQUÍ si `ETL_ALMACEN` falta o le faltan credenciales: antes de
        # descargar nada, y con un /fail que dice qué variable es.
        destino = almacen.desde_entorno(
            DATA_DIR, conservar=conservar_ventana(periodos_recientes(instante, MESES_EN_R2))
        )
        return cls(
            bajar=destino.bajar,
            purgar=_purgar,
            descargar=_descargar,
            analytics=run_all.ejecutar_todos,
            materializar=_materializar,
            subir=destino.subir,
            retener=retencion.purgar_catalogo,
            revalidar=Revalidador.desde_entorno().revalidar,
        )


def conservar_ventana(meses: list[tuple[int, int]]) -> almacen.Conservar:
    """Qué se queda en R2: los consolidados de esos meses, y todo lo que no sea
    un consolidado mensual (`analytics/`, o un nombre que no se entiende)."""
    dentro = set(meses)

    def conservar(clave: str) -> bool:
        partes = clave.split("/")
        if len(partes) != 3 or partes[0] != "consolidated" or not partes[2].endswith(".parquet"):
            return True
        try:
            anio, mes = (int(x) for x in partes[2].removesuffix(".parquet").split("-"))
        except ValueError:
            return True
        return (anio, mes) in dentro

    return conservar


TIPOS_MASIVOS = ("oc", "lic")


def _consolidado(tipo: str, periodo: tuple[int, int]) -> Path:
    anio, mes = periodo
    return descarga.CONSOLIDATED_DIR / tipo / f"{anio}-{mes}.parquet"


def _purgar(periodos: list[tuple[int, int]]) -> dict[str, set[tuple[int, int]]]:
    """Borra los ZIPs Y los consolidados de esos meses, para rehacerlos.

    Sólo los ZIPs no bastaba: `consolidar_tipo` se salta un mes cuyo parquet ya
    existe, así que el ZIP nuevo se bajaba y nunca llegaba a analytics — lo que
    ChileCompra corrige de los meses recientes no entraba jamás.

    Devuelve, por tipo, los meses que TENÍAN datos: de ésos, un 404 al
    re-bajarlos no es «aún no publicado» (ver `_descargar`).
    """
    con_datos: dict[str, set[tuple[int, int]]] = {tipo: set() for tipo in TIPOS_MASIVOS}
    for tipo in TIPOS_MASIVOS:
        for anio, mes in periodos:
            for ruta in (
                descarga.RAW_DIR / tipo / f"{anio}-{mes}.zip",
                _consolidado(tipo, (anio, mes)),
            ):
                if ruta.exists():
                    con_datos[tipo].add((anio, mes))
                    ruta.unlink()
                    logger.info("semanal: borrado %s", ruta)
    return con_datos


def _descargar(periodos: list[tuple[int, int]], con_datos: ConDatos) -> bool:
    """Descarga y consolida, de OC y LIC, los meses de `periodos` sin consolidado.

    Recibe la ventana entera: lo que `bajar` trajo de R2 se salta, y lo que se
    purgó para rehacerlo, no. Así la primera corrida, con R2 vacío, llena la
    ventana completa, y las siguientes bajan sólo los meses recientes.

    **Termina bien sólo si cada mes de la ventana tiene su consolidado**, salvo
    un 404 de un mes reciente (los `MESES_A_REDESCARGAR` últimos) que no tenía
    datos antes de purgar: es un mes que ChileCompra aún no publica — el en
    curso, o el anterior en los primeros días del mes. Falla con:

    - un timeout, un 5xx o una conexión cortada (antes se contaban como 404);
    - un 404 de un mes que SÍ tenía datos: se purgó y no se pudo rehacer;
    - un 404 de un mes viejo: ChileCompra lo tiene desde siempre;
    - un ZIP que no se puede leer (antes `consolidar_tipo` devolvía la carpeta
      igual y el mes quedaba sin parquet).

    Sin esto, la semanal reconstruía y publicaba analytics con un agujero, y el
    latido daba verde.
    """
    recientes = set(periodos[-MESES_A_REDESCARGAR:])
    ok = True
    for tipo in TIPOS_MASIVOS:
        faltan = [p for p in periodos if not _consolidado(tipo, p).exists()]
        logger.info("semanal: %s, %d meses por descargar", tipo, len(faltan))
        resultado = descarga.descargar_tipo(tipo, faltan)
        if resultado["fallidos"]:
            logger.error("semanal: %s, falló la descarga de %s", tipo, resultado["fallidos"])
            ok = False
        aun_no = {
            p
            for p in resultado["no_publicados"]
            if p in recientes and p not in con_datos.get(tipo, set())
        }
        if aun_no:
            logger.info("semanal: %s, aún no publicados: %s", tipo, sorted(aun_no))
        if resultado["ok"] and descarga.consolidar_tipo(tipo) is None:
            logger.error("semanal: %s, algún ZIP no se pudo consolidar", tipo)
            ok = False
        sin_consolidado = [
            p for p in periodos if p not in aun_no and not _consolidado(tipo, p).exists()
        ]
        if sin_consolidado:
            logger.error(
                "semanal: %s, la ventana queda sin %s; no se reconstruye analytics",
                tipo,
                sin_consolidado,
            )
            ok = False
    return ok


def _materializar() -> Materializacion:
    """`materialize` tabla por tabla, para saber cuáles se reemplazaron.

    `materialize.main` devuelve un solo código para todas: con una tabla rota,
    la semanal no sabía si las demás habían entrado y no revalidaba nada, y las
    páginas públicas se quedaban una semana con lo anterior aunque sus tablas sí
    se hubieran actualizado. Una tabla sin parquet cuenta como hecha, como en
    `main` (no hay nada nuevo que llevar, y no es un fallo).
    """
    hechas: list[str] = []
    fallidas: list[str] = []
    for spec in CATALOGO:
        (hechas if materialize.main(["--solo", spec.tabla]) == 0 else fallidas).append(spec.tabla)
    if fallidas:
        logger.error("semanal: no se materializaron %s", ", ".join(fallidas))
    return Materializacion(hechas=hechas, fallidas=fallidas)


def correr_semanal(instante: datetime, pasos: PasosSemanal) -> bool:
    """Lo que hacía `run_bulk_semanal`, más la materialización a Postgres.

    `run_all` sólo escribe parquets: sin materializar, la API seguiría sirviendo
    el análisis de la semana anterior.
    """
    periodos = periodos_recientes(instante, MESES_A_REDESCARGAR)
    ventana = periodos_recientes(instante, MESES_EN_R2)
    logger.info("semanal: se rehacen %s; ventana desde %s", periodos, ventana[0])

    # La historia vive en R2 (`etl/almacen.py`): el contenedor arranca vacío.
    pasos.bajar()
    con_datos = pasos.purgar(periodos)
    if not pasos.descargar(ventana, con_datos):
        # Los meses ya están purgados en local: reconstruir ahora sería hacerlo
        # sin ellos y publicar un análisis con un agujero. Tampoco se sube nada,
        # así que el bucket conserva la versión anterior intacta.
        return False

    fallidos = pasos.analytics()
    if fallidos:
        logger.error("semanal: módulos de analytics fallidos: %s", ", ".join(fallidos))
    # Se materializa igual: un módulo roto deja su parquet de la semana pasada,
    # y lo que sí se reconstruyó merece llegar a la API.
    materializacion = pasos.materializar()
    materializado = not materializacion.fallidas
    if materializacion.hechas:
        # Las páginas públicas salen de `analytics.*`: sin esto seguirían
        # mostrando la semana anterior hasta que caducara su caché. Basta con
        # una tabla nueva —la etiqueta es una sola para todo analytics—; la que
        # falló sigue sirviendo la semana anterior y la corrida termina en /fail.
        pasos.revalidar(ETIQUETAS_SEMANAL)
    # Y se sube igual: los consolidados nuevos valen aunque un módulo fallara.
    pasos.subir()

    # La retención del catálogo (`etl/retencion.py`), al final y con guarda:
    # `compra_agil_mensual` acumula `publicadas` leyendo la Compra Ágil de
    # Postgres, así que sólo se purga si acaba de contarla Y su parquet ya está
    # en R2 (un `subir` que falla lanza y no llega aquí). Si no, la Compra Ágil
    # espera una semana más: crecer siete días es barato, perder un mes no.
    if "compra_agil_mensual" in fallidos:
        logger.error("semanal: sin retención — compra_agil_mensual no terminó")
        return False
    try:
        pasos.retener(instante)
    except Exception:
        logger.exception("semanal: la retención del catálogo falló")
        return False
    return materializado and not fallidos


# ── Latido ───────────────────────────────────────────────────────────────────


def url_latido(comando: str) -> str:
    return os.environ.get(f"LATIDO_URL_{comando.upper()}", "").strip().rstrip("/")


class Latido:
    """Pings a Healthchecks.io. Nunca lanza: un latido roto no es una corrida rota."""

    def __init__(self, url: str, cliente: httpx.Client | None = None):
        self.url = url
        self.cliente = cliente or httpx.Client(timeout=10)

    def inicio(self) -> None:
        self._ping("/start")

    def exito(self) -> None:
        self._ping("")

    def fallo(self, detalle: str) -> None:
        self._ping("/fail", detalle[-MAX_CUERPO_FAIL:])

    def cerrar(self) -> None:
        self.cliente.close()

    def _ping(self, sufijo: str, cuerpo: str = "") -> None:
        if not self.url:
            # No es una credencial: no hay valor por defecto que inventar, pero
            # sin él nadie se entera de que el cron dejó de correr.
            logger.warning("latido: sin LATIDO_URL_* — ping%s omitido", sufijo or " de éxito")
            return
        try:
            self.cliente.post(self.url + sufijo, content=cuerpo.encode()).raise_for_status()
        except Exception as exc:
            logger.warning("latido: falló el ping%s: %s", sufijo, exc)


# ── Revalidación de las páginas de Vercel ────────────────────────────────────

#: Lo que cada cron revalida en Next (`frontend/app/api/revalidar`): el contrato
#: es la etiqueta, no la ruta. La semanal, todo lo que sale de analytics; la
#: frecuente, lo que depende de la Compra Ágil abierta.
ETIQUETAS_SEMANAL = ["analytics"]
ETIQUETAS_FRECUENTE = ["compra-agil"]


class Revalidador:
    """Pide a Next que regenere las páginas de unas etiquetas. Nunca lanza.

    `POST REVALIDAR_URL` (la URL completa de `/api/revalidar`) con la cabecera
    `X-Revalidar-Secreto` y `{"etiquetas": [...]}`. Next responde 200 con
    `{"revalidadas": [...]}`; 401 con el secreto mal, 400 con el cuerpo mal y 503
    si Next no tiene secreto configurado.

    **Un fallo no tumba la corrida**: los datos ya están en Postgres y la página
    sólo se queda vieja hasta la próxima revalidación. Se registra en ERROR para
    que se vea. Sin las dos variables (en local) no hace nada.
    """

    def __init__(self, url: str, secreto: str, cliente: httpx.Client | None = None):
        self.url = url
        self.secreto = secreto
        self.cliente = cliente or httpx.Client(timeout=30)

    @classmethod
    def desde_entorno(cls, entorno: Mapping[str, str] = os.environ) -> Revalidador:
        return cls(
            (entorno.get("REVALIDAR_URL") or "").strip(),
            (entorno.get("REVALIDAR_SECRETO") or "").strip(),
        )

    def revalidar(self, etiquetas: list[str]) -> bool:
        if not (self.url and self.secreto):
            logger.info(
                "revalidación: sin REVALIDAR_URL o REVALIDAR_SECRETO — %s omitida", etiquetas
            )
            return False
        try:
            respuesta = self.cliente.post(
                self.url,
                json={"etiquetas": etiquetas},
                headers={"X-Revalidar-Secreto": self.secreto},
            )
        except Exception as exc:
            logger.error("revalidación de %s: Next no respondió: %s", etiquetas, exc)
            return False
        if respuesta.status_code == 200:
            logger.info("revalidación: %s", respuesta.text[:200])
            return True
        motivo = {
            401: "secreto rechazado: REVALIDAR_SECRETO no coincide con el de Vercel",
            400: "cuerpo rechazado",
            503: "Next no tiene REVALIDAR_SECRETO configurado",
        }.get(respuesta.status_code, "respuesta inesperada")
        logger.error("revalidación de %s: HTTP %d, %s", etiquetas, respuesta.status_code, motivo)
        return False


class _ColaDeErrores(logging.Handler):
    """Guarda los últimos avisos y errores: los pasos del ETL los registran y
    devuelven `False`, así que la causa de un fallo vive en el log."""

    def __init__(self, maximo: int = 50):
        super().__init__(level=logging.WARNING)
        self.registros: collections.deque[str] = collections.deque(maxlen=maximo)

    def emit(self, record: logging.LogRecord) -> None:
        # El log nunca tumba la corrida.
        with contextlib.suppress(Exception):
            self.registros.append(f"{record.levelname} {record.name}: {record.getMessage()}")

    def texto(self) -> str:
        return "\n".join(self.registros)


# ── Orquestación ─────────────────────────────────────────────────────────────

Corrida = Callable[[datetime], bool]


def _corridas_reales() -> dict[str, Corrida]:
    return {
        "frecuente": lambda instante: correr_frecuente(instante, PasosFrecuente.reales()),
        "semanal": lambda instante: correr_semanal(instante, PasosSemanal.reales(instante)),
    }


def ejecutar(
    comando: str,
    *,
    forzar: bool = False,
    ahora: Callable[[], datetime] = lambda: datetime.now(ZONA_CHILE),
    corridas: dict[str, Corrida] | None = None,
    latido: Latido | None = None,
) -> int:
    """Corre `comando` con su latido y devuelve el código de salida."""
    instante = ahora()
    if comando == "frecuente" and not forzar and not le_toca(instante):
        logger.info(
            "frecuente: no le toca a las %s de Chile", _en_chile(instante).strftime("%H:%M")
        )
        return 0

    corrida = (corridas or _corridas_reales())[comando]
    latido = latido or Latido(url_latido(comando))
    cola = _ColaDeErrores()
    logging.getLogger().addHandler(cola)
    try:
        latido.inicio()
        try:
            ok = corrida(instante)
            detalle = cola.texto() or "la corrida terminó con errores"
        except Exception:
            logger.exception("%s: la corrida reventó", comando)
            ok = False
            detalle = cola.texto() + "\n" + traceback.format_exc()
        if ok:
            latido.exito()
            logger.info("%s: terminada", comando)
            return 0
        latido.fallo(detalle)
        logger.error("%s: terminada con errores", comando)
        return 1
    finally:
        logging.getLogger().removeHandler(cola)
        latido.cerrar()


def configurar_log() -> None:
    """Log a stdout, que es lo único que guarda Railway.

    Importar `etl.main` ya lo configura, pero como efecto secundario: si eso
    cambia, los INFO dejarían de salir y `_ColaDeErrores` —que cuelga de la
    raíz— no vería nada. No pisa una configuración existente.
    """
    if logging.getLogger().handlers:
        return
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        stream=sys.stdout,
    )


def main(argv: list[str] | None = None) -> int:
    configurar_log()
    parser = argparse.ArgumentParser(description="Punto de entrada de los cron de Railway")
    parser.add_argument("comando", choices=["frecuente", "semanal"])
    parser.add_argument(
        "--forzar", action="store_true", help="correr aunque no sea una de sus horas"
    )
    args = parser.parse_args(argv)
    return ejecutar(args.comando, forzar=args.forzar)


if __name__ == "__main__":
    codigo = main()
    # Cada paso cierra su conexión; esto vacía los handlers del log antes de
    # salir. Railway da por activa una ejecución que no termina.
    logging.shutdown()
    sys.exit(codigo)
