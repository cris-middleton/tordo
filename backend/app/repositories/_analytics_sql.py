"""Construcción de SQL para las tablas de analytics. Sin entrada/salida.

Vive aparte para que las variantes síncrona y asíncrona del repositorio compartan
exactamente la misma lógica: si el SQL se construyera dos veces, divergiría.

La API tiene hoy 18 endpoints de BI síncronos (FastAPI los corre en un
threadpool) y 6 asíncronos. Por eso hacen falta las dos variantes. Unificarlas en
async es parte de F3, cuando cambie la estructura por capas.
"""

from __future__ import annotations

from typing import Any

SCHEMA = "analytics"


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

    if orden:
        sql += f" ORDER BY {ident(orden)} {'DESC' if descendente else 'ASC'} NULLS LAST"
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
    proyeccion = ", ".join(ident(c) for c in columnas) if columnas else "*"
    sql = (
        f"SELECT {proyeccion} FROM {tabla_calificada(tabla, schema)} "
        f"WHERE lower({ident(columna)}) LIKE :patron"
    )
    if orden:
        sql += f" ORDER BY {ident(orden)} DESC NULLS LAST"
    return sql + " LIMIT :limite"


def patron_like(consulta: str) -> str:
    """Escapa los comodines que escriba el usuario para que se busquen literales."""
    limpia = consulta.strip().lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{limpia}%"
