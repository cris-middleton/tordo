"""Lectura síncrona de las tablas de analytics.

`bi_service` es síncrono y FastAPI corre esos endpoints en un threadpool, así que
una consulta bloqueante aquí es correcta y no bloquea el event loop. Convertir el
BI a async es parte de F3, cuando cambie la estructura por capas.

Comparte la construcción de SQL con la variante asíncrona
(`_analytics_sql.py`) para que no puedan divergir.
"""

from __future__ import annotations

import logging
from typing import Any

import polars as pl
from sqlalchemy import text

from app.repositories import _analytics_sql as sql

logger = logging.getLogger(__name__)

SCHEMA = sql.SCHEMA

#: Tramos de 10 puntos de la cuota del líder que agrega `concentracion_de_mercados`.
TRAMOS_CUOTA = sql.TRAMOS_CUOTA


def _engine():
    # Import diferido a propósito: `app.db` crea los engines al importarse y eso
    # exige configuración de base de datos que los tests unitarios no necesitan.
    from app.db import sync_engine

    return sync_engine


def _a_polars(filas: list[dict], columnas_vacio: list[str] | None = None) -> pl.DataFrame:
    """Convierte filas a Polars preservando el esquema aunque no haya ninguna.

    Un parquet vacío conserva sus columnas; `pl.DataFrame([])` no. Varias
    funciones de bi_service comprueban `"columna" in df.columns` para decidir
    qué camino tomar, así que perder el esquema en el caso vacío cambia el
    comportamiento — get_tendencia reventaba con ColumnNotFoundError cuando
    trend_by_market venía sin filas.
    """
    if filas:
        # Todas las filas para inferir el esquema, no las 100 primeras: una
        # columna nula en las cien primeras y con texto después hacía fallar la
        # construcción (ComputeError) — y con ella el endpoint, con un 500.
        return pl.DataFrame(filas, infer_schema_length=None)
    if columnas_vacio:
        return pl.DataFrame(schema=dict.fromkeys(columnas_vacio, pl.Utf8))
    return pl.DataFrame()


def _columnas_a_polars(nombres: list[str], filas) -> pl.DataFrame:
    """Filas (tuplas) a Polars por columnas: cada una infiere su tipo con todos
    sus valores, como `infer_schema_length=None`, sin un diccionario por fila."""
    return pl.DataFrame(
        {
            nombre: list(valores)
            for nombre, valores in zip(nombres, zip(*filas, strict=True), strict=True)
        }
    )


def _resultado_a_polars(resultado, columnas_vacio: list[str] | None = None) -> pl.DataFrame:
    """Como `_a_polars`, pero por columnas, desde el resultado de la consulta.

    Da el mismo DataFrame —mismos tipos, mismo orden— sin pasar por un
    diccionario por fila: con las 49.000 firmas del índice de páginas públicas
    (`services/publico/indexables.py`), construir por filas pesaba +38 MiB de
    pico y por columnas +24 (lo demás es el resultado de psycopg2).
    `tests/test_publico_indice_sql.py` compara las dos vías tabla a tabla.
    """
    nombres = list(resultado.keys())
    filas = resultado.all()
    if not filas:
        return _a_polars([], columnas_vacio)
    return _columnas_a_polars(nombres, filas)


#: Filas por trozo cuando un agregado se trae sin límite (`agregado(limite=None)`).
FILAS_POR_TROZO = 10_000


def _por_trozos(conn, consulta: str, params: dict, columnas_vacio: list[str]) -> pl.DataFrame:
    """La consulta con un cursor de servidor, de `FILAS_POR_TROZO` en `FILAS_POR_TROZO`.

    Sólo para lo que es de la tabla entera por naturaleza —las ~50.000 firmas
    del índice de páginas públicas—: psycopg2 trae por defecto el resultado
    completo a memoria antes de devolver la primera fila, y con el triple de las
    firmas locales eso eran +66 MiB de pico; por trozos, +21. Las lecturas
    acotadas no lo usan: un cursor de servidor cuesta idas y vueltas de más.
    """
    resultado = conn.execution_options(stream_results=True, max_row_buffer=FILAS_POR_TROZO).execute(
        text(consulta), params
    )
    nombres = list(resultado.keys())
    partes = [_columnas_a_polars(nombres, t) for t in resultado.partitions(FILAS_POR_TROZO)]
    if not partes:
        return _a_polars([], columnas_vacio)
    # `vertical_relaxed`: un trozo con una columna toda nula sale de tipo Null.
    return pl.concat(partes, how="vertical_relaxed")


