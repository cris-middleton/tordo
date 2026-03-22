"""
Bandas de Precio por Producto Específico — Predictor Jerárquico

Calcula bandas de precio unitario a la mayor granularidad posible,
con fallback a niveles más amplios cuando no hay datos suficientes.

Jerarquía de niveles (de más a menos preciso):

  Nivel 1 — Producto + Organismo + Unidad
    "Este hospital paga $800–$1,200 por unidad de este reactivo"
    Requiere: ≥5 transacciones en el par. Más preciso.

  Nivel 2 — Producto + Sector + Unidad
    "Los hospitales (sector Salud) pagan $700–$1,500 por este reactivo"
    Fallback cuando el organismo específico no tiene suficientes datos.

  Nivel 3 — Producto + Unidad (nacional)
    "A nivel nacional se paga $500–$2,000 por este reactivo"
    Fallback final, menos preciso pero cubre más productos.

Para cada banda se calcula:
  - p10, p25, p50 (mediana), p75, p90
  - n: cantidad de transacciones
  - cv: coeficiente de variación
  - confianza: score 0–1 basado en n y cv
  - nivel: 1, 2 o 3 (indica qué tan específica es la banda)

Filtrado de outliers:
  Se usa IQR × 1.5 (método de Tukey) dentro de cada grupo para eliminar
  precios unitarios anómalos antes de calcular bandas.

Output:
  - product_price_bands_L1.parquet: bandas nivel 1 (producto+organismo+unidad)
  - product_price_bands_L2.parquet: bandas nivel 2 (producto+sector+unidad)
  - product_price_bands_L3.parquet: bandas nivel 3 (producto+unidad nacional)
  - product_price_coverage.parquet: resumen de cobertura por producto
"""

import logging

import polars as pl

from .config import OUTPUT_DIR
from .data_loader import iter_oc_parquets

logger = logging.getLogger(__name__)

# Mínimo de transacciones por nivel
MIN_N_L1 = 5    # producto+organismo+unidad
MIN_N_L2 = 10   # producto+sector+unidad
MIN_N_L3 = 20   # producto+unidad (nacional)


# ─────────────────────────────────────────────────────────────────────
# Paso 1: Extraer ítems con precio unitario válido
# ─────────────────────────────────────────────────────────────────────

def extract_unit_prices() -> pl.DataFrame:
    """
    Extrae ítems de OC con precio unitario calculable.
    Filtra: qty > 1, UnidadMedida != Global, precio > 0.
    """
    logger.info("Extrayendo precios unitarios...")

    cols_needed = [
        "codigoProductoONU", "NombreroductoGenerico",
        "CodigoOrganismoPublico", "OrganismoPublico", "sector",
        "precioNeto", "cantidad", "UnidadMedida",
        "_periodo_archivo",
    ]

    frames = []

    for periodo, df in iter_oc_parquets(columns=cols_needed):
        required = ["codigoProductoONU", "precioNeto", "cantidad", "UnidadMedida"]
        if not all(c in df.columns for c in required):
            continue

        batch = (
            df
            .with_columns([
                pl.col("precioNeto").cast(pl.Float64, strict=False).alias("precio"),
                pl.col("cantidad").cast(pl.Float64, strict=False).alias("qty"),
            ])
            .filter(
                pl.col("precio").is_not_null() & (pl.col("precio") > 0) &
                pl.col("qty").is_not_null() & (pl.col("qty") > 1) &
                pl.col("codigoProductoONU").is_not_null() &
                (pl.col("codigoProductoONU") != "null") &
                pl.col("UnidadMedida").is_not_null() &
                (pl.col("UnidadMedida") != "Global") &
                (pl.col("UnidadMedida") != "null")
            )
            .with_columns([
                (pl.col("precio") / pl.col("qty")).alias("pu"),
            ])
            .filter((pl.col("pu") > 0) & (pl.col("pu") < 1e9))
            .select([
                "codigoProductoONU", "NombreroductoGenerico",
                "CodigoOrganismoPublico", "OrganismoPublico",
                "sector", "UnidadMedida", "pu", "_periodo_archivo",
            ])
        )
        frames.append(batch)

    if not frames:
        return pl.DataFrame()

    result = pl.concat(frames, how="diagonal_relaxed")
    logger.info(f"Items con precio unitario: {len(result):,}")
    return result


# ─────────────────────────────────────────────────────────────────────
# Paso 2: Filtro de outliers por IQR (Tukey)
# ─────────────────────────────────────────────────────────────────────

