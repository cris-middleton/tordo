"""Construcción de SQL para las tablas de analytics. Sin entrada/salida.

Vive aparte para que las variantes síncrona y asíncrona del repositorio compartan
exactamente la misma lógica: si el SQL se construyera dos veces, divergiría.

La API tiene hoy 18 endpoints de BI síncronos (FastAPI los corre en un
threadpool) y 6 asíncronos. Por eso hacen falta las dos variantes. Unificarlas en
async es parte de F3, cuando cambie la estructura por capas.
"""

from __future__ import annotations

from typing import Any

from app.repositories import busqueda

SCHEMA = "analytics"

#: El último criterio de todo orden con `LIMIT`: la posición física de la fila.
#: Las tablas de analytics no tienen clave única, y sin un criterio único dos
#: filas empatadas en `orden` salen en cualquier orden —y un `LIMIT` que corta en
#: el empate devuelve un conjunto distinto en cada petición (un recorrido
#: secuencial sincronizado empieza donde va otro). `ctid` es único y no cambia
#: mientras la tabla no se reescriba: el pipeline la reemplaza entera una vez por
#: semana (`etl/loaders/analytics_loader.py`) y nunca la actualiza fila a fila.
#: Es el orden en que se cargó, el del parquet.
DESEMPATE = "ctid"


def ident(nombre: str) -> str:
    """Cita un identificador. Las columnas vienen en camelCase desde el parquet."""
    return '"' + nombre.replace('"', '""') + '"'


def tabla_calificada(tabla: str, schema: str = SCHEMA) -> str:
    return f"{ident(schema)}.{ident(tabla)}"


def sql_existe_tabla() -> str:
    return (
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_schema = :schema AND table_name = :tabla"
    )


def sql_columnas() -> str:
    return (
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = :schema AND table_name = :tabla"
    )


def sql_consulta(
    tabla: str,
    *,
    filtros: dict[str, Any] | None = None,
    minimos: dict[str, float] | None = None,
    columnas: list[str] | None = None,
    orden: str | None = None,
    descendente: bool = True,
    limite: int | None = None,
    schema: str = SCHEMA,
) -> tuple[str, dict[str, Any]]:
    """Devuelve (sql, params).

    Los filtros son igualdades por columna; un valor None significa "IS NULL".
    Los valores van siempre como parámetros ligados, nunca interpolados.

    Cuando el valor es una lista o tupla se genera un `IN`, que es lo que hace
    falta para los filtros por varios rubros u organismos a la vez.

    `minimos` son cotas inferiores (`col >= valor`). Existen porque filtrar en
    Polars DESPUÉS de traer la tabla mataba la API por memoria (`/mercado`, spec
    del rediseño §8.2), y filtrar después de un `LIMIT` cambiaba la respuesta.
    Un NULL no pasa un mínimo, igual que en Polars.
    """
    proyeccion = ", ".join(ident(c) for c in columnas) if columnas else "*"
    sql = f"SELECT {proyeccion} FROM {tabla_calificada(tabla, schema)}"

    params: dict[str, Any] = {}
    clausulas: list[str] = []
    for i, (col, valor) in enumerate((filtros or {}).items()):
        if valor is None:
            clausulas.append(f"{ident(col)} IS NULL")
        elif isinstance(valor, (list, tuple, set)):
            valores = list(valor)
            if not valores:
                # Un IN vacío no es SQL válido y además debe devolver cero filas.
                clausulas.append("FALSE")
                continue
            claves = []
            for j, v in enumerate(valores):
                clave = f"p{i}_{j}"
                params[clave] = v
                claves.append(f":{clave}")
            clausulas.append(f"{ident(col)} IN ({', '.join(claves)})")
        else:
            clave = f"p{i}"
            clausulas.append(f"{ident(col)} = :{clave}")
            params[clave] = valor
    for i, (col, valor) in enumerate((minimos or {}).items()):
        clave = f"m{i}"
        clausulas.append(f"{ident(col)} >= :{clave}")
        params[clave] = valor
    if clausulas:
        sql += " WHERE " + " AND ".join(clausulas)

    if orden or limite:
        criterios = (
            [f"{ident(orden)} {'DESC' if descendente else 'ASC'} NULLS LAST"] if orden else []
        )
        sql += " ORDER BY " + ", ".join([*criterios, DESEMPATE])
    if limite:
        sql += f" LIMIT {int(limite)}"

    return sql, params