#: Tablas que ya se vieron existir. **Sólo se recuerda el sí.** Con
#: `lru_cache` se recordaba también el no, para siempre: la API del lanzamiento
#: arrancó antes de la primera corrida semanal, guardó «no existe» para cada
#: tabla de analytics y siguió sirviendo sitemap y páginas públicas vacías con
#: los datos ya materializados, hasta reiniciarla. Que una tabla aparezca es lo
#: normal; que desaparezca, no (la materialización la reemplaza en una
#: transacción).
_existentes: set[str] = set()


def _consultar_existencia(tabla: str) -> bool:
    with _engine().connect() as conn:
        r = conn.execute(text(sql.sql_existe_tabla()), {"schema": SCHEMA, "tabla": tabla}).first()
    return r is not None


def existe_tabla(tabla: str, *, usar_cache: bool = True) -> bool:
    """True si el pipeline ya materializó esa tabla.

    Se cachea el sí porque sólo cambia cuando corre el pipeline (una vez por
    semana), y sin caché serían dos consultas por request en vez de una. El no
    se vuelve a preguntar cada vez: es el estado de un despliegue nuevo y dura
    hasta la primera corrida. `usar_cache=False` para los tests, que crean y
    borran tablas.
    """
    if not usar_cache:
        _existentes.clear()
    if tabla in _existentes:
        return True
    hay = _consultar_existencia(tabla)
    if hay:
        _existentes.add(tabla)
    return hay


def invalidar_cache_existencia() -> None:
    """Olvida las tablas vistas. Para tests y para un endpoint de recarga si algún
    día hace falta: el no ya no se cachea, así que tras materializar no hace falta."""
    _existentes.clear()


def columnas_de(tabla: str) -> set[str]:
    with _engine().connect() as conn:
        return {
            r[0] for r in conn.execute(text(sql.sql_columnas()), {"schema": SCHEMA, "tabla": tabla})
        }


def consultar(
    tabla: str,
    *,
    filtros: dict[str, Any] | None = None,
    minimos: dict[str, float] | None = None,
    columnas: list[str] | None = None,
    orden: str | None = None,
    descendente: bool = True,
    desempate_texto: str | None = None,
    limite: int | None = None,
) -> pl.DataFrame | None:
    """Consulta una tabla de analytics con los filtros empujados a SQL.

    Devuelve None si la tabla no existe todavía (el pipeline no genera todos los
    parquets en toda corrida), y un DataFrame vacío si no hay coincidencias.
    Esa distinción importa: los endpoints responden "no disponible" en el primer
    caso y "sin datos para el filtro" en el segundo.
    """
    if not existe_tabla(tabla):
        return None

    consulta, params = sql.sql_consulta(
        tabla,
        filtros=filtros,
        minimos=minimos,
        columnas=columnas,
        orden=orden,
        descendente=descendente,
        desempate_texto=desempate_texto,
        limite=limite,
    )
    with _engine().connect() as conn:
        df = _resultado_a_polars(conn.execute(text(consulta), params))
    if df.width:
        return df
    # Sin filas: se recupera el esquema para no perder los nombres de columna.
    return _a_polars([], columnas or sorted(columnas_de(tabla)))


def contar_filas(tabla: str, *, filtros: dict[str, Any] | None = None) -> int | None:
    """Cuántas filas cumplen los filtros; None si la tabla no existe."""
    if not existe_tabla(tabla):
        return None
    consulta, params = sql.sql_contar_filas(tabla, filtros=filtros)
    with _engine().connect() as conn:
        return int(conn.execute(text(consulta), params).scalar() or 0)


