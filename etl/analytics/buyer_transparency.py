"""
Índice de Transparencia del Comprador

Evalúa cuán transparente es el proceso de compra de cada organismo,
combinando tres dimensiones:

  1. % Trato Directo, de las ÓRDENES (`trato_directo.py`; en la descarga de
     licitaciones no hay ninguno, y por eso valía 0 % para todos).
     Compras sin competencia declarada. Alto % → menos oportunidades
     para nuevos proveedores, más riesgo de mercado cautivo.

  2. Tasa de fracaso de licitaciones (revocadas + desiertas / total)
     Alta tasa de fracaso puede indicar mal diseño de bases o favoritismo.

  3. Concentración de adjudicaciones (HHI de proveedores ganadores)
     Un organismo que siempre adjudica al mismo proveedor es opaco.

Score de transparencia (0 = muy opaco, 1 = muy transparente):
  score = 0.50 × (1 - pct_td) + 0.25 × (1 - tasa_fracaso) + 0.25 × (1 - hhi_norm)

Interpretación práctica para TORDO:
  - Score alto → organismo que compra por licitación, con múltiples oferentes,
    y distribuye entre proveedores. Más accesible para nuevos entrantes.
  - Score bajo → organismo que evita licitaciones o siempre adjudica al mismo.
    Proveedor nuevo debería priorizar otros clientes.

Output:
  - buyer_transparency.parquet: score e índices por organismo
"""

import logging

import polars as pl

from . import trato_directo
from .config import OUTPUT_DIR
from .data_loader import iter_lic_parquets
from .identidad import PERIODO, nombre_vigente

logger = logging.getLogger(__name__)

MIN_LIC = 20  # mínimo de licitaciones para que el score sea confiable