def sql_contar_por(
    tabla: str,
    columna: str,
    *,
    excluir: list[str] | None = None,
    schema: str = SCHEMA,
) -> tuple[str, dict[str, Any]]:
    """Cuántas filas tiene cada valor de una columna, de más a menos.

    El límite va como `:limite`. Los empates se ordenan por BYTES (`COLLATE "C"`)
    porque así los ordenaba Polars cuando esto se contaba en memoria: con la
    intercalación de la base (`en_US.utf8`) «Árboles» pasa delante de «Obras», y
    con un límite eso cambia qué valores entran, no sólo su orden.
    """
    col = ident(columna)
    params: dict[str, Any] = {}
    sql = (
        f"SELECT {col} AS valor, count(*) AS n FROM {tabla_calificada(tabla, schema)} "
        f"WHERE {col} IS NOT NULL"
    )
    if excluir:
        claves = []
        for j, valor in enumerate(excluir):
            params[f"e{j}"] = valor
            claves.append(f":e{j}")
        sql += f" AND {col} NOT IN ({', '.join(claves)})"
    sql += f' GROUP BY {col} ORDER BY n DESC, {col} COLLATE "C" ASC LIMIT :limite'
    return sql, params


def sql_distintos(tabla: str, columna: str, *, schema: str = SCHEMA) -> str:
    """Los valores distintos y no nulos de una columna.

    Existe para preguntar «¿qué rubros tienen filas?» sin traer las filas: en
    `competitors_by_market` serían millones para quedarse con unos cientos.
    """
    col = ident(columna)
    return f"SELECT DISTINCT {col} FROM {tabla_calificada(tabla, schema)} WHERE {col} IS NOT NULL"


def sql_busqueda_texto(
    tabla: str,
    columna: str,
    *,
    columnas: list[str] | None = None,
    orden: str | None = None,
    schema: str = SCHEMA,
) -> str:
    """Las filas donde `columna` tiene una palabra que empieza por el término.

    Sin tildes ni mayúsculas en los dos lados (`busqueda.sql_normalizado`). La
    columna generada `COLUMNA_BUSCABLE` ya viene normalizada y lleva el índice de
    trigramas; cualquier otra se normaliza al vuelo, sin índice. Es lo que pasa
    con una tabla materializada antes de que existiera la columna, hasta la
    corrida semanal siguiente.
    """
    proyeccion = ", ".join(ident(c) for c in columnas) if columnas else "*"
    izquierda = (
        ident(columna)
        if columna == busqueda.COLUMNA_BUSCABLE
        else busqueda.sql_normalizado(ident(columna))
    )
    sql = (
        f"SELECT {proyeccion} FROM {tabla_calificada(tabla, schema)} "
        f"WHERE {busqueda.sql_comienza_palabra(izquierda)}"
    )
    orden_sql = f"{ident(orden)} DESC NULLS LAST, " if orden else ""
    return sql + f" ORDER BY {orden_sql}{DESEMPATE} LIMIT :limite"


def parametros_busqueda(consulta: str) -> dict[str, str] | None:
    """Los parámetros de `sql_busqueda_texto`, o None si no hay nada que buscar.

    El término va desde su primera letra o dígito (`busqueda.fragmento`); las
    tildes y las mayúsculas las quita Postgres. None («%», «&»): ninguna fila
    coincide y no hace falta preguntarle a la base.
    """
    trozo = busqueda.fragmento(consulta.strip())
    return busqueda.parametros(trozo) if trozo else None


# ── Agregados del mercado para la portada (`/publico/mercado`) ───────────────
#
# Se agregan en Postgres y no en Polars: `time_series` pesa 301 MB en
# producción, y traerla entera para sumarla es lo que mató a la API por memoria
# el 2026-10-14. Lo que vuelve son unas decenas de filas.

