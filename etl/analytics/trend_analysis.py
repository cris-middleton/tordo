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
    """Pre-agrega gasto mensual por (organismo, rubro, sector).

    **El mes es el de CREACIÓN de la orden, no el del archivo.** Un archivo
    mensual trae órdenes creadas antes (se envían tarde), y la ventana de
    analytics corta por `FechaCreacion`: contar por archivo dejaba el primer mes
    de la ventana sin las órdenes creadas antes de ella (un 9–12 % menos) y
    repartía cada mes entre varios archivos.

    **Sólo los meses completos**: desde el período del primer archivo leído
    (lo creado antes llega a medias, sólo lo que se envió tarde) hasta el
    penúltimo. El último archivo es el del mes en curso, o el de un mes al que
    aún le faltan las órdenes que se envían tarde.
    """
    logger.info("Construyendo series temporales de gasto...")

    cols_needed = [
        "Codigo",
        "CodigoOrganismoPublico",
        "OrganismoPublico",
        "RubroN2",
        "sector",
        "MontoTotalOC_PesosChilenos",
        "FechaCreacion",
        "_periodo_archivo",
    ]

    frames = []
    periodos: list[int] = []
    for periodo, df in iter_oc_parquets(columns=cols_needed):
        periodos.append(_clave(periodo))
        if "MontoTotalOC_PesosChilenos" not in df.columns or "FechaCreacion" not in df.columns:
            continue

        fecha = pl.col("FechaCreacion").cast(pl.Utf8).str.slice(0, 10).cast(pl.Date, strict=False)
        agg = (
            df.with_columns(
                [
                    # Por línea: ver `data_loader.con_monto_por_linea`.
                    pl.col("monto_linea_clp").alias("monto"),
                    fecha.dt.year().cast(pl.Int32).alias("anio"),
                    fecha.dt.month().cast(pl.Int32).alias("mes"),
                ]
            )
            .filter(
                pl.col("monto").is_not_null() & (pl.col("monto") > 0) & pl.col("anio").is_not_null()
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

    desde, hasta = min(periodos), max(periodos)
    combined = pl.concat(frames, how="diagonal_relaxed").filter(
        (pl.col("anio") * 12 + pl.col("mes") >= desde)
        & (pl.col("anio") * 12 + pl.col("mes") < hasta)
    )
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


def _clave(periodo: str) -> int:
    """«2026-3» → 2026·12 + 3, como `identidad.clave_periodo` sobre un texto suelto."""
    anio, mes = periodo.split("-")
    return int(anio) * 12 + int(mes)


#: Meses que pide un CAGR: un año al principio y otro al final, sin solaparse.
MESES_PARA_CAGR = 24


def compute_market_trends(ts: pl.DataFrame) -> pl.DataFrame:
    """
    Calcula tendencia de gasto por (organismo, rubro) usando regresión lineal
    sobre la serie temporal mensual.

    Retorna:
    - slope: pendiente mensual (CLP/mes) — positiva = crecimiento
    - r_squared: calidad del ajuste lineal
    - cagr: tasa de crecimiento anual compuesta (nula con menos de dos años)

    **La serie va completa, con ceros.** Un mes sin compras es un mes de gasto
    cero, no un mes que no existe: sin rellenarlo, la regresión y el «primer
    año» saltaban los huecos, y un mercado que compra tres veces en tres años
    parecía tan regular como uno que compra cada mes. El rango es el de toda la
    serie (los meses completos de `build_time_series`), igual para todos los
    mercados.

    **El primer y el último año son de CALENDARIO**: los 12 primeros y los 12
    últimos meses del rango, no los 12 primeros meses con compras. Con menos de
    `MESES_PARA_CAGR` meses no hay dos años que comparar y el CAGR va nulo
    (`opportunity_scorer` le pone su neutro). Antes salía de comparar el
    primer y el último mes activo.
    """
    logger.info("Calculando tendencias de mercado...")

    # Agregar índice temporal numérico (meses desde inicio)
    ts_indexed = ts.with_columns(
        [
            ((pl.col("anio") - MIN_YEAR) * 12 + pl.col("mes")).alias("t"),
        ]
    )

    t_desde = ts_indexed["t"].min()
    n_meses = ts_indexed["t"].max() - t_desde + 1
    t_rango = np.arange(t_desde, t_desde + n_meses, dtype=float)

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
        if len(row["ts"]) < 3 or n_meses < 3:
            continue
        t = t_rango
        # Un mes puede venir en varias filas (un organismo con dos sectores): se suman.
        y = np.zeros(n_meses)
        np.add.at(y, np.array(row["ts"], dtype=int) - t_desde, np.array(row["montos"], float))

        # Regresión lineal
        slope, intercept = np.polyfit(t, y, 1)
        y_pred = slope * t + intercept
        ss_res = np.sum((y - y_pred) ** 2)
        ss_tot = np.sum((y - np.mean(y)) ** 2)
        r_sq = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0

        # CAGR entre el primer y el último año de calendario del rango.
        if n_meses >= MESES_PARA_CAGR:
            first_year_avg = np.mean(y[:12])
            last_year_avg = np.mean(y[-12:])
            n_years = (n_meses - 12) / 12
            if first_year_avg > 0 and last_year_avg > 0:
                cagr = round((last_year_avg / first_year_avg) ** (1 / n_years) - 1, 4)
            else:
                cagr = 0.0
        else:
            cagr = None

        results.append(
            {
                "CodigoOrganismoPublico": row["CodigoOrganismoPublico"],
                "OrganismoPublico": row["OrganismoPublico"],
                "RubroN2": row["RubroN2"],
                "slope_mensual": round(slope, 2),
                "r_squared": round(r_sq, 4),
                "cagr": cagr,
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

    trend_df = pl.DataFrame(results, schema_overrides={"cagr": pl.Float64}).sort(
        "cagr", descending=True, nulls_last=True
    )
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