def build_transparency_metrics() -> pl.DataFrame:
    """Extrae métricas de transparencia desde datos LIC."""
    logger.info("Calculando métricas de transparencia por comprador...")

    cols_needed = [
        "CodigoExterno",
        "CodigoOrganismo",
        "NombreOrganismo",
        "sector",
        "Estado",
        "CodigoProveedor",
    ]

    frames = []
    seen_lics: set[str] = set()

    for periodo, df in iter_lic_parquets(columns=cols_needed):
        if "CodigoExterno" not in df.columns or "CodigoOrganismo" not in df.columns:
            continue

        estado_col = "Estado" if "Estado" in df.columns else None

        batch = df.filter(
            pl.col("CodigoExterno").is_not_null()
            & (pl.col("CodigoExterno") != "null")
            & pl.col("CodigoOrganismo").is_not_null()
            & (pl.col("CodigoOrganismo") != "null")
        )

        if len(batch) == 0:
            continue

        # Deduplicar por licitación (primera fila por CodigoExterno)
        lic_dedup = (
            batch.group_by("CodigoExterno")
            .agg(
                [
                    pl.col("CodigoOrganismo").first(),
                    pl.col("NombreOrganismo").first(),
                    pl.col("sector").first(),
                    pl.col("Estado").str.to_lowercase().first().alias("estado_lower")
                    if estado_col
                    else pl.lit("").alias("estado_lower"),
                    pl.col("CodigoProveedor").first(),
                ]
            )
            .with_columns(pl.lit(periodo).alias(PERIODO))
        )

        # Filtrar ya vistos
        if seen_lics:
            lic_dedup = lic_dedup.filter(~pl.col("CodigoExterno").is_in(list(seen_lics)))

        if len(lic_dedup) > 0:
            seen_lics.update(lic_dedup["CodigoExterno"].to_list())
            frames.append(lic_dedup)

    if not frames:
        return pl.DataFrame()

    all_lics = pl.concat(frames, how="diagonal_relaxed")
    logger.info(f"Licitaciones únicas procesadas: {len(all_lics):,}")

    # ─── Agregar por organismo ───

    result = (
        all_lics.with_columns(
            [
                pl.col("estado_lower")
                .str.contains("revocad|desierta")
                .cast(pl.Int8)
                .alias("es_fracaso"),
                pl.col("estado_lower")
                .str.contains("adjudicad")
                .cast(pl.Int8)
                .alias("es_adjudicada"),
            ]
        )
        # La clave es el CÓDIGO: nombre y sector se arrastran con su valor más
        # reciente. Con ellos en la clave, un organismo renombrado (o que cambió
        # de sector) partía sus licitaciones en dos filas, cada una con menos de
        # las que tiene, y la API se quedaba con una (`identidad.py`).
        .group_by("CodigoOrganismo")
        .agg(
            [
                nombre_vigente("NombreOrganismo"),
                nombre_vigente("sector"),
                pl.len().alias("n_lic_total"),
                pl.col("es_fracaso").sum().alias("n_fracasos"),
                pl.col("es_adjudicada").sum().alias("n_adjudicadas"),
                # Para HHI: recopilar proveedores ganadores
                pl.col("CodigoProveedor")
                .filter(pl.col("es_adjudicada") == 1)
                .alias("provs_ganadores"),
            ]
        )
        .filter(pl.col("n_lic_total") >= MIN_LIC)
        .with_columns(
            [
                (pl.col("n_fracasos") / pl.col("n_lic_total")).alias("tasa_fracaso"),
            ]
        )
    )

    # HHI de proveedores ganadores por organismo
    # Calculamos directamente con Polars: contar adjudicaciones por proveedor
    adjudicated = (
        all_lics.filter(pl.col("estado_lower").str.contains("adjudicad"))
        .filter(pl.col("CodigoProveedor").is_not_null() & (pl.col("CodigoProveedor") != "null"))
        .group_by(["CodigoOrganismo", "CodigoProveedor"])
        .agg(pl.len().alias("n_adj"))
    )

    org_adj_totals = adjudicated.group_by("CodigoOrganismo").agg(
        pl.col("n_adj").sum().alias("total_adj")
    )

    hhi = (
        adjudicated.join(org_adj_totals, on="CodigoOrganismo")
        .with_columns(
            [
                ((pl.col("n_adj") / pl.col("total_adj")) ** 2).alias("share_sq"),
            ]
        )
        .group_by("CodigoOrganismo")
        .agg(pl.col("share_sq").sum().alias("hhi"))
    )

    tratos = trato_directo.por_organismo().select(
        pl.col(trato_directo.ORGANISMO).alias("CodigoOrganismo"),
        "n_trato_directo",
        "pct_trato_directo",
    )

    # Join con result
    result = (
        result.join(hhi, on="CodigoOrganismo", how="left")
        .join(tratos, on="CodigoOrganismo", how="left")
        .with_columns(
            [
                pl.col("hhi").fill_null(1.0),
            ]
        )
        .drop("provs_ganadores")
    )

    # Calcular score de transparencia
    result = (
        result.with_columns(
            [
                # 1 - pct_td: penaliza trato directo (0% TD → 1.0, 50%+ → 0.0)
                # Sin órdenes en la ventana no se sabe: vale el neutro de la escala.
                (1 - (pl.col("pct_trato_directo") / 0.50).clip(0, 1))
                .fill_null(0.5)
                .alias("score_pct_td"),
                # 1 - tasa_fracaso: penaliza licitaciones fallidas
                (1 - (pl.col("tasa_fracaso") / 0.40).clip(0, 1)).alias("score_fracaso"),
                # 1 - hhi: penaliza alta concentración (HHI=1 → siempre mismo proveedor)
                (1 - pl.col("hhi")).clip(0, 1).alias("score_concentracion"),
            ]
        )
        .with_columns(
            [
                (
                    0.50 * pl.col("score_pct_td")
                    + 0.25 * pl.col("score_fracaso")
                    + 0.25 * pl.col("score_concentracion")
                )
                .round(4)
                .alias("transparencia_score"),
            ]
        )
        .with_columns(
            [
                pl.when(pl.col("transparencia_score") >= 0.75)
                .then(pl.lit("muy_transparente"))
                .when(pl.col("transparencia_score") >= 0.55)
                .then(pl.lit("transparente"))
                .when(pl.col("transparencia_score") >= 0.35)
                .then(pl.lit("moderado"))
                .when(pl.col("transparencia_score") >= 0.15)
                .then(pl.lit("poco_transparente"))
                .otherwise(pl.lit("opaco"))
                .alias("clasificacion"),
            ]
        )
        .sort("transparencia_score", descending=True)
    )

    # Log distribución
    logger.info(f"Organismos evaluados: {len(result):,}")
    for cat in ["muy_transparente", "transparente", "moderado", "poco_transparente", "opaco"]:
        n = result.filter(pl.col("clasificacion") == cat).height
        logger.info(f"  {cat}: {n:,}")

    return result


def run_buyer_transparency() -> dict[str, pl.DataFrame]:
    """Ejecuta pipeline de índice de transparencia."""
    logger.info("=" * 60)
    logger.info("ÍNDICE DE TRANSPARENCIA DEL COMPRADOR")
    logger.info("=" * 60)

    metrics = build_transparency_metrics()
    if metrics.is_empty():
        logger.error("No se obtuvieron métricas de transparencia")
        return {}

    path = OUTPUT_DIR / "buyer_transparency.parquet"
    metrics.write_parquet(path, compression="snappy")
    logger.info(f"Guardado: {path.name} ({path.stat().st_size / 1024 / 1024:.1f} MB)")

    logger.info("\nTop 10 compradores más transparentes:")
    for row in metrics.head(10).iter_rows(named=True):
        logger.info(
            f"  [{row['transparencia_score']:.3f}] {(row['NombreOrganismo'] or '')[:40]:40s} "
            f"TD={row['pct_trato_directo']:.1%} fracaso={row['tasa_fracaso']:.1%} "
            f"HHI={row['hhi']:.3f}"
        )

    logger.info("\nTop 10 compradores más opacos (>50 licitaciones):")
    opacos = metrics.filter(pl.col("n_lic_total") > 50).sort("transparencia_score").head(10)
    for row in opacos.iter_rows(named=True):
        logger.info(
            f"  [{row['transparencia_score']:.3f}] {(row['NombreOrganismo'] or '')[:40]:40s} "
            f"TD={row['pct_trato_directo']:.1%} fracaso={row['tasa_fracaso']:.1%} "
            f"HHI={row['hhi']:.3f}"
        )

    return {"transparency": metrics}