def remove_outliers_iqr(df: pl.DataFrame, group_cols: list[str], value_col: str = "pu") -> pl.DataFrame:
    """
    Elimina outliers usando IQR × 1.5 dentro de cada grupo.
    Conserva solo valores dentro de [Q1 - 1.5·IQR, Q3 + 1.5·IQR].
    """
    bounds = (
        df
        .group_by(group_cols)
        .agg([
            pl.col(value_col).quantile(0.25).alias("_q1"),
            pl.col(value_col).quantile(0.75).alias("_q3"),
        ])
        .with_columns([
            (pl.col("_q3") - pl.col("_q1")).alias("_iqr"),
        ])
        .with_columns([
            (pl.col("_q1") - 1.5 * pl.col("_iqr")).alias("_lower"),
            (pl.col("_q3") + 1.5 * pl.col("_iqr")).alias("_upper"),
        ])
    )

    filtered = (
        df
        .join(bounds, on=group_cols, how="left")
        .filter(
            (pl.col(value_col) >= pl.col("_lower")) &
            (pl.col(value_col) <= pl.col("_upper"))
        )
        .drop(["_q1", "_q3", "_iqr", "_lower", "_upper"])
    )

    removed = len(df) - len(filtered)
    logger.info(f"  Outliers removidos: {removed:,} ({100*removed/max(len(df),1):.1f}%)")
    return filtered


# ─────────────────────────────────────────────────────────────────────
# Paso 3: Calcular bandas por nivel
# ─────────────────────────────────────────────────────────────────────

def _compute_bands(df: pl.DataFrame, group_cols: list[str], min_n: int, level: int) -> pl.DataFrame:
    """Calcula bandas de precio para un nivel de agrupación dado."""

    bands = (
        df
        .group_by(group_cols)
        .agg([
            pl.len().alias("n"),
            pl.col("pu").quantile(0.10).alias("p10"),
            pl.col("pu").quantile(0.25).alias("p25"),
            pl.col("pu").median().alias("p50"),
            pl.col("pu").quantile(0.75).alias("p75"),
            pl.col("pu").quantile(0.90).alias("p90"),
            pl.col("pu").mean().alias("pu_mean"),
            pl.col("pu").std().alias("pu_std"),
            pl.col("pu").min().alias("pu_min"),
            pl.col("pu").max().alias("pu_max"),
        ])
        .filter(pl.col("n") >= min_n)
        .with_columns([
            # Coeficiente de variación
            (pl.col("pu_std") / pl.col("pu_mean").clip(lower_bound=0.01)).alias("cv"),
            # Ratio intercuartil
            (pl.col("p75") / pl.col("p25").clip(lower_bound=0.01)).alias("ratio_iqr"),
            # Score de confianza: combina tamaño muestral y dispersión
            # confianza = min(1, log(n)/log(100)) × max(0, 1 - cv)
            # n grande + cv bajo = alta confianza
            (
                (pl.col("n").log() / 4.605).clip(0, 1) *  # log(100) ≈ 4.605
                (1 - (pl.col("pu_std") / pl.col("pu_mean").clip(lower_bound=0.01)).clip(0, 2) / 2)
            ).clip(0, 1).round(3).alias("confianza"),
            # Nivel de la banda
            pl.lit(level).alias("nivel"),
        ])
    )

    return bands


def build_level_1(items: pl.DataFrame) -> pl.DataFrame:
    """Nivel 1: Producto + Organismo + Unidad de Medida."""
    logger.info("Calculando bandas Nivel 1 (Producto+Organismo+Unidad)...")

    group_cols = ["codigoProductoONU", "NombreroductoGenerico",
                  "CodigoOrganismoPublico", "OrganismoPublico", "UnidadMedida"]

    cleaned = remove_outliers_iqr(items, group_cols[:3] + [group_cols[4]])
    bands = _compute_bands(cleaned, group_cols, MIN_N_L1, level=1)

    n_pred = bands.filter(pl.col("confianza") >= 0.5).height
    logger.info(f"  L1: {len(bands):,} bandas ({n_pred:,} con confianza ≥ 0.5)")
    return bands


def build_level_2(items: pl.DataFrame) -> pl.DataFrame:
    """Nivel 2: Producto + Sector + Unidad de Medida."""
    logger.info("Calculando bandas Nivel 2 (Producto+Sector+Unidad)...")

    group_cols = ["codigoProductoONU", "NombreroductoGenerico",
                  "sector", "UnidadMedida"]

    cleaned = remove_outliers_iqr(items, [group_cols[0], group_cols[2], group_cols[3]])
    bands = _compute_bands(cleaned, group_cols, MIN_N_L2, level=2)

    n_pred = bands.filter(pl.col("confianza") >= 0.5).height
    logger.info(f"  L2: {len(bands):,} bandas ({n_pred:,} con confianza ≥ 0.5)")
    return bands


def build_level_3(items: pl.DataFrame) -> pl.DataFrame:
    """Nivel 3: Producto + Unidad de Medida (nacional)."""
    logger.info("Calculando bandas Nivel 3 (Producto+Unidad, nacional)...")

    group_cols = ["codigoProductoONU", "NombreroductoGenerico", "UnidadMedida"]

    cleaned = remove_outliers_iqr(items, [group_cols[0], group_cols[2]])
    bands = _compute_bands(cleaned, group_cols, MIN_N_L3, level=3)

    n_pred = bands.filter(pl.col("confianza") >= 0.5).height
    logger.info(f"  L3: {len(bands):,} bandas ({n_pred:,} con confianza ≥ 0.5)")
    return bands