def agregado(
    tabla: str,
    clave: str,
    *,
    filtros: dict[str, Any] | None = None,
    sumas: list[str],
    distintos: list[str] = (),
    primeros: list[str] = (),
    limite: int | None,
) -> pl.DataFrame | None:
    """Los grupos de más `sumas[0]`, agregados en SQL; None si no hay tabla.

    `limite=None` trae todos los grupos (ver `sql_agregado`), por trozos
    (`_por_trozos`).

    Columnas: la clave, cada suma con su nombre, `distintos_<col>` y cada
    columna de `primeros` (su primer valor en el orden de carga).
    """
    if not existe_tabla(tabla):
        return None
    consulta, params = sql.sql_agregado(
        tabla,
        clave,
        filtros=filtros,
        sumas=sumas,
        distintos=distintos,
        primeros=primeros,
        limite=limite,
    )
    nombres = [clave, *sumas, *(f"distintos_{c}" for c in distintos), *primeros]
    with _engine().connect() as conn:
        if limite is None:
            return _por_trozos(conn, consulta, params, nombres)
        return _resultado_a_polars(conn.execute(text(consulta), params), nombres)


def totales(
    tabla: str,
    clave: str,
    *,
    filtros: dict[str, Any] | None = None,
    sumas: list[str],
    distintos: list[str] = (),
) -> dict[str, Any] | None:
    """Los totales del agregado (`grupos`, cada suma, `cuadrados`,
    `distintos_<col>`); None si no hay tabla."""
    if not existe_tabla(tabla):
        return None
    consulta, params = sql.sql_totales(
        tabla, clave, filtros=filtros, sumas=sumas, distintos=distintos
    )
    with _engine().connect() as conn:
        return dict(conn.execute(text(consulta), params).mappings().one())


def distintos(
    tabla: str, columna: str, *, filtros: dict[str, Any] | None = None
) -> list[Any] | None:
    """Los valores distintos de una columna, o None si la tabla no existe.

    Lo usa el índice de páginas públicas para saber qué rubros tienen datos sin
    traer las filas: la columna va indexada, y Postgres lo resuelve sin tocar
    el resto de la tabla.
    """
    if not existe_tabla(tabla):
        return None
    consulta, params = sql.sql_distintos(tabla, columna, filtros=filtros)
    with _engine().connect() as conn:
        return [fila[0] for fila in conn.execute(text(consulta), params)]


def contar_por(
    tabla: str,
    columna: str,
    *,
    excluir: list[str] | None = None,
    limite: int,
) -> list[tuple[Any, int]] | None:
    """`(valor, filas)` de una columna, de más a menos; None si no hay tabla.

    Lo usa el catálogo de rubros: contarlos en Polars traía la columna de toda
    `opportunity_scores` a memoria en cada visita a `/mercado`.
    """
    if not existe_tabla(tabla):
        return None
    consulta, params = sql.sql_contar_por(tabla, columna, excluir=excluir)
    with _engine().connect() as conn:
        filas = conn.execute(text(consulta), {**params, "limite": int(limite)})
        return [(fila[0], int(fila[1])) for fila in filas]


def buscar_texto(
    tabla: str,
    columna: str,
    consulta_texto: str,
    *,
    columnas: list[str] | None = None,
    orden: str | None = None,
    limite: int = 20,
) -> pl.DataFrame | None:
    """Las palabras al comienzo de una palabra, servidas por el índice GIN de pg_trgm.

    La regla está en `repositories/busqueda.py`: «mesa» no encuentra «parmesano»,
    y cada palabra trae sus formas y sinónimos (`condicion_por_palabras`).
    """
    if not existe_tabla(tabla):
        return None

    busqueda = sql.sql_busqueda_texto(
        tabla, columna, consulta_texto, columnas=columnas, orden=orden
    )
    filas = []
    if busqueda is not None:
        consulta, params = busqueda
        with _engine().connect() as conn:
            filas = conn.execute(text(consulta), {**params, "limite": limite}).mappings().all()
    if filas:
        return _a_polars([dict(f) for f in filas])
    return _a_polars([], columnas or sorted(columnas_de(tabla)))


