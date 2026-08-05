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

logger = logging.getLogger(__name__)


def _available_cols(parquet_dir: Path, wanted: list[str]) -> list[str]:
    """Determina qué columnas del listado deseado existen en los parquets."""
    sample = next(parquet_dir.glob("*.parquet"), None)
    if sample is None:
        raise FileNotFoundError(f"No parquets in {parquet_dir}")
    schema = pl.read_parquet_schema(sample)
    return [c for c in wanted if c in schema]


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
            lf = pl.scan_parquet(p)
            # Seleccionar solo columnas disponibles en este archivo
            file_schema = pl.read_parquet_schema(p)
            file_cols = [c for c in available if c in file_schema]
            lf = lf.select(file_cols)
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
            lf = pl.scan_parquet(p)
            file_schema = pl.read_parquet_schema(p)
            file_cols = [c for c in available if c in file_schema]
            lf = lf.select(file_cols)
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
    cols = columns or OC_COLS_CORE
    if max_date is not None and "FechaCreacion" not in cols:
        cols = list(cols) + ["FechaCreacion"]

    for p in sorted(OC_PARQUET_DIR.glob("*.parquet")):
        year, _ = _parse_periodo(p.stem)
        if year < min_year:
            continue
        try:
            schema = pl.read_parquet_schema(p)
            avail = [c for c in cols if c in schema]
            df = pl.read_parquet(p, columns=avail)
            if max_date is not None and "FechaCreacion" in df.columns:
                df = df.filter(pl.col("FechaCreacion").cast(pl.Date) <= max_date)
            yield p.stem, df
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
            schema = pl.read_parquet_schema(p)
            avail = [c for c in cols if c in schema]
            df = pl.read_parquet(p, columns=avail)
            if max_date is not None and "FechaCreacion" in df.columns:
                df = df.filter(pl.col("FechaCreacion").cast(pl.Date) <= max_date)
            yield p.stem, df
        except Exception as e:
            logger.warning(f"Skip {p.name}: {e}")
