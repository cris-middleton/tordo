"""
Clasificador de Ventana de Preparación

La fecha de cierre ya viene en el dato de la licitación publicada — calcular
cuántos días te quedan es trivial. El valor real de este módulo es otro:

  COMPARAR la ventana de cada licitación contra la norma histórica de su
  tipo y sector, para detectar cuándo una ventana es INUSUALMENTE CORTA
  y necesita atención inmediata.

Ejemplo de uso en TORDO:
  Aparecen 8 licitaciones abiertas. El proveedor no sabe cuál priorizar.
  Este módulo las ordena por presión real:

    LQ Salud       → 12 días ventana / p50 histórico = 42d → solo tiene 29 %
                     del tiempo típico → ALERTA CRÍTICA
    LE Educación   → 55 días ventana / p50 histórico = 58d → tiempo normal
    LP Municipalid → 90 días ventana / p50 histórico = 75d → tiempo holgado

  La alerta no es "te quedan N días" — esa la calcula cualquier calendario.
  La alerta es "esta licitación es estructuralmente urgente respecto a su tipo".

Pipeline:
  1. Extraer una fila por licitación con window_days real
  2. Calcular normas históricas por (CodigoTipo + sector) y fallback por tipo
  3. Unir cada licitación con su norma → clasificar y generar score de presión
  4. Output: tabla por licitación + tabla de normas (para uso en tiempo real)

Outputs:
  - window_norms.parquet: normas históricas por (CodigoTipo, sector)
  - window_norms_type.parquet: fallback solo por tipo
  - window_classified.parquet: cada licitación clasificada vs su norma
    → columnas clave: alerta_ventana_corta, pct_del_tipico, presion_score
"""

import logging

import polars as pl

from .config import OUTPUT_DIR
from .data_loader import iter_lic_parquets

logger = logging.getLogger(__name__)

MIN_N_NORM = 20  # mínimo de licitaciones para considerar una norma confiable


# ─────────────────────────────────────────────────────────────────────
# Paso 1: extraer ventanas reales por licitación
# ─────────────────────────────────────────────────────────────────────


def extract_windows() -> pl.DataFrame:
    """Una fila por licitación con window_days calculado."""
    logger.info("Extrayendo ventanas de preparación...")

    cols_needed = [
        "CodigoExterno",
        "Nombre",
        "CodigoOrganismo",
        "NombreOrganismo",
        "CodigoTipo",
        "sector",
        "FechaCreacion",
        "FechaCierre",
        "MontoEstimado",
        "Rubro2",
    ]

    frames = []
    seen: set[str] = set()

    for _periodo, df in iter_lic_parquets(columns=cols_needed):
        if "CodigoExterno" not in df.columns:
            continue
        if "FechaCreacion" not in df.columns or "FechaCierre" not in df.columns:
            continue

        batch = (
            df.filter(pl.col("CodigoExterno").is_not_null() & (pl.col("CodigoExterno") != "null"))
            .group_by("CodigoExterno")
            .agg(
                [
                    pl.col("Nombre").first(),
                    pl.col("CodigoOrganismo").first(),
                    pl.col("NombreOrganismo").first(),
                    pl.col("CodigoTipo").first(),
                    pl.col("sector").first(),
                    pl.col("Rubro2").first(),
                    pl.col("FechaCreacion").first(),
                    pl.col("FechaCierre").first(),
                    pl.col("MontoEstimado")
                    .cast(pl.Float64, strict=False)
                    .first()
                    .alias("monto_est"),
                ]
            )
        )

        if seen:
            batch = batch.filter(~pl.col("CodigoExterno").is_in(list(seen)))

        if len(batch) > 0:
            seen.update(batch["CodigoExterno"].to_list())
            frames.append(batch)

    if not frames:
        return pl.DataFrame()

    all_lics = pl.concat(frames, how="diagonal_relaxed")

    result = (
        all_lics.filter(
            pl.col("FechaCreacion").is_not_null()
            & (pl.col("FechaCreacion") != "null")
            & pl.col("FechaCierre").is_not_null()
            & (pl.col("FechaCierre") != "null")
            & (pl.col("FechaCreacion").str.len_chars() >= 10)
            & (pl.col("FechaCierre").str.len_chars() >= 10)
        )
        .with_columns(
            [
                pl.col("FechaCreacion")
                .str.slice(0, 10)
                .str.to_date("%Y-%m-%d", strict=False)
                .alias("dt_creacion"),
                pl.col("FechaCierre")
                .str.slice(0, 10)
                .str.to_date("%Y-%m-%d", strict=False)
                .alias("dt_cierre"),
            ]
        )
        .filter(pl.col("dt_creacion").is_not_null() & pl.col("dt_cierre").is_not_null())
        .with_columns(
            [
                (pl.col("dt_cierre") - pl.col("dt_creacion")).dt.total_days().alias("window_days"),
            ]
        )
        .filter((pl.col("window_days") >= 1) & (pl.col("window_days") <= 365))
    )

    logger.info(f"Licitaciones con ventana: {len(result):,}")
    return result


