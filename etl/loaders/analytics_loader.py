"""Materializa los parquets de analytics en tablas de PostgreSQL.

Por qué existe
--------------
Hasta ahora la API leía los parquets desde disco y los cacheaba en memoria del
proceso (`bi_service._cache`, TTL 24 h). Eso implicaba una copia por worker de
uvicorn, exigía sistema de archivos compartido entre el ETL y la API —que en la
topología de Railway no existe— y resolvía cada consulta con un scan lineal en
Python sobre cientos de miles de filas.

El cómputo batch se queda en Polars: es rápido y está validado. Lo que cambia es
la capa de servicio. Al final del batch, cada parquet se materializa en una tabla
del esquema `analytics` de Postgres, con índices sobre las columnas por las que
la API filtra. La API pasa a consultarlas con SQL, igual que todo lo demás.

Ver `docs/decisiones/0006-analytics-en-postgres.md`.

Diseño
------
Agnóstico al esquema **a propósito**. Los 23 parquets que consume la API tienen
formas distintas y con particularidades históricas (por ejemplo la columna
`NombreroductoGenerico`, con una P perdida). Declarar 23 esquemas a mano sería
frágil y se desincronizaría al primer cambio del pipeline. En vez de eso, el
tipo se infiere del parquet y la tabla se reemplaza entera en cada corrida.

Estas tablas son **datos derivados**: se reconstruyen desde el parquet en cada
corrida, así que no llevan migraciones de Alembic. Lo único que sí es
migración es la creación del esquema `analytics`.

El reemplazo es atómico: se carga en una tabla nueva, se indexa, y recién
entonces se hace el swap dentro de una transacción. La API nunca ve una tabla a
medio cargar ni sin índices.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from pathlib import Path

import polars as pl
from sqlalchemy import text
from sqlalchemy.engine import Engine

from etl.shared_imports import COLUMNA_BUSCABLE, sql_normalizado

logger = logging.getLogger(__name__)

SCHEMA = "analytics"

# Polars → PostgreSQL. Lo no contemplado cae a TEXT, que siempre carga bien;
# es preferible a fallar la corrida entera por un tipo exótico.
_TIPOS: dict[type, str] = {
    pl.Int8: "SMALLINT",
    pl.Int16: "SMALLINT",
    pl.Int32: "INTEGER",
    pl.Int64: "BIGINT",
    pl.UInt8: "SMALLINT",
    pl.UInt16: "INTEGER",
    pl.UInt32: "BIGINT",
    pl.UInt64: "NUMERIC",
    pl.Float32: "REAL",
    pl.Float64: "DOUBLE PRECISION",
    pl.Boolean: "BOOLEAN",
    pl.Date: "DATE",
    pl.Datetime: "TIMESTAMP",
    pl.Utf8: "TEXT",
    pl.Categorical: "TEXT",
}


@dataclass(frozen=True)
class TablaAnalytics:
    """Un parquet y cómo debe quedar en Postgres.

    `indices` son listas de columnas; se derivan de por dónde filtra
    `bi_service`, no de una intuición. Un índice que nadie usa sólo hace más
    lenta la carga.
    """

    tabla: str
    parquet: str
    indices: list[list[str]] = field(default_factory=list)
    #: columna → `COMMENT ON COLUMN`. Para lo que se lee mal sin explicación:
    #: estas tablas no tienen modelo SQLAlchemy donde poner `comment=`.
    comentarios: dict[str, str] = field(default_factory=dict)
    #: Columnas candidatas (la primera que exista) de las que sale la columna
    #: generada `COLUMNA_BUSCABLE`: el texto sin tildes y en minúsculas, con un
    #: índice de trigramas. Es donde la API busca por comienzo de palabra
    #: (`backend/app/repositories/busqueda.py`). Columna generada y no índice por
    #: expresión, como `licitaciones.nombre_norm`.
    buscable: tuple[str, ...] = ()


def _tipo_pg(dtype) -> str:
    for pl_tipo, pg_tipo in _TIPOS.items():
        if dtype == pl_tipo:
            return pg_tipo
    return "TEXT"


def _identificador(nombre: str) -> str:
    """Cita un identificador para SQL.

    Los parquets traen columnas en camelCase (`codigoProductoONU`) que Postgres
    plegaría a minúsculas si no se citan. Se preservan tal cual para que el
    código de la API siga usando los mismos nombres que en Polars.
    """
    return '"' + nombre.replace('"', '""') + '"'


def _ddl_columnas(df: pl.DataFrame) -> str:
    return ",\n  ".join(
        f"{_identificador(col)} {_tipo_pg(dtype)}"
        for col, dtype in zip(df.columns, df.dtypes, strict=True)
    )


def materializar(
    df: pl.DataFrame,
    spec: TablaAnalytics,
    engine: Engine,
    *,
    schema: str = SCHEMA,
) -> int:
    """Reemplaza `schema.spec.tabla` con el contenido de `df`. Devuelve las filas cargadas."""
    tmp = f"{spec.tabla}__cargando"
    q_tabla = f"{_identificador(schema)}.{_identificador(spec.tabla)}"
    q_tmp = f"{_identificador(schema)}.{_identificador(tmp)}"

    origen_buscable = next((c for c in spec.buscable if c in df.columns), None)
    if spec.buscable and origen_buscable is None:
        logger.warning(
            "%s: no tiene ninguna de %s — sin columna buscable", spec.tabla, spec.buscable
        )
    ddl = _ddl_columnas(df)
    if origen_buscable is not None:
        # COPY sin lista de columnas se salta las generadas: el CSV no cambia.
        ddl += (
            f",\n  {_identificador(COLUMNA_BUSCABLE)} TEXT GENERATED ALWAYS AS "
            f"({sql_normalizado(_identificador(origen_buscable))}) STORED"
        )
    indices_trgm = [[COLUMNA_BUSCABLE]] if origen_buscable is not None else []

    with engine.begin() as conn:
        conn.execute(text(f"DROP TABLE IF EXISTS {q_tmp}"))
        conn.execute(text(f"CREATE TABLE {q_tmp} (\n  {ddl}\n)"))

    # COPY desde CSV en memoria. Es el camino más rápido de Polars a Postgres sin
    # añadir dependencias, y respeta los NULL con la opción NULL ''.
    buffer = io.BytesIO()
    df.write_csv(buffer, include_header=True)
    buffer.seek(0)

    raw = engine.raw_connection()
    try:
        with raw.cursor() as cur:
            cur.copy_expert(
                f"COPY {q_tmp} FROM STDIN WITH (FORMAT CSV, HEADER TRUE, NULL '')",
                buffer,
            )
        raw.commit()
    finally:
        raw.close()

    # Los índices se crean sobre la tabla nueva, antes del swap: así la tabla
    # entra en servicio ya indexada y nunca hay una ventana sin índices. Los
    # comentarios también: sobreviven al RENAME.
    with engine.begin() as conn:
        for columna, comentario in spec.comentarios.items():
            if columna not in df.columns:
                logger.warning("%s: comentario sobre %s, que no existe", spec.tabla, columna)
                continue
            conn.execute(
                text(f"COMMENT ON COLUMN {q_tmp}.{_identificador(columna)} IS :c").bindparams(
                    c=comentario
                )
            )
        for cols in spec.indices:
            faltantes = [c for c in cols if c not in df.columns]
            if faltantes:
                logger.warning(
                    "%s: se omite el índice sobre %s — faltan columnas %s",
                    spec.tabla,
                    cols,
                    faltantes,
                )
                continue
            nombre_tmp = f"ix_{tmp}_{'_'.join(cols)}"[:63]
            conn.execute(
                text(
                    f"CREATE INDEX {_identificador(nombre_tmp)} ON {q_tmp} "
                    f"({', '.join(_identificador(c) for c in cols)})"
                )
            )
        for cols in indices_trgm:
            nombre_tmp = f"ix_{tmp}_{'_'.join(cols)}"[:63]
            conn.execute(
                text(
                    f"CREATE INDEX {_identificador(nombre_tmp)} ON {q_tmp} "
                    f"USING gin ({_identificador(cols[0])} gin_trgm_ops)"
                )
            )

        # Swap atómico. La API o ve la versión anterior completa, o la nueva
        # completa: nunca una mezcla ni una tabla vacía.
        conn.execute(text(f"DROP TABLE IF EXISTS {q_tabla} CASCADE"))
        conn.execute(text(f"ALTER TABLE {q_tmp} RENAME TO {_identificador(spec.tabla)}"))
        for cols in [*spec.indices, *indices_trgm]:
            if any(c not in df.columns and c != COLUMNA_BUSCABLE for c in cols):
                continue
            nombre_tmp = f"ix_{tmp}_{'_'.join(cols)}"[:63]
            nombre_final = f"ix_{spec.tabla}_{'_'.join(cols)}"[:63]
            conn.execute(
                text(
                    f"ALTER INDEX {_identificador(schema)}.{_identificador(nombre_tmp)} "
                    f"RENAME TO {_identificador(nombre_final)}"
                )
            )
        conn.execute(text(f"ANALYZE {q_tabla}"))

    logger.info("analytics.%s materializada: %d filas", spec.tabla, len(df))
    return len(df)


def materializar_desde_parquet(
    directorio: Path,
    spec: TablaAnalytics,
    engine: Engine,
    *,
    schema: str = SCHEMA,
) -> int | None:
    """Igual que `materializar`, leyendo el parquet del disco.

    Devuelve None si el parquet no existe: el pipeline no genera los 35 archivos
    en toda corrida, y la ausencia de uno no debe tumbar la materialización de
    los demás.
    """
    ruta = directorio / spec.parquet
    if not ruta.exists():
        logger.warning("no existe %s — se omite %s", ruta, spec.tabla)
        return None
    return materializar(pl.read_parquet(ruta), spec, engine, schema=schema)
