"""
Descuento Óptimo por Contexto de Licitación

Calcula la distribución histórica de descuentos aplicados sobre el
MontoEstimado en licitaciones adjudicadas, segmentado por contexto:
  - Tipo de licitación (LE, LP, LQ, LR, LS, TD, …)
  - Rubro (Rubro2 nivel 2)
  - Rango de oferentes (proxy de competencia)

Un "descuento" = (MontoEstimado - MontoAdjudicado) / MontoEstimado.
  - discount > 0 → ganó por debajo del presupuesto estimado
  - discount < 0 → monto adjudicado supera el estimado (suele ocurrir en servicios)

El output permite a un proveedor PYME responder:
  "En licitaciones de limpieza (LQ) con 4–6 competidores, el descuento
   mediano es 12 %. Si mi costo mínimo me obliga a descontar solo 8 %,
   tengo baja probabilidad de adjudicar."

Output:
  - discount_by_context.parquet: p10/p25/p50/p75/p90 de descuento por contexto
  - discount_summary.parquet: resumen por tipo de licitación + rubro
"""

import logging

import polars as pl

from .config import OUTPUT_DIR
from .data_loader import iter_lic_parquets

logger = logging.getLogger(__name__)


# Rangos de competidores
def _bucket_oferentes(col: pl.Expr) -> pl.Expr:
    return (
        pl.when(col <= 1)
        .then(pl.lit("1"))
        .when(col <= 3)
        .then(pl.lit("2-3"))
        .when(col <= 6)
        .then(pl.lit("4-6"))
        .when(col <= 10)
        .then(pl.lit("7-10"))
        .otherwise(pl.lit("11+"))
    )


def extract_lic_discounts() -> pl.DataFrame:
    """
    Extrae descuentos por licitación adjudicada.

    Por cada licitación (CodigoExterno):
      - MontoEstimado: presupuesto base declarado por el organismo
      - MontoAdjudicado: suma de MontoLineaAdjudica de líneas adjudicadas
      - discount: (MontoEstimado - MontoAdjudicado) / MontoEstimado

    Usa map-reduce: agrega por licitación dentro de cada archivo mensual
    para evitar duplicados cross-file.
    """
    logger.info("Extrayendo descuentos de licitaciones adjudicadas...")

    cols_needed = [
        "CodigoExterno",
        "CodigoTipo",
        "Rubro2",
        "NumeroOferentes",
        "MontoEstimado",
        "MontoLineaAdjudica",
        "Estado",
        "CodigoOrganismo",
        "NombreOrganismo",
        "sector",
    ]

    # Acumulamos una fila por licitación por archivo
    lic_frames = []
    seen_lics: set[str] = set()

    for _periodo, df in iter_lic_parquets(columns=cols_needed):
        if "CodigoExterno" not in df.columns:
            continue
        if "MontoEstimado" not in df.columns or "MontoLineaAdjudica" not in df.columns:
            continue

        # Solo licitaciones adjudicadas
        estado_col = "Estado" if "Estado" in df.columns else None

        batch = df.filter(
            pl.col("CodigoExterno").is_not_null() & (pl.col("CodigoExterno") != "null")
        ).with_columns(
            [
                pl.col("MontoEstimado").cast(pl.Float64, strict=False).alias("monto_est"),
                pl.col("MontoLineaAdjudica").cast(pl.Float64, strict=False).alias("monto_adj_line"),
                pl.col("NumeroOferentes").cast(pl.Float64, strict=False).alias("n_ofer"),
            ]
        )

        if estado_col:
            batch = batch.filter(pl.col("Estado").str.to_lowercase().str.contains("adjudicad"))

        # Agregar por licitación: sum de líneas adjudicadas, first del resto
        agg = (
            batch.filter(
                pl.col("monto_est").is_not_null()
                & (pl.col("monto_est") > 0)
                & pl.col("monto_adj_line").is_not_null()
                & (pl.col("monto_adj_line") > 0)
            )
            .group_by("CodigoExterno")
            .agg(
                [
                    pl.col("CodigoTipo").first(),
                    pl.col("Rubro2").first(),
                    pl.col("n_ofer").first(),
                    pl.col("monto_est").first(),
                    pl.col("monto_adj_line").sum().alias("monto_adj_total"),
                    pl.col("CodigoOrganismo").first(),
                    pl.col("NombreOrganismo").first(),
                    pl.col("sector").first(),
                ]
            )
        )

        # Excluir licitaciones ya vistas (pueden aparecer en múltiples meses)
        if seen_lics:
            agg = agg.filter(~pl.col("CodigoExterno").is_in(list(seen_lics)))

        if len(agg) > 0:
            seen_lics.update(agg["CodigoExterno"].to_list())
            lic_frames.append(agg)

    if not lic_frames:
        return pl.DataFrame()

    combined = pl.concat(lic_frames, how="diagonal_relaxed")
    logger.info(f"Licitaciones adjudicadas con datos: {len(combined):,}")

    # Calcular descuento y filtrar outliers extremos
    result = (
        # Los paréntesis alrededor de `> 0` NO son opcionales: en Python `&` liga
        # más fuerte que `>`, así que sin ellos esto se evalúa como
        # `monto_est > (0 & is_between(...))` y revienta con
        # "cannot unpack series of type bool into i32".
        combined.filter(
            (pl.col("monto_est") > 0)
            & (pl.col("monto_adj_total") / pl.col("monto_est")).is_between(-2.0, 2.0)
        )
        .with_columns(
            [
                ((pl.col("monto_est") - pl.col("monto_adj_total")) / pl.col("monto_est")).alias(
                    "discount"
                ),
                _bucket_oferentes(pl.col("n_ofer")).alias("n_oferentes_rango"),
            ]
        )
        .filter(pl.col("discount").is_not_null())
    )

    logger.info(f"Con descuento calculable: {len(result):,} licitaciones")
    logger.info(f"  Descuento mediano: {result['discount'].median():.1%}")
    logger.info(f"  Descuento p25: {result['discount'].quantile(0.25):.1%}")
    logger.info(f"  Descuento p75: {result['discount'].quantile(0.75):.1%}")
    return result


