"""
Carga lazy de datos históricos con Polars.

Maneja schema drift entre años usando intersección de columnas disponibles.
Procesa archivo por archivo para controlar memoria.
"""

import logging
from datetime import date
from pathlib import Path

import polars as pl

from .config import LIC_COLS_CORE, LIC_PARQUET_DIR, MIN_YEAR, OC_COLS_CORE, OC_PARQUET_DIR
from .personas import codigos_persona_natural, columnas_para_enmascarar, enmascarar

logger = logging.getLogger(__name__)


def _available_cols(parquet_dir: Path, wanted: list[str]) -> list[str]:
    """Determina qué columnas del listado deseado existen en los parquets."""
    sample = next(parquet_dir.glob("*.parquet"), None)
    if sample is None:
        raise FileNotFoundError(f"No parquets in {parquet_dir}")
    schema = pl.read_parquet_schema(sample)
    return [c for c in wanted if c in schema]


#: Columnas numéricas del archivo de órdenes. Vienen como TEXTO y con COMA
#: decimal («1449449,75»): `cast(Float64, strict=False)` las convertía en nulo,
#: y cada módulo filtraba los nulos. Medido en los seis meses locales: **el 53 %
#: de las filas** tenía coma, así que más de la mitad de las compras no contaba
#: en ningún monto del BI — y sesgado: fuera quedaban justo las que tienen
#: centavos. No hay separador de miles, así que basta cambiar la coma.
NUMERICAS_OC = (
    "MontoTotalOC",
    "MontoTotalOC_PesosChilenos",
    "TotalNetoOC",
    "totalLineaNeto",
    "precioNeto",
    "cantidad",
    "totalCargos",
    "totalDescuentos",
    "totalImpuestos",
)


def con_numeros(df: pl.DataFrame) -> pl.DataFrame:
    """Las columnas numéricas presentes, como número (coma decimal incluida)."""
    return df.with_columns(
        [
            pl.col(c)
            .cast(pl.Utf8)
            .str.replace(",", ".", literal=True)
            .cast(pl.Float64, strict=False)
            for c in NUMERICAS_OC
            if c in df.columns
        ]
    )


#: Columnas de texto que el archivo marca como vacías con la PALABRA «NA» (o
#: «null», o nada). Los módulos filtraban `is_not_null()` y `!= "null"`, pero no
#: «NA»: así «NA» salía como un sector más en el mapa de sectores y como el rubro
#: más grande de la tabla de competencia (8.918 filas).
CATEGORICAS_OC = (
    "sector",
    "RubroN1",
    "RubroN2",
    "RubroN3",
    "RegionUnidadCompra",
    "CodigoOrganismoPublico",
    "CodigoProveedor",
)
MARCAS_DE_VACIO = ("NA", "null", "")


def con_vacios(df: pl.DataFrame) -> pl.DataFrame:
    """«NA», «null» y «» como nulos de verdad en las columnas categóricas."""
    return df.with_columns(
        [
            pl.when(pl.col(c).cast(pl.Utf8).str.strip_chars().is_in(MARCAS_DE_VACIO))
            .then(None)
            .otherwise(pl.col(c))
            .alias(c)
            for c in CATEGORICAS_OC
            if c in df.columns
        ]
    )


def con_monto_por_linea(df: pl.DataFrame) -> pl.DataFrame:
    """Añade `monto_linea_clp`: el total de la orden repartido entre sus líneas.

    El archivo trae una fila por LÍNEA y repite en cada una el total de la ORDEN
    (`MontoTotalOC_PesosChilenos`, verificado en 34.333 de 34.333 órdenes de
    varias líneas). Sumarlo por fila multiplicaba cada orden por su número de
    líneas (≈2,9) y, en una orden con ítems de varios rubros, le atribuía el
    total entero a cada uno. Se reparte en proporción a `totalLineaNeto`
    —que está en la moneda de la orden, por eso sólo se usa como peso— y,
    si no hay netos, a partes iguales. Sumado sobre cualquier agrupación da el
    monto correcto: las líneas de una orden suman exactamente su total.
    """
    if not {"Codigo", "MontoTotalOC_PesosChilenos"} <= set(df.columns):
        return df
    if "totalLineaNeto" in df.columns:
        neto = pl.col("totalLineaNeto").clip(lower_bound=0).fill_null(0)
        suma = neto.sum().over("Codigo")
        peso = pl.when(suma > 0).then(neto / suma).otherwise(1.0 / pl.len().over("Codigo"))
    else:
        peso = 1.0 / pl.len().over("Codigo")
    return df.with_columns((pl.col("MontoTotalOC_PesosChilenos") * peso).alias("monto_linea_clp"))


def orden_por_fila(df: pl.DataFrame) -> pl.DataFrame:
    """Una fila por ORDEN (la primera de sus líneas).

    Para lo que es de la orden y no de la línea —comprador, sector, región,
    fechas, estado, total—: contar filas contaba líneas (≈2,9 por orden).
    """
    if "Codigo" not in df.columns:
        return df
    return df.unique(subset=["Codigo"], keep="first", maintain_order=True)


def _columnas_para_montos(cols: list[str]) -> list[str]:
    """Quien pide el monto necesita también con qué repartirlo por línea."""
    if "MontoTotalOC_PesosChilenos" not in cols:
        return list(cols)
    return list(dict.fromkeys([*cols, "Codigo", "totalLineaNeto"]))


def _personas_naturales() -> frozenset[str]:
    """Los códigos a tapar, clasificados con TODA la historia de OC y LIC.

    Todo lo que sale de este módulo pasa por aquí: es el único camino hacia los
    parquets consolidados, y por eso el enmascarado vive en él (ver `personas`).
    """
    return codigos_persona_natural(OC_PARQUET_DIR, LIC_PARQUET_DIR)


