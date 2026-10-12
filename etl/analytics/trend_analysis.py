"""
Análisis de Tendencias de Mercado

Detecta mercados en crecimiento/contracción, cambios de proveedor dominante,
y evolución del gasto público por sector/organismo/rubro.

Análisis:
1. Tendencia de gasto por (organismo, rubro) — regresión lineal sobre serie mensual
2. Detección de nuevos mercados (rubros con crecimiento acelerado)
3. Rotación de proveedores (cambio de proveedor dominante en un mercado)

Output:
  - time_series.parquet: serie mensual por mercado
  - trend_by_market.parquet: tendencia de gasto por mercado con pendiente y R²
  - emerging_markets.parquet: rubros con mayor crecimiento

El crecimiento interanual por sector (`trend_by_sector`) se retiró: nada lo leía.
"""

import logging

import numpy as np
import polars as pl

from .config import MIN_OBSERVATIONS, MIN_YEAR, OUTPUT_DIR
from .data_loader import iter_oc_parquets
from .identidad import nombre_vigente, periodo_maximo

logger = logging.getLogger(__name__)


def build_time_series() -> pl.DataFrame:
    """Pre-agrega gasto mensual por (organismo, rubro, sector)."""
    logger.info("Construyendo series temporales de gasto...")

    cols_needed = [
        "CodigoOrganismoPublico",
        "OrganismoPublico",
        "RubroN2",
        "sector",
        "MontoTotalOC_PesosChilenos",
        "_periodo_archivo",
    ]

    frames = []
    for _periodo, df in iter_oc_parquets(columns=cols_needed):
        if "MontoTotalOC_PesosChilenos" not in df.columns:
            continue

        # Usar _periodo_archivo como proxy de año-mes (más confiable que parsear fechas)
        agg = (
            df.with_columns(
                [
                    # Por línea: ver `data_loader.con_monto_por_linea`.
                    pl.col("monto_linea_clp").alias("monto"),
                ]
            )
            .filter(pl.col("monto").is_not_null() & (pl.col("monto") > 0))
            .with_columns(
                [
                    pl.col("_periodo_archivo")
                    .str.split("-")
                    .list.get(0)
                    .cast(pl.Int32)
                    .alias("anio"),
                    pl.col("_periodo_archivo")
                    .str.split("-")
                    .list.get(1)
                    .cast(pl.Int32)
                    .alias("mes"),
                ]
            )
            .group_by(["CodigoOrganismoPublico", "RubroN2", "sector", "anio", "mes"])
            .agg(
                [
                    # Órdenes distintas, no líneas.
                    pl.col("Codigo").n_unique().alias("n_oc"),
                    nombre_vigente("OrganismoPublico"),
                    periodo_maximo(),
                    pl.col("monto").sum().alias("monto_total"),
                    # Por ORDEN: la media por fila era el ticket de una línea.
                    (pl.col("monto").sum() / pl.col("Codigo").n_unique()).alias("ticket_promedio"),
                ]
            )
        )
        frames.append(agg)

    if not frames:
        return pl.DataFrame()

    combined = pl.concat(frames, how="diagonal_relaxed")
    result = (
        combined.group_by(["CodigoOrganismoPublico", "RubroN2", "sector", "anio", "mes"])
        .agg(
            [
                pl.col("n_oc").sum(),
                pl.col("monto_total").sum(),
                nombre_vigente("OrganismoPublico"),
            ]
        )
        .sort(["CodigoOrganismoPublico", "RubroN2", "anio", "mes"])
    )

    logger.info(f"Series temporales: {len(result):,} filas")
    return result