# ─────────────────────────────────────────────────────────────────────
# Paso 2: normas históricas
# ─────────────────────────────────────────────────────────────────────


def build_norms(lics: pl.DataFrame) -> tuple[pl.DataFrame, pl.DataFrame]:
    """
    Calcula p10/p25/p50/p75/p90 de window_days por (CodigoTipo, sector)
    y por CodigoTipo solo como fallback.
    """
    logger.info("Calculando normas históricas de ventana...")

    def _stats(df: pl.DataFrame, group_cols: list[str]) -> pl.DataFrame:
        valid_cols = [c for c in group_cols if c in df.columns]
        return (
            # `all()` de Python llama a bool() sobre cada expresión de Polars y
            # falla con "the truth value of an Expr is ambiguous". Para combinar
            # condiciones hay que usar pl.all_horizontal.
            df.filter(
                pl.all_horizontal(
                    [pl.col(c).is_not_null() & (pl.col(c) != "null") for c in valid_cols]
                )
            )
            .group_by(valid_cols)
            .agg(
                [
                    pl.len().alias("n_historico"),
                    pl.col("window_days").quantile(0.10).alias("p10"),
                    pl.col("window_days").quantile(0.25).alias("p25"),
                    pl.col("window_days").median().alias("p50"),
                    pl.col("window_days").quantile(0.75).alias("p75"),
                    pl.col("window_days").quantile(0.90).alias("p90"),
                ]
            )
            .filter(pl.col("n_historico") >= MIN_N_NORM)
        )

    norms_ts = _stats(lics, ["CodigoTipo", "sector"])
    norms_t = _stats(lics, ["CodigoTipo"])

    logger.info(f"  Normas tipo×sector: {len(norms_ts):,} combinaciones")
    logger.info(f"  Normas solo tipo:   {len(norms_t):,} tipos")
    return norms_ts, norms_t


# ─────────────────────────────────────────────────────────────────────
# Paso 3: clasificar cada licitación vs su norma
# ─────────────────────────────────────────────────────────────────────