#: Cómo sale un sector sin nombre (NULL o vacío): se suma al «Otros» que ya trae
#: el ETL, en vez de pintar un sector en blanco al lado.
SECTOR_SIN_NOMBRE = "Otros"

#: Cuántos tramos de 10 puntos tiene la distribución de la cuota del líder.
TRAMOS_CUOTA = 10


def sql_gasto_mensual(tabla: str, *, schema: str = SCHEMA) -> str:
    """Monto y órdenes por (año, mes, sector), en orden de mes y de sector.

    El sector vacío o nulo cae en `SECTOR_SIN_NOMBRE`, y se agrupa por la
    expresión ya traducida: así se funde con el «Otros» que haya, en vez de salir
    dos veces. Va como literal y no como parámetro porque la misma expresión
    aparece en el `SELECT` y en el `ORDER BY`, y Postgres sólo las reconoce
    iguales si lo son al pie de la letra (con dos parámetros ligados no lo son).
    """
    sin_nombre = "'" + SECTOR_SIN_NOMBRE.replace("'", "''") + "'"
    sector = f"COALESCE(NULLIF(btrim({ident('sector')}), ''), {sin_nombre})"
    return (
        f"SELECT {ident('anio')} AS anio, {ident('mes')} AS mes, {sector} AS sector, "
        f"COALESCE(SUM({ident('monto_total')}), 0) AS monto, "
        f"COALESCE(SUM({ident('n_oc')}), 0) AS n_oc "
        f"FROM {tabla_calificada(tabla, schema)} "
        f"WHERE {ident('anio')} IS NOT NULL AND {ident('mes')} IS NOT NULL "
        # El sector se ordena por bytes, como en el resto del módulo: no depende
        # de la intercalación de la base.
        f'GROUP BY 1, 2, 3 ORDER BY 1, 2, {sector} COLLATE "C"'
    )


def sql_concentracion_totales(tabla: str, *, con_ventana: bool, schema: str = SCHEMA) -> str:
    """Los conteos y montos de `market_concentration` en una sola pasada.

    Un mercado cuenta si tiene cuota del líder: es la base de la distribución,
    y así `mercados` es la suma de los tramos. `un_proveedor` se cuenta sobre los
    mismos. Con `con_ventana`, también el periodo (es igual en todas las filas).
    """
    cuota, monto = ident("top_share_pct"), ident("monto_total_mercado")
    ventana = (
        f", MIN({ident('ventana_desde')}) AS ventana_desde, "
        f"MAX({ident('ventana_hasta')}) AS ventana_hasta"
        if con_ventana
        else ""
    )
    return (
        "SELECT count(*) AS mercados, "
        f"count(*) FILTER (WHERE {cuota} >= 50) AS sobre_la_mitad, "
        f"count(*) FILTER (WHERE {ident('n_proveedores')} = 1) AS un_proveedor, "
        f"COALESCE(SUM({monto}), 0) AS monto_total, "
        f"COALESCE(SUM({monto}) FILTER (WHERE {cuota} >= 50), 0) AS monto_sobre_la_mitad"
        f"{ventana} FROM {tabla_calificada(tabla, schema)} WHERE {cuota} IS NOT NULL"
    )


def sql_concentracion_tramos(tabla: str, *, schema: str = SCHEMA) -> str:
    """Mercados y monto por tramo de 10 puntos de la cuota del líder (0 a 9).

    El 100 % cae en el último tramo (`LEAST`), y una cuota fuera de [0, 100] —que
    la aritmética no permite, pero un dato roto sí— en el tramo del borde. Los
    tramos sin mercados no vienen: los rellena quien llama.
    """
    cuota, monto = ident("top_share_pct"), ident("monto_total_mercado")
    ultimo = TRAMOS_CUOTA - 1
    tramo = f"LEAST(GREATEST(floor({cuota} / 10)::int, 0), {ultimo})"
    return (
        f"SELECT {tramo} AS tramo, count(*) AS mercados, "
        f"COALESCE(SUM({monto}), 0) AS monto "
        f"FROM {tabla_calificada(tabla, schema)} WHERE {cuota} IS NOT NULL "
        "GROUP BY 1 ORDER BY 1"
    )