def compute_market_trends(ts: pl.DataFrame) -> pl.DataFrame:
    """
    Calcula tendencia de gasto por (organismo, rubro) usando regresión lineal
    sobre la serie temporal mensual.

    Retorna:
    - slope: pendiente mensual (CLP/mes) — positiva = crecimiento
    - r_squared: calidad del ajuste lineal
    - cagr: tasa de crecimiento anual compuesta
    - monto_ultimo_anio: gasto del último año completo
    """
    logger.info("Calculando tendencias de mercado...")

    # Agregar índice temporal numérico (meses desde inicio)
    ts_indexed = ts.with_columns(
        [
            ((pl.col("anio") - MIN_YEAR) * 12 + pl.col("mes")).alias("t"),
        ]
    )

    # Agrupar por mercado y calcular regresión
    markets = (
        # El nombre sale de la clave: con él dentro, un organismo renombrado
        # tenía dos series temporales cortas en vez de una larga, y con menos de
        # dos años cada una el filtro de abajo las descartaba enteras.
        ts_indexed.group_by(["CodigoOrganismoPublico", "RubroN2"])
        .agg(
            [
                pl.col("OrganismoPublico").drop_nulls().last().alias("OrganismoPublico"),
                pl.col("t").alias("ts"),
                pl.col("monto_total").alias("montos"),
                pl.col("n_oc").sum().alias("total_oc"),
                pl.col("monto_total").sum().alias("monto_acumulado"),
                pl.col("anio").n_unique().alias("n_anios"),
                pl.col("anio").max().alias("ultimo_anio"),
            ]
        )
        .filter((pl.col("total_oc") >= MIN_OBSERVATIONS) & (pl.col("n_anios") >= 2))
    )

    # Calcular regresión lineal para cada mercado
    results = []
    for row in markets.iter_rows(named=True):
        t = np.array(row["ts"], dtype=float)
        y = np.array(row["montos"], dtype=float)

        if len(t) < 3 or np.std(t) == 0:
            continue

        # Regresión lineal
        slope, intercept = np.polyfit(t, y, 1)
        y_pred = slope * t + intercept
        ss_res = np.sum((y - y_pred) ** 2)
        ss_tot = np.sum((y - np.mean(y)) ** 2)
        r_sq = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0

        # CAGR (si hay suficientes datos)
        first_year_avg = np.mean(y[:12]) if len(y) >= 12 else y[0]
        last_year_avg = np.mean(y[-12:]) if len(y) >= 12 else y[-1]
        n_years = max(1, (t[-1] - t[0]) / 12)

        if first_year_avg > 0 and last_year_avg > 0:
            cagr = (last_year_avg / first_year_avg) ** (1 / n_years) - 1
        else:
            cagr = 0

        results.append(
            {
                "CodigoOrganismoPublico": row["CodigoOrganismoPublico"],
                "OrganismoPublico": row["OrganismoPublico"],
                "RubroN2": row["RubroN2"],
                "slope_mensual": round(slope, 2),
                "r_squared": round(r_sq, 4),
                "cagr": round(cagr, 4),
                "monto_acumulado": row["monto_acumulado"],
                "total_oc": row["total_oc"],
                "n_anios": row["n_anios"],
                "tendencia": "crecimiento"
                if slope > 0 and r_sq > 0.1
                else "decrecimiento"
                if slope < 0 and r_sq > 0.1
                else "estable",
            }
        )

    # Con poca historia (p. ej. sólo unos meses descargados) ningún mercado supera
    # los mínimos y `results` queda vacío. `pl.DataFrame([])` no tiene columnas, así
    # que el `.sort("cagr")` reventaba con ColumnNotFoundError y tumbaba el módulo
    # entero. Es una limitación de datos, no un error: se devuelve vacío con el
    # esquema correcto para que los módulos que dependen de esto sigan.
    if not results:
        logger.warning(
            "Sin mercados con historia suficiente para calcular tendencia — "
            "se devuelve vacío. Descarga más periodos si necesitas este módulo."
        )
        return pl.DataFrame(
            schema={
                "CodigoOrganismoPublico": pl.Utf8,
                "OrganismoPublico": pl.Utf8,
                "RubroN2": pl.Utf8,
                "slope_mensual": pl.Float64,
                "r_squared": pl.Float64,
                "cagr": pl.Float64,
                "monto_acumulado": pl.Float64,
                "total_oc": pl.Int64,
                "n_anios": pl.Int64,
                "tendencia": pl.Utf8,
            }
        )

    trend_df = pl.DataFrame(results).sort("cagr", descending=True)
    for t in ["crecimiento", "estable", "decrecimiento"]:
        n = trend_df.filter(pl.col("tendencia") == t).shape[0]
        logger.info(f"  {t}: {n:,} mercados")

    return trend_df


def detect_emerging_markets(trends: pl.DataFrame) -> pl.DataFrame:
    """
    Detecta rubros con crecimiento acelerado: CAGR > 20% y R² > 0.3.
    Estos representan oportunidades de mercado en expansión.
    """
    logger.info("Detectando mercados emergentes...")

    emerging = trends.filter(
        (pl.col("cagr") > 0.20) & (pl.col("r_squared") > 0.3) & (pl.col("total_oc") >= 20)
    ).sort("cagr", descending=True)

    logger.info(f"Mercados emergentes (CAGR > 20%): {len(emerging):,}")
    return emerging


def run_trend_analysis() -> dict[str, pl.DataFrame]:
    """Ejecuta pipeline de análisis de tendencias."""
    logger.info("=" * 60)
    logger.info("ANÁLISIS DE TENDENCIAS")
    logger.info("=" * 60)

    ts = build_time_series()
    if ts.is_empty():
        return {}

    ts_path = OUTPUT_DIR / "time_series.parquet"
    ts.write_parquet(ts_path, compression="snappy")
    logger.info(f"Guardado: {ts_path.name}")

    # Tendencias por mercado
    market_trends = compute_market_trends(ts)
    mt_path = OUTPUT_DIR / "trend_by_market.parquet"
    market_trends.write_parquet(mt_path, compression="snappy")
    logger.info(f"Guardado: {mt_path.name}")

    # Mercados emergentes
    emerging = detect_emerging_markets(market_trends)
    em_path = OUTPUT_DIR / "emerging_markets.parquet"
    emerging.write_parquet(em_path, compression="snappy")
    logger.info(f"Guardado: {em_path.name}")

    return {
        "time_series": ts,
        "market_trends": market_trends,
        "emerging": emerging,
    }
