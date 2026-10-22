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


def _donde(
    filtros: dict[str, Any] | None = None,
    minimos: dict[str, float] | None = None,
) -> tuple[str, dict[str, Any]]:
    """La cláusula WHERE (con su « WHERE » delante, o vacía) y sus parámetros.

    Una sola construcción para todas las consultas: los filtros de una lectura,
    de un conteo y de un agregado tienen que significar lo mismo.
    """
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
    return (" WHERE " + " AND ".join(clausulas) if clausulas else ""), params


def sql_consulta(
    tabla: str,
    *,
    filtros: dict[str, Any] | None = None,
    minimos: dict[str, float] | None = None,
    columnas: list[str] | None = None,
    orden: str | None = None,
    descendente: bool = True,
    desempate_texto: str | None = None,
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

    `desempate_texto` es un segundo criterio, ascendente y por bytes
    (`COLLATE "C"`, como ordena Polars), antes de `ctid`: hace falta cuando el
    `LIMIT` corta en un empate de `orden` y el desempate de siempre era una
    columna de texto, no el orden de carga.
    """
    proyeccion = ", ".join(ident(c) for c in columnas) if columnas else "*"
    donde, params = _donde(filtros, minimos)
    sql = f"SELECT {proyeccion} FROM {tabla_calificada(tabla, schema)}{donde}"

    if orden or limite:
        criterios = (
            [f"{ident(orden)} {'DESC' if descendente else 'ASC'} NULLS LAST"] if orden else []
        )
        if desempate_texto:
            criterios.append(f'{ident(desempate_texto)} COLLATE "C" ASC')
        sql += " ORDER BY " + ", ".join([*criterios, DESEMPATE])
    if limite:
        sql += f" LIMIT {int(limite)}"

    return sql, params


def sql_contar_filas(
    tabla: str,
    *,
    filtros: dict[str, Any] | None = None,
    schema: str = SCHEMA,
) -> tuple[str, dict[str, Any]]:
    """Cuántas filas cumplen los filtros, sin traerlas."""
    donde, params = _donde(filtros)
    return f"SELECT count(*) FROM {tabla_calificada(tabla, schema)}{donde}", params


def _sql_grupos(
    tabla: str,
    clave: str,
    *,
    filtros: dict[str, Any] | None,
    sumas: list[str],
    distintos: list[str] = (),
    primeros: list[str] = (),
    schema: str,
) -> tuple[str, dict[str, Any]]:
    """Una fila por valor de `clave`: las `sumas`, los `distintos` contados y el
    PRIMER valor de cada columna de `primeros` en el orden de carga (`ctid`), que
    es lo que daba `.first()` de Polars sobre la tabla leída sin ordenar."""
    donde, params = _donde(filtros)
    columnas = [f"{ident(clave)} AS {ident(clave)}"]
    columnas += [f"sum({ident(c)})::double precision AS {ident(c)}" for c in sumas]
    columnas += [f"count(DISTINCT {ident(c)}) AS {ident('distintos_' + c)}" for c in distintos]
    columnas += [f"(array_agg({ident(c)} ORDER BY {DESEMPATE}))[1] AS {ident(c)}" for c in primeros]
    sql = (
        f"SELECT {', '.join(columnas)} FROM {tabla_calificada(tabla, schema)}{donde} "
        f"GROUP BY {ident(clave)}"
    )
    return sql, params


def sql_agregado(
    tabla: str,
    clave: str,
    *,
    filtros: dict[str, Any] | None = None,
    sumas: list[str],
    distintos: list[str] = (),
    primeros: list[str] = (),
    limite: int | None,
    schema: str = SCHEMA,
) -> tuple[str, dict[str, Any]]:
    """Los `limite` grupos de más `sumas[0]`, agregados en Postgres.

    Existe por `competitors_by_market`, que tiene una fila por (organismo,
    rubro, proveedor): cualquier cifra de un rubro o de un organismo agrega por
    proveedor primero, y hacerlo en Polars traía a la API todas las filas del
    rubro para devolver diez. Empates por la clave, por bytes, como Polars.

    `limite=None` trae **todos** los grupos, y hay que escribirlo: es para el
    índice de páginas públicas (`services/publico/indexables.py`), que necesita
    una fila por comprador, rubro o producto y se construye una vez cada diez
    minutos. Vuelve una fila por grupo, no por fila de la tabla.
    """
    grupos, params = _sql_grupos(
        tabla,
        clave,
        filtros=filtros,
        sumas=sumas,
        distintos=distintos,
        primeros=primeros,
        schema=schema,
    )
    sql = f'{grupos} ORDER BY {ident(sumas[0])} DESC NULLS LAST, {ident(clave)} COLLATE "C" ASC'
    if limite is not None:
        sql += f" LIMIT {int(limite)}"
    return sql, params


def sql_totales(
    tabla: str,
    clave: str,
    *,
    filtros: dict[str, Any] | None = None,
    sumas: list[str],
    distintos: list[str] = (),
    schema: str = SCHEMA,
) -> tuple[str, dict[str, Any]]:
    """Los totales del mismo agregado: cuántos grupos hay, la suma de cada
    columna de `sumas`, la suma de los CUADRADOS de `sumas[0]` por grupo (con
    ella sale el HHI sin traer los grupos) y los `distintos` sobre las filas.
    """
    grupos, params = _sql_grupos(tabla, clave, filtros=filtros, sumas=sumas, schema=schema)
    columnas = ["count(*) AS grupos"]
    columnas += [f"sum(g.{ident(c)}) AS {ident(c)}" for c in sumas]
    columnas.append(f"sum(g.{ident(sumas[0])} * g.{ident(sumas[0])}) AS cuadrados")
    donde, _ = _donde(filtros)
    columnas += [
        f"(SELECT count(DISTINCT {ident(c)}) FROM {tabla_calificada(tabla, schema)}{donde}) "
        f"AS {ident('distintos_' + c)}"
        for c in distintos
    ]
    return f"SELECT {', '.join(columnas)} FROM ({grupos}) AS g", params


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


def sql_distintos(
    tabla: str,
    columna: str,
    *,
    filtros: dict[str, Any] | None = None,
    schema: str = SCHEMA,
) -> tuple[str, dict[str, Any]]:
    """Los valores distintos y no nulos de una columna, con filtros opcionales.

    Existe para preguntar «¿qué rubros tienen filas?» —o «¿qué compradores tiene
    este rubro?»— sin traer las filas: en `competitors_by_market` serían
    millones para quedarse con unos cientos.
    """
    col = ident(columna)
    donde, params = _donde(filtros)
    condicion = f"{donde} AND {col} IS NOT NULL" if donde else f" WHERE {col} IS NOT NULL"
    return f"SELECT DISTINCT {col} FROM {tabla_calificada(tabla, schema)}{condicion}", params


def sql_busqueda_texto(
    tabla: str,
    columna: str,
    consulta: str,
    *,
    columnas: list[str] | None = None,
    orden: str | None = None,
    schema: str = SCHEMA,
) -> tuple[str, dict[str, str]] | None:
    """Las filas donde `columna` tiene las palabras de `consulta`, y sus parámetros.

    Cada palabra al comienzo de una palabra, con sus formas y sinónimos
    (`busqueda.condicion_por_palabras`); primero lo que coincide sin sinónimos y
    luego por `orden`. None si no hay nada que buscar («%», «&»): ninguna fila
    coincide y no hace falta preguntarle a la base.

    Sin tildes ni mayúsculas en los dos lados (`busqueda.sql_normalizado`). La
    columna generada `COLUMNA_BUSCABLE` ya viene normalizada y lleva el índice de
    trigramas; cualquier otra se normaliza al vuelo, sin índice. Es lo que pasa
    con una tabla materializada antes de que existiera la columna, hasta la
    corrida semanal siguiente.
    """
    izquierda = (
        ident(columna)
        if columna == busqueda.COLUMNA_BUSCABLE
        else busqueda.sql_normalizado(ident(columna))
    )
    condicion = busqueda.condicion_por_palabras(izquierda, consulta)
    if condicion is None:
        return None
    proyeccion = ", ".join(ident(c) for c in columnas) if columnas else "*"
    sql = f"SELECT {proyeccion} FROM {tabla_calificada(tabla, schema)} WHERE {condicion.donde}"
    primero = f"({condicion.directa}) DESC, " if condicion.directa else ""
    orden_sql = f"{ident(orden)} DESC NULLS LAST, " if orden else ""
    return sql + f" ORDER BY {primero}{orden_sql}{DESEMPATE} LIMIT :limite", condicion.parametros


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
    """Monto por (año, mes, sector), en orden de mes y de sector.

    **Sin contar órdenes**: `time_series.n_oc` son las órdenes únicas de cada
    (comprador, rubro, mes), y sumadas entre rubros una orden con líneas de dos
    rubros se cuenta dos veces (7,1 millones contra 5,5 en producción). El monto
    no tiene el problema: va repartido por línea.

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
        f"COALESCE(SUM({ident('monto_total')}), 0) AS monto "
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


#: Cómo empiezan el código y el nombre de un proveedor persona natural en las
#: salidas de analytics: un seudónimo (`etl/analytics/personas.py`). La red de la
#: portada no los dibuja: un seudónimo no es un nombre que se pueda leer.
PREFIJO_PERSONA_NATURAL = "PN-"


def sql_red_de_compradores(
    tabla: str,
    tabla_sectores: str | None,
    *,
    con_ventana: bool,
    schema: str = SCHEMA,
) -> str:
    """La red de los compradores más grandes y sus proveedores, en un solo JSON.

    Un recorrido entero de `tabla` (`competitors_by_market`, una fila por
    comprador, rubro y proveedor) agrupado por comprador: de ahí salen el monto
    total y los `:n_compradores` compradores de más monto. Lo demás se lee sólo
    para ellos, por el índice de comprador:

    - `pares`: (comprador, proveedor) sumado sobre los rubros.
    - `red`: los pares con monto, sin personas naturales, numerados dentro de
      cada comprador por monto (`puesto`).
    - Proveedores elegidos: los `:por_comprador` primeros de cada comprador más
      los que venden a más de esos compradores: los `:amplios` primeros y, además,
      todos los que le venden a la mitad o más (la misma cuenta que `a_la_mitad_o_mas`), hasta `:tope_amplios` (empate:
      monto, código). Así lo que la portada dice («40 le venden a la mitad o más»)
      es lo que dibuja; con 12 fijos decía 40 y pintaba 12.
    - `sectores`: el de cada comprador en `tabla_sectores` (`time_series`), el
      vacío como `SECTOR_SIN_NOMBRE`. Sin esa tabla, todos van a ese sector.

    Todo orden con `LIMIT` o numeración termina en el código, que es único en
    cada paso (`COLLATE "C"`: no depende de la intercalación de la base). Vuelve
    una fila con un JSON: unas decenas de nodos y un par de centenares de enlaces.
    Parámetros: `:n_compradores`, `:por_comprador`, `:amplios`,
    `:tope_amplios` y `:persona` (el patrón `LIKE` de los seudónimos).
    """
    t = tabla_calificada(tabla, schema)
    org, prov, monto = (
        ident("CodigoOrganismoPublico"),
        ident("CodigoProveedor"),
        ident("monto_total"),
    )
    sin_nombre = "'" + SECTOR_SIN_NOMBRE.replace("'", "''") + "'"
    ventana = (
        f", MIN({ident('ventana_desde')})::text AS ventana_desde, "
        f"MAX({ident('ventana_hasta')})::text AS ventana_hasta"
        if con_ventana
        else ", NULL::text AS ventana_desde, NULL::text AS ventana_hasta"
    )
    if tabla_sectores:
        sectores = (
            f"SELECT {org} AS codigo, "
            f"MIN(NULLIF(btrim({ident('sector')}), '')) AS sector "
            f"FROM {tabla_calificada(tabla_sectores, schema)} "
            f"WHERE {org} IN (SELECT codigo FROM compradores) GROUP BY 1"
        )
    else:
        sectores = "SELECT NULL::text AS codigo, NULL::text AS sector WHERE FALSE"
    c = '"C"'
    return f"""
WITH por_comprador AS (
    SELECT {org} AS codigo, COALESCE(SUM({monto}), 0) AS monto{ventana}
    FROM {t} WHERE {org} IS NOT NULL GROUP BY 1
),
compradores AS (
    SELECT codigo, monto FROM por_comprador
    ORDER BY monto DESC, codigo COLLATE {c} LIMIT :n_compradores
),
pares AS (
    SELECT {org} AS comprador, {prov} AS proveedor,
           COALESCE(SUM({monto}), 0) AS monto,
           MIN({ident("NombreProveedor")}) AS nombre,
           MIN({ident("OrganismoPublico")}) AS nombre_comprador
    FROM {t} WHERE {org} IN (SELECT codigo FROM compradores)
    GROUP BY 1, 2
),
red AS (
    SELECT comprador, proveedor, monto, nombre,
           row_number() OVER (
               PARTITION BY comprador ORDER BY monto DESC, proveedor COLLATE {c}
           ) AS puesto
    FROM pares
    WHERE monto > 0 AND proveedor IS NOT NULL
      AND proveedor NOT LIKE :persona AND COALESCE(nombre, '') NOT LIKE :persona
),
por_proveedor AS (
    SELECT proveedor, MIN(nombre) AS nombre, SUM(monto) AS monto,
           count(*) AS compradores, MIN(puesto) AS mejor_puesto
    FROM red GROUP BY 1
),
amplios AS (
    SELECT proveedor FROM (
        SELECT proveedor, compradores, row_number() OVER (
            ORDER BY compradores DESC, monto DESC, proveedor COLLATE {c}
        ) AS orden
        FROM por_proveedor
    ) AS x
    WHERE orden <= :amplios
       OR (compradores >= (SELECT (count(*) + 1) / 2 FROM compradores) AND orden <= :tope_amplios)
),
seleccion AS (
    SELECT proveedor FROM por_proveedor WHERE mejor_puesto <= :por_comprador
    UNION
    SELECT proveedor FROM amplios
),
nombres AS (
    SELECT comprador AS codigo, MIN(nombre_comprador) AS nombre FROM pares GROUP BY 1
),
sectores AS ({sectores})
SELECT json_build_object(
    'compradores', (
        SELECT COALESCE(json_agg(json_build_object(
            'codigo', k.codigo, 'nombre', n.nombre,
            'sector', COALESCE(s.sector, {sin_nombre}), 'monto', k.monto
        ) ORDER BY k.monto DESC, k.codigo COLLATE {c}), '[]'::json)
        FROM compradores k
        LEFT JOIN nombres n USING (codigo) LEFT JOIN sectores s USING (codigo)
    ),
    'proveedores', (
        SELECT COALESCE(json_agg(json_build_object(
            'codigo', p.proveedor, 'nombre', p.nombre,
            'monto', p.monto, 'compradores', p.compradores
        ) ORDER BY p.monto DESC, p.proveedor COLLATE {c}), '[]'::json)
        FROM por_proveedor p JOIN seleccion USING (proveedor)
    ),
    'enlaces', (
        SELECT COALESCE(json_agg(json_build_object(
            'comprador', r.comprador, 'proveedor', r.proveedor, 'monto', r.monto
        ) ORDER BY r.monto DESC, r.comprador COLLATE {c}, r.proveedor COLLATE {c}), '[]'::json)
        FROM red r JOIN seleccion USING (proveedor)
    ),
    'monto_total', (SELECT COALESCE(SUM(monto), 0) FROM por_comprador),
    'monto_compradores', (SELECT COALESCE(SUM(monto), 0) FROM compradores),
    'proveedores_total', (
        SELECT count(DISTINCT proveedor) FROM pares WHERE monto > 0 AND proveedor IS NOT NULL
    ),
    'a_la_mitad_o_mas', (
        SELECT count(*) FROM por_proveedor
        WHERE compradores >= (SELECT (count(*) + 1) / 2 FROM compradores)
          AND (SELECT count(*) FROM compradores) > 0
    ),
    'ventana_desde', (SELECT MIN(ventana_desde) FROM por_comprador),
    'ventana_hasta', (SELECT MAX(ventana_hasta) FROM por_comprador)
) AS red
"""