def classify_windows(
    lics: pl.DataFrame,
    norms_ts: pl.DataFrame,
    norms_t: pl.DataFrame,
) -> pl.DataFrame:
    """
    Une cada licitación con su norma histórica (tipo+sector primero,
    fallback a solo tipo) y calcula:

      pct_del_tipico   = window_days / p50  — cuánto del tiempo típico tiene
                         < 0.50 → tiene menos de la mitad del tiempo usual
                         1.00   → tiempo exactamente normal
                         > 1.50 → ventana inusualmente larga

      presion_score    = 1 - clamp(pct_del_tipico / 1.5, 0, 1)
                         0 → ventana larga (sin presión)
                         1 → ventana extremadamente corta (máxima presión)

      alerta_ventana_corta = window_days < p25 histórico para su tipo+sector

      clasificacion:
        "crítica"   → window < p10 histórico (bottom 10 %)
        "corta"     → window < p25 (bottom 25 %)
        "normal"    → entre p25 y p75
        "larga"     → window > p75
        "muy larga" → window > p90

    La clasificación permite a TORDO mostrar:
      🔴 Esta licitación tiene ventana inusualmente corta para su tipo
      🟡 Ventana dentro del rango normal
      🟢 Tienes más tiempo del típico
    """
    logger.info("Clasificando licitaciones vs normas históricas...")

    # Sufijo para diferenciar norms_ts vs lics
    norms_ts_renamed = norms_ts.rename(
        {
            "n_historico": "n_historico_ts",
            "p10": "p10_ts",
            "p25": "p25_ts",
            "p50": "p50_ts",
            "p75": "p75_ts",
            "p90": "p90_ts",
        }
    )
    norms_t_renamed = norms_t.rename(
        {
            "n_historico": "n_historico_t",
            "p10": "p10_t",
            "p25": "p25_t",
            "p50": "p50_t",
            "p75": "p75_t",
            "p90": "p90_t",
        }
    )

    # Join con norma tipo+sector (más precisa)
    joined = lics.join(norms_ts_renamed, on=["CodigoTipo", "sector"], how="left")
    # Fallback: join con norma solo tipo cuando no hay dato de sector
    joined = joined.join(norms_t_renamed, on="CodigoTipo", how="left")

    # Usar tipo+sector si disponible, si no usar solo tipo
    classified = (
        joined.with_columns(
            [
                pl.coalesce(["p25_ts", "p25_t"]).alias("p25_ref"),
                pl.coalesce(["p50_ts", "p50_t"]).alias("p50_ref"),
                pl.coalesce(["p75_ts", "p75_t"]).alias("p75_ref"),
                pl.coalesce(["p10_ts", "p10_t"]).alias("p10_ref"),
                pl.coalesce(["p90_ts", "p90_t"]).alias("p90_ref"),
                pl.when(pl.col("p50_ts").is_not_null())
                .then(pl.lit("tipo+sector"))
                .when(pl.col("p50_t").is_not_null())
                .then(pl.lit("solo_tipo"))
                .otherwise(pl.lit("sin_norma"))
                .alias("nivel_norma"),
            ]
        )
        .filter(
            pl.col("p50_ref").is_not_null()  # descartar sin ninguna norma
        )
        .with_columns(
            [
                # ¿Qué fracción del tiempo típico tiene esta licitación?
                (pl.col("window_days") / pl.col("p50_ref")).round(3).alias("pct_del_tipico"),
                # Cuántos días más corta/larga que la mediana
                (pl.col("window_days") - pl.col("p50_ref")).alias("dias_vs_mediana"),
            ]
        )
        .with_columns(
            [
                # Score de presión: 1 = urgentísimo, 0 = sin presión
                (1 - (pl.col("pct_del_tipico") / 1.5).clip(0, 1)).round(3).alias("presion_score"),
                # Clasificación cualitativa
                pl.when(pl.col("window_days") < pl.col("p10_ref"))
                .then(pl.lit("crítica"))
                .when(pl.col("window_days") < pl.col("p25_ref"))
                .then(pl.lit("corta"))
                .when(pl.col("window_days") <= pl.col("p75_ref"))
                .then(pl.lit("normal"))
                .when(pl.col("window_days") <= pl.col("p90_ref"))
                .then(pl.lit("larga"))
                .otherwise(pl.lit("muy_larga"))
                .alias("clasificacion_ventana"),
                # Flag booleano para alertas
                (pl.col("window_days") < pl.col("p25_ref")).alias("alerta_ventana_corta"),
            ]
        )
        .select(
            [
                "CodigoExterno",
                "Nombre",
                "CodigoOrganismo",
                "NombreOrganismo",
                "CodigoTipo",
                "sector",
                "Rubro2",
                "dt_creacion",
                "dt_cierre",
                "window_days",
                "p25_ref",
                "p50_ref",
                "p75_ref",
                "pct_del_tipico",
                "dias_vs_mediana",
                "presion_score",
                "clasificacion_ventana",
                "alerta_ventana_corta",
                "nivel_norma",
                "monto_est",
            ]
        )
        .sort("presion_score", descending=True)
    )

    # Stats finales
    total = len(classified)
    n_critica = classified.filter(pl.col("clasificacion_ventana") == "crítica").height
    n_corta = classified.filter(pl.col("clasificacion_ventana") == "corta").height
    n_normal = classified.filter(pl.col("clasificacion_ventana") == "normal").height
    n_larga = classified.filter(
        pl.col("clasificacion_ventana").is_in(["larga", "muy_larga"])
    ).height

    logger.info(f"Licitaciones clasificadas: {total:,}")
    logger.info(f"  crítica  (< p10): {n_critica:,}  ({100 * n_critica / total:.1f}%)")
    logger.info(f"  corta    (< p25): {n_corta:,}  ({100 * n_corta / total:.1f}%)")
    logger.info(f"  normal          : {n_normal:,}  ({100 * n_normal / total:.1f}%)")
    logger.info(f"  larga    (> p75): {n_larga:,}  ({100 * n_larga / total:.1f}%)")

    return classified