def _leer(p: Path, cols: list[str]) -> pl.DataFrame:
    """Lee las columnas pedidas, con las personas naturales ya tapadas.

    Para decidir hacen falta el código y el RUT aunque el módulo no los pida;
    se leen y se descartan después.
    """
    esquema = pl.read_parquet_schema(p)
    pedidas = [c for c in cols if c in esquema]
    df = pl.read_parquet(p, columns=columnas_para_enmascarar(pedidas, esquema))
    return enmascarar(df, _personas_naturales()).select(pedidas)


def _escanear(p: Path, cols: list[str]) -> pl.LazyFrame:
    esquema = pl.read_parquet_schema(p)
    pedidas = [c for c in cols if c in esquema]
    lf = pl.scan_parquet(p).select(columnas_para_enmascarar(pedidas, esquema))
    return enmascarar(lf, _personas_naturales()).select(pedidas)


def _parse_periodo(periodo_str: str) -> tuple[int, int]:
    """Parsea '2024-3' → (2024, 3)."""
    parts = periodo_str.split("-")
    return int(parts[0]), int(parts[1])


def scan_oc(
    columns: list[str] | None = None,
    min_year: int = MIN_YEAR,
    max_date: date | None = None,
) -> pl.LazyFrame:
    """
    Carga lazy de todas las OC históricas, filtrando por año mínimo.
    Selecciona solo las columnas solicitadas (o core por defecto).
    """
    cols = columns or OC_COLS_CORE
    available = _available_cols(OC_PARQUET_DIR, cols)

    parquets = sorted(OC_PARQUET_DIR.glob("*.parquet"))
    # Filtrar por año basándose en el nombre del archivo
    filtered = []
    for p in parquets:
        year, _ = _parse_periodo(p.stem)
        if year >= min_year:
            filtered.append(p)

    if not filtered:
        raise FileNotFoundError(f"No OC parquets found for year >= {min_year}")

    logger.info(f"Scanning {len(filtered)} OC parquets ({filtered[0].stem} → {filtered[-1].stem})")

    frames = []
    for p in filtered:
        try:
            file_schema = pl.read_parquet_schema(p)
            lf = _escanear(p, available)
            if max_date is not None and "FechaCreacion" in file_schema:
                lf = lf.filter(pl.col("FechaCreacion").cast(pl.Date) <= pl.lit(max_date))
            frames.append(lf)
        except Exception as e:
            logger.warning(f"Skip {p.name}: {e}")

    return pl.concat(frames, how="diagonal_relaxed")


def scan_lic(
    columns: list[str] | None = None,
    min_year: int = MIN_YEAR,
    max_date: date | None = None,
) -> pl.LazyFrame:
    """Carga lazy de todas las licitaciones históricas."""
    cols = columns or LIC_COLS_CORE
    available = _available_cols(LIC_PARQUET_DIR, cols)

    parquets = sorted(LIC_PARQUET_DIR.glob("*.parquet"))
    filtered = []
    for p in parquets:
        year, _ = _parse_periodo(p.stem)
        if year >= min_year:
            filtered.append(p)

    if not filtered:
        raise FileNotFoundError(f"No LIC parquets found for year >= {min_year}")

    logger.info(f"Scanning {len(filtered)} LIC parquets ({filtered[0].stem} → {filtered[-1].stem})")

    frames = []
    for p in filtered:
        try:
            file_schema = pl.read_parquet_schema(p)
            lf = _escanear(p, available)
            if max_date is not None and "FechaCreacion" in file_schema:
                lf = lf.filter(pl.col("FechaCreacion").cast(pl.Date) <= pl.lit(max_date))
            frames.append(lf)
        except Exception as e:
            logger.warning(f"Skip {p.name}: {e}")

    return pl.concat(frames, how="diagonal_relaxed")


def iter_oc_parquets(
    columns: list[str] | None = None,
    min_year: int = MIN_YEAR,
    max_date: date | None = None,
):
    """
    Iterador que yield un DataFrame a la vez (para procesamiento batch
    cuando no se puede materializar todo en memoria).

    Si `max_date` está seteado, filtra in-place cada DF a FechaCreacion <= max_date.
    """
    cols = _columnas_para_montos(columns or OC_COLS_CORE)
    if max_date is not None and "FechaCreacion" not in cols:
        cols = list(cols) + ["FechaCreacion"]

    for p in sorted(OC_PARQUET_DIR.glob("*.parquet")):
        year, _ = _parse_periodo(p.stem)
        if year < min_year:
            continue
        try:
            df = _leer(p, cols)
            if max_date is not None and "FechaCreacion" in df.columns:
                df = df.filter(pl.col("FechaCreacion").cast(pl.Date) <= max_date)
            yield p.stem, con_monto_por_linea(con_numeros(con_vacios(df)))
        except Exception as e:
            logger.warning(f"Skip {p.name}: {e}")


def iter_lic_parquets(
    columns: list[str] | None = None,
    min_year: int = MIN_YEAR,
    max_date: date | None = None,
):
    """Iterador de LIC parquets uno a la vez."""
    cols = columns or LIC_COLS_CORE
    if max_date is not None and "FechaCreacion" not in cols:
        cols = list(cols) + ["FechaCreacion"]

    for p in sorted(LIC_PARQUET_DIR.glob("*.parquet")):
        year, _ = _parse_periodo(p.stem)
        if year < min_year:
            continue
        try:
            df = _leer(p, cols)
            if max_date is not None and "FechaCreacion" in df.columns:
                df = df.filter(pl.col("FechaCreacion").cast(pl.Date) <= max_date)
            yield p.stem, df
        except Exception as e:
            logger.warning(f"Skip {p.name}: {e}")