def compute_discount_by_context(lics: pl.DataFrame) -> pl.DataFrame:
    """Calcula distribución de descuentos por (Rubro2, CodigoTipo, n_oferentes_rango)."""
    logger.info("Calculando distribución de descuentos por contexto...")

    group_cols = ["CodigoTipo", "Rubro2", "n_oferentes_rango"]

    result = (
        lics.filter(
            pl.col("CodigoTipo").is_not_null()
            & (pl.col("CodigoTipo") != "null")
            & pl.col("Rubro2").is_not_null()
            & (pl.col("Rubro2") != "null")
        )
        .group_by(group_cols)
        .agg(
            [
                pl.len().alias("n"),
                pl.col("discount").quantile(0.10).alias("p10"),
                pl.col("discount").quantile(0.25).alias("p25"),
                pl.col("discount").median().alias("p50"),
                pl.col("discount").quantile(0.75).alias("p75"),
                pl.col("discount").quantile(0.90).alias("p90"),
                pl.col("discount").mean().alias("media"),
                pl.col("discount").std().alias("std"),
            ]
        )
        .filter(pl.col("n") >= 5)
        .with_columns(
            [
                # Contexto competitivo: cuánta presión hay en precio
                # discount alto + poca varianza → muy predecible, alta presión
                (pl.col("std") / (pl.col("media").abs() + 0.01)).clip(0, 5).alias("cv_descuento"),
                # Señal: si p50 < 0.05, el mercado no descuenta mucho (oportunidad)
                pl.when(pl.col("p50") >= 0.15)
                .then(pl.lit("alta_presión"))
                .when(pl.col("p50") >= 0.05)
                .then(pl.lit("presión_moderada"))
                .when(pl.col("p50") >= 0.0)
                .then(pl.lit("sin_descuento"))
                .otherwise(pl.lit("sobrepresupuesto"))
                .alias("señal_competencia"),
            ]
        )
        .sort(["CodigoTipo", "Rubro2", "n_oferentes_rango"])
    )

    logger.info(f"Contextos con ≥5 licitaciones: {len(result):,}")
    return result


def compute_discount_summary(lics: pl.DataFrame) -> pl.DataFrame:
    """Resumen más grueso: solo por (CodigoTipo, Rubro2)."""
    result = (
        lics.filter(
            pl.col("CodigoTipo").is_not_null()
            & (pl.col("CodigoTipo") != "null")
            & pl.col("Rubro2").is_not_null()
            & (pl.col("Rubro2") != "null")
        )
        .group_by(["CodigoTipo", "Rubro2"])
        .agg(
            [
                pl.len().alias("n_total"),
                pl.col("discount").median().alias("descuento_mediano"),
                pl.col("discount").quantile(0.25).alias("descuento_p25"),
                pl.col("discount").quantile(0.75).alias("descuento_p75"),
                pl.col("n_ofer").median().alias("oferentes_mediano"),
            ]
        )
        .filter(pl.col("n_total") >= 10)
        .sort("n_total", descending=True)
    )
    return result


def run_discount_optimizer() -> dict[str, pl.DataFrame]:
    """Ejecuta pipeline de análisis de descuentos óptimos."""
    logger.info("=" * 60)
    logger.info("DESCUENTO ÓPTIMO POR CONTEXTO")
    logger.info("=" * 60)

    lics = extract_lic_discounts()
    if lics.is_empty():
        logger.error("No se obtuvieron datos de licitaciones adjudicadas")
        return {}

    context = compute_discount_by_context(lics)
    ctx_path = OUTPUT_DIR / "discount_by_context.parquet"
    context.write_parquet(ctx_path, compression="snappy")
    logger.info(f"Guardado: {ctx_path.name} ({ctx_path.stat().st_size / 1024 / 1024:.1f} MB)")

    summary = compute_discount_summary(lics)
    sum_path = OUTPUT_DIR / "discount_summary.parquet"
    summary.write_parquet(sum_path, compression="snappy")
    logger.info(f"Guardado: {sum_path.name}")

    # Log ejemplos útiles
    logger.info("\nContextos con mayor presión de precio (p50 descuento):")
    top = context.sort("p50", descending=True).head(10)
    for row in top.iter_rows(named=True):
        logger.info(
            f"  {row['CodigoTipo']} | {(row['Rubro2'] or '')[:30]:30s} | "
            f"{row['n_oferentes_rango']:5s} ofer. → descuento mediano: {row['p50']:.1%} "
            f"(n={row['n']:,})"
        )

    return {"context": context, "summary": summary, "raw": lics}
