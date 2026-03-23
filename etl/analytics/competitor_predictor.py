"""
Predictor de Número de Competidores por Contexto

Calcula la distribución histórica del número de oferentes en licitaciones,
segmentado por:
  - Organismo comprador
  - Rubro (nivel 2)
  - Tipo de licitación

Permite a un proveedor PYME responder:
  "Cuando el Hospital X licita insumos médicos (LQ), históricamente
   recibe 3–6 ofertas. Con 4 competidores esperados, mi probabilidad
   de adjudicar siendo competitivo es ~25 %."

También identifica licitaciones con competencia anormalmente baja (< 2 oferentes),
lo que puede indicar mercados cautivos o nichos de especialidad.

Output:
  - competitor_forecast.parquet: distribución de N por (organismo, rubro, tipo)
  - competitor_low_competition.parquet: contextos con < 2 oferentes habituales
"""

import logging

import polars as pl

from .config import OUTPUT_DIR
from .data_loader import iter_lic_parquets

logger = logging.getLogger(__name__)

MIN_N = 5  # mínimo de licitaciones para estimar distribución


def extract_lic_competition() -> pl.DataFrame:
    """
    Extrae número de oferentes por licitación, una fila por CodigoExterno.
    Deduplica por licitación (múltiples líneas → una fila con primer dato).
    """
    logger.info("Extrayendo número de oferentes por licitación...")

    cols_needed = [
        "CodigoExterno", "CodigoOrganismo", "NombreOrganismo",
        "Rubro2", "CodigoTipo", "NumeroOferentes", "sector",
        "MontoEstimado", "_periodo_archivo",
    ]

    frames = []
    seen_lics: set[str] = set()

    for periodo, df in iter_lic_parquets(columns=cols_needed):
        if "CodigoExterno" not in df.columns or "NumeroOferentes" not in df.columns:
            continue

        batch = (
            df
            .filter(pl.col("CodigoExterno").is_not_null() & (pl.col("CodigoExterno") != "null"))
            .with_columns([
                pl.col("NumeroOferentes").cast(pl.Float64, strict=False).alias("n_ofer"),
                pl.col("MontoEstimado").cast(pl.Float64, strict=False).alias("monto_est"),
            ])
            .filter(pl.col("n_ofer").is_not_null() & (pl.col("n_ofer") >= 0))
            # Una fila por licitación
            .group_by("CodigoExterno")
            .agg([
                pl.col("CodigoOrganismo").first(),
                pl.col("NombreOrganismo").first(),
                pl.col("Rubro2").first(),
                pl.col("CodigoTipo").first(),
                pl.col("n_ofer").first(),
                pl.col("monto_est").first(),
                pl.col("sector").first(),
                pl.col("_periodo_archivo").first(),
            ])
        )

        # Desduplicar cross-file
        if seen_lics:
            batch = batch.filter(~pl.col("CodigoExterno").is_in(list(seen_lics)))

        if len(batch) > 0:
            seen_lics.update(batch["CodigoExterno"].to_list())
            frames.append(batch)

    if not frames:
        return pl.DataFrame()

    result = pl.concat(frames, how="diagonal_relaxed")
    logger.info(f"Licitaciones con dato de oferentes: {len(result):,}")
    logger.info(f"  Oferentes mediano: {result['n_ofer'].median():.1f}")
    logger.info(f"  Con 1 oferente: {(result['n_ofer'] == 1).sum():,} ({100*(result['n_ofer'] == 1).mean():.1f}%)")
    return result