# ─────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────


def run_preparation_window() -> dict[str, pl.DataFrame]:
    """Ejecuta pipeline de clasificación de ventanas."""
    logger.info("=" * 60)
    logger.info("CLASIFICADOR DE VENTANA DE PREPARACIÓN")
    logger.info("=" * 60)

    lics = extract_windows()
    if lics.is_empty():
        logger.error("No se obtuvieron datos de ventanas")
        return {}

    norms_ts, norms_t = build_norms(lics)

    # Guardar normas (lookup table para uso en tiempo real en la app)
    norms_path = OUTPUT_DIR / "window_norms.parquet"
    norms_ts.write_parquet(norms_path, compression="snappy")
    logger.info(f"Guardado: {norms_path.name}")

    norms_t_path = OUTPUT_DIR / "window_norms_type.parquet"
    norms_t.write_parquet(norms_t_path, compression="snappy")
    logger.info(f"Guardado: {norms_t_path.name}")

    # Clasificar todas las licitaciones históricas
    classified = classify_windows(lics, norms_ts, norms_t)
    classified_path = OUTPUT_DIR / "window_classified.parquet"
    classified.write_parquet(classified_path, compression="snappy")
    logger.info(
        f"Guardado: {classified_path.name} ({classified_path.stat().st_size / 1024 / 1024:.1f} MB)"
    )

    # Mostrar casos extremos como validación
    logger.info("\nEjemplos con ventana crítica (< p10 de su tipo):")
    criticas = classified.filter(pl.col("clasificacion_ventana") == "crítica").head(5)
    for row in criticas.iter_rows(named=True):
        nombre = (row.get("Nombre") or "")[:40]
        logger.info(
            f"  {nombre:40s} | {row['CodigoTipo']:4s} | "
            f"{row['window_days']}d vs p50={row['p50_ref']:.0f}d "
            f"→ {row['pct_del_tipico']:.0%} del típico"
        )

    logger.info("\nNormas por tipo (referencia):")
    for row in norms_t.sort("CodigoTipo").iter_rows(named=True):
        logger.info(
            f"  {row['CodigoTipo']:4s} → p25={row['p25']:.0f}d  "
            f"p50={row['p50']:.0f}d  p75={row['p75']:.0f}d  (n={row['n_historico']:,})"
        )

    return {
        "classified": classified,
        "norms_ts": norms_ts,
        "norms_t": norms_t,
    }