def gasto_mensual_por_sector(tabla: str = "time_series") -> list[dict] | None:
    """Monto y órdenes por (año, mes, sector), agregados en SQL; None sin tabla.

    Lo pide la portada (`/publico/mercado`). La tabla nunca llega a la API: vuelve
    una fila por mes y sector (~40 meses por ~8 sectores en producción).
    """
    if not existe_tabla(tabla):
        return None
    with _engine().connect() as conn:
        filas = conn.execute(text(sql.sql_gasto_mensual(tabla))).mappings().all()
    return [
        {
            "anio": int(f["anio"]),
            "mes": int(f["mes"]),
            "sector": f["sector"],
            "monto": float(f["monto"]),
        }
        for f in filas
    ]


def concentracion_de_mercados(tabla: str = "market_concentration") -> dict | None:
    """Conteos, montos y tramos de la cuota del líder, agregados en SQL; None sin tabla.

    Dos consultas: los totales (con la ventana si la tabla la publica) y los
    tramos que tienen mercados. Los tramos vacíos los rellena el servicio.
    """
    if not existe_tabla(tabla):
        return None
    con_ventana = {"ventana_desde", "ventana_hasta"} <= columnas_de(tabla)
    with _engine().connect() as conn:
        totales = dict(
            conn.execute(text(sql.sql_concentracion_totales(tabla, con_ventana=con_ventana)))
            .mappings()
            .one()
        )
        tramos = conn.execute(text(sql.sql_concentracion_tramos(tabla))).mappings().all()
    return {
        "mercados": int(totales["mercados"]),
        "sobre_la_mitad": int(totales["sobre_la_mitad"]),
        "un_proveedor": int(totales["un_proveedor"]),
        "monto_total": float(totales["monto_total"]),
        "monto_sobre_la_mitad": float(totales["monto_sobre_la_mitad"]),
        "ventana_desde": totales.get("ventana_desde"),
        "ventana_hasta": totales.get("ventana_hasta"),
        "tramos": [
            {"tramo": int(f["tramo"]), "mercados": int(f["mercados"]), "monto": float(f["monto"])}
            for f in tramos
        ],
    }


def red_de_compradores(
    tabla: str = "competitors_by_market",
    tabla_sectores: str = "time_series",
    *,
    n_compradores: int,
    por_comprador: int,
    amplios: int,
) -> dict | None:
    """Los compradores de más monto y los proveedores que les venden, en SQL; None sin tabla.

    Una sola consulta (`sql.sql_red_de_compradores`) que devuelve un JSON ya
    armado: la tabla (4,2 millones de filas en producción) nunca llega a la API.
    Sin `tabla_sectores`, todos los compradores van a «Otros».
    """
    if not existe_tabla(tabla):
        return None
    con_ventana = {"ventana_desde", "ventana_hasta"} <= columnas_de(tabla)
    consulta = sql.sql_red_de_compradores(
        tabla,
        tabla_sectores if existe_tabla(tabla_sectores) else None,
        con_ventana=con_ventana,
    )
    params = {
        "n_compradores": n_compradores,
        "por_comprador": por_comprador,
        "amplios": amplios,
        "persona": sql.PREFIJO_PERSONA_NATURAL + "%",
    }
    with _engine().connect() as conn:
        red = conn.execute(text(consulta), params).scalar_one()
    return {
        "compradores": [
            {
                "codigo": str(c["codigo"]),
                "nombre": c["nombre"],
                "sector": c["sector"],
                "monto": float(c["monto"]),
            }
            for c in red["compradores"]
        ],
        "proveedores": [
            {
                "codigo": str(p["codigo"]),
                "nombre": p["nombre"],
                "monto": float(p["monto"]),
                "compradores": int(p["compradores"]),
            }
            for p in red["proveedores"]
        ],
        "enlaces": [
            {
                "comprador": str(e["comprador"]),
                "proveedor": str(e["proveedor"]),
                "monto": float(e["monto"]),
            }
            for e in red["enlaces"]
        ],
        "monto_total": float(red["monto_total"]),
        "monto_compradores": float(red["monto_compradores"]),
        "proveedores_total": int(red["proveedores_total"]),
        "a_la_mitad_o_mas": int(red["a_la_mitad_o_mas"]),
        "ventana_desde": red["ventana_desde"],
        "ventana_hasta": red["ventana_hasta"],
    }