def compute_competitor_forecast(lics: pl.DataFrame) -> pl.DataFrame:
    """
    Distribución de N oferentes por (CodigoOrganismo, Rubro2, CodigoTipo).

    Jerarquía de granularidad:
      L1: organismo + rubro + tipo  (más específico)
      L2: rubro + tipo              (fallback)
      L3: tipo                      (fallback final)
    """
    logger.info("Calculando distribución de competidores por contexto...")

    def _compute(df: pl.DataFrame, group_cols: list[str], level: int) -> pl.DataFrame:
        return (
            df
            .filter(all(
                pl.col(c).is_not_null() & (pl.col(c) != "null")
                for c in group_cols
            ))
            .group_by(group_cols)
            .agg([
                pl.len().alias("n"),
                pl.col("n_ofer").quantile(0.10).alias("p10"),
                pl.col("n_ofer").quantile(0.25).alias("p25"),
                pl.col("n_ofer").median().alias("p50"),
                pl.col("n_ofer").quantile(0.75).alias("p75"),
                pl.col("n_ofer").quantile(0.90).alias("p90"),
                pl.col("n_ofer").mean().alias("media"),
                pl.col("n_ofer").std().alias("std"),
                (pl.col("n_ofer") <= 1).sum().alias("n_sin_competencia"),
                (pl.col("n_ofer") <= 3).sum().alias("n_baja_competencia"),
            ])
            .filter(pl.col("n") >= MIN_N)
            .with_columns([
                pl.lit(level).alias("nivel"),
                (pl.col("n_sin_competencia") / pl.col("n")).alias("pct_sin_competencia"),
                (pl.col("n_baja_competencia") / pl.col("n")).alias("pct_baja_competencia"),
            ])
        )

    # L1: organismo + rubro + tipo
    l1_cols = ["CodigoOrganismo", "NombreOrganismo", "Rubro2", "CodigoTipo"]
    l1 = _compute(lics, [c for c in l1_cols if c in lics.columns], 1)

    # L2: rubro + tipo
    l2 = _compute(lics, ["Rubro2", "CodigoTipo"], 2)

    # L3: solo tipo
    l3 = _compute(lics, ["CodigoTipo"], 3)

    logger.info(f"  L1 (org+rubro+tipo): {len(l1):,} contextos")
    logger.info(f"  L2 (rubro+tipo):     {len(l2):,} contextos")
    logger.info(f"  L3 (solo tipo):      {len(l3):,} contextos")

    # Combinar con columnas variables: guardar por separado pero devolver todo
    return {"l1": l1, "l2": l2, "l3": l3}


def compute_low_competition_markets(lics: pl.DataFrame) -> pl.DataFrame:
    """
    Identifica mercados donde la competencia es estructuralmente baja:
    > 60 % de las licitaciones tienen ≤ 2 oferentes.
    Estos son nichos de alta oportunidad para quien ya opera en el mercado.
    """
    logger.info("Identificando mercados de baja competencia...")

    result = (
        lics
        .filter(
            pl.col("Rubro2").is_not_null() & (pl.col("Rubro2") != "null") &
            pl.col("CodigoTipo").is_not_null()
        )
        .group_by(["CodigoOrganismo", "NombreOrganismo", "Rubro2", "CodigoTipo"])
        .agg([
            pl.len().alias("n"),
            pl.col("n_ofer").median().alias("oferentes_mediano"),
            (pl.col("n_ofer") <= 2).sum().alias("n_pocos_oferentes"),
        ])
        .filter(pl.col("n") >= 10)
        .with_columns([
            (pl.col("n_pocos_oferentes") / pl.col("n")).alias("pct_pocos_oferentes"),
        ])
        .filter(pl.col("pct_pocos_oferentes") >= 0.60)
        .sort("n", descending=True)
    )

    logger.info(f"Mercados de baja competencia: {len(result):,}")
    return result


def run_competitor_predictor() -> dict[str, pl.DataFrame]:
    """Ejecuta pipeline completo de predicción de competidores."""
    logger.info("=" * 60)
    logger.info("PREDICTOR DE NÚMERO DE COMPETIDORES")
    logger.info("=" * 60)

    lics = extract_lic_competition()
    if lics.is_empty():
        logger.error("No se obtuvieron datos de competidores")
        return {}

    forecasts = compute_competitor_forecast(lics)
    for level_name, df in forecasts.items():
        path = OUTPUT_DIR / f"competitor_forecast_{level_name}.parquet"
        df.write_parquet(path, compression="snappy")
        logger.info(f"Guardado: {path.name} ({path.stat().st_size / 1024 / 1024:.1f} MB)")

    low_comp = compute_low_competition_markets(lics)
    lc_path = OUTPUT_DIR / "competitor_low_competition.parquet"
    low_comp.write_parquet(lc_path, compression="snappy")
    logger.info(f"Guardado: {lc_path.name}")

    # Ejemplos
    logger.info("\nEjemplos de contextos con distribución conocida (L1):")
    top = forecasts["l1"].sort("n", descending=True).head(5)
    for row in top.iter_rows(named=True):
        logger.info(f"  {(row.get('NombreOrganismo') or '')[:30]:30s} | "
                    f"{(row.get('Rubro2') or '')[:25]:25s} | "
                    f"{row['CodigoTipo']:4s} → "
                    f"p25={row['p25']:.0f} p50={row['p50']:.0f} p75={row['p75']:.0f} ofer. "
                    f"(n={row['n']:,})")

    return {**forecasts, "low_competition": low_comp, "raw": lics}