# ─────────────────────────────────────────────────────────────────────
# Paso 4: Resumen de cobertura
# ─────────────────────────────────────────────────────────────────────

def build_coverage_summary(l1: pl.DataFrame, l2: pl.DataFrame, l3: pl.DataFrame) -> pl.DataFrame:
    """
    Resumen por producto: en cuántos niveles tiene banda y con qué confianza.
    Útil para saber qué productos se pueden cotizar con confianza.
    """
    logger.info("Generando resumen de cobertura...")

    def _product_summary(df: pl.DataFrame, level_name: str) -> pl.DataFrame:
        return (
            df
            .group_by("codigoProductoONU")
            .agg([
                pl.len().alias(f"n_bandas_{level_name}"),
                pl.col("confianza").max().alias(f"max_confianza_{level_name}"),
                pl.col("n").sum().alias(f"total_transacciones_{level_name}"),
            ])
        )

    s1 = _product_summary(l1, "L1")
    s2 = _product_summary(l2, "L2")
    s3 = _product_summary(l3, "L3")

    # Nombre del producto (tomar el más frecuente)
    product_names = (
        pl.concat([
            l1.select(["codigoProductoONU", "NombreroductoGenerico"]),
            l2.select(["codigoProductoONU", "NombreroductoGenerico"]),
            l3.select(["codigoProductoONU", "NombreroductoGenerico"]),
        ], how="diagonal_relaxed")
        .group_by("codigoProductoONU")
        .first()
    )

    coverage = (
        product_names
        .join(s1, on="codigoProductoONU", how="left")
        .join(s2, on="codigoProductoONU", how="left")
        .join(s3, on="codigoProductoONU", how="left")
        .with_columns([
            # Mejor nivel disponible
            pl.when(pl.col("n_bandas_L1").is_not_null() & (pl.col("n_bandas_L1") > 0))
            .then(1)
            .when(pl.col("n_bandas_L2").is_not_null() & (pl.col("n_bandas_L2") > 0))
            .then(2)
            .when(pl.col("n_bandas_L3").is_not_null() & (pl.col("n_bandas_L3") > 0))
            .then(3)
            .otherwise(0)
            .alias("mejor_nivel"),
            # Mejor confianza
            pl.max_horizontal(
                pl.col("max_confianza_L1").fill_null(0),
                pl.col("max_confianza_L2").fill_null(0),
                pl.col("max_confianza_L3").fill_null(0),
            ).alias("mejor_confianza"),
        ])
        .sort("mejor_confianza", descending=True)
    )

    for lvl in [1, 2, 3]:
        n = coverage.filter(pl.col("mejor_nivel") == lvl).height
        logger.info(f"  Productos cubiertos en Nivel {lvl}: {n:,}")

    alta_conf = coverage.filter(pl.col("mejor_confianza") >= 0.5).height
    logger.info(f"  Productos con confianza ≥ 0.5: {alta_conf:,}")

    return coverage


# ─────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────

def run_product_price_bands() -> dict[str, pl.DataFrame]:
    """Ejecuta pipeline completo de bandas de precio por producto."""
    logger.info("=" * 60)
    logger.info("BANDAS DE PRECIO POR PRODUCTO ESPECÍFICO")
    logger.info("=" * 60)

    items = extract_unit_prices()
    if items.is_empty():
        logger.error("No se extrajeron ítems con precio unitario")
        return {}

    # Calcular bandas por nivel
    l1 = build_level_1(items)
    l2 = build_level_2(items)
    l3 = build_level_3(items)

    # Guardar
    for name, df in [("L1", l1), ("L2", l2), ("L3", l3)]:
        path = OUTPUT_DIR / f"product_price_bands_{name}.parquet"
        df.write_parquet(path, compression="snappy")
        logger.info(f"Guardado: {path.name} ({path.stat().st_size / 1024 / 1024:.1f} MB)")

    # Cobertura
    coverage = build_coverage_summary(l1, l2, l3)
    cov_path = OUTPUT_DIR / "product_price_coverage.parquet"
    coverage.write_parquet(cov_path, compression="snappy")
    logger.info(f"Guardado: {cov_path.name}")

    # Ejemplo de uso
    logger.info("\nEjemplos de bandas de alta confianza (Nivel 1):")
    top = l1.filter(pl.col("confianza") >= 0.7).sort("n", descending=True).head(15)
    for row in top.iter_rows(named=True):
        nombre = (row["NombreroductoGenerico"] or "")[:35]
        org = (row["OrganismoPublico"] or "")[:25]
        print(f"  {nombre:35s} | {org:25s} | "
              f"${row['p25']:>10,.0f}–${row['p75']:>10,.0f}/{row['UnidadMedida']} | "
              f"n={row['n']:>4} | conf={row['confianza']:.2f}")

    return {"l1": l1, "l2": l2, "l3": l3, "coverage": coverage}
