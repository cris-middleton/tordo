"""Todo lo que depende del tiempo: ventana de preparación, estacionalidad y
tendencia de un mercado.

Parte de `app.services.bi`, que reemplaza al antiguo `bi_service.py` de 1.476
líneas. El contrato hacia los endpoints no cambia: lo fija el golden master en
`backend/tests/golden/bi_golden.json`.
"""

from __future__ import annotations

import logging

from app.services.bi._base import _columnas, _load

logger = logging.getLogger(__name__)

#: Calidad mínima de un mercado para hablar de su tendencia: al menos 3 años y
#: 15 órdenes, para no inflar el CAGR con bases casi nulas o muestras ínfimas.
#: Se empuja a SQL antes del LIMIT: filtrar después perdía al mejor válido.
MINIMOS_CALIDAD_TENDENCIA = {"n_anios": 3, "total_oc": 15}


def _minimos_de_calidad(filename: str) -> dict[str, int] | None:
    """Los mínimos de calidad que la tabla puede aplicar en SQL.

    Una materialización antigua podría no tener `n_anios`/`total_oc`; filtrar a
    ciegas por una columna que no existe es un error de Postgres, no un vacío.
    Sin ellas, el filtro de Polars de abajo cae a `cagr` no nulo, como siempre.
    """
    presentes = _columnas(filename)
    return {c: v for c, v in MINIMOS_CALIDAD_TENDENCIA.items() if c in presentes} or None


def get_ventana(codigo_externo: str) -> dict:
    """
    Preparation window classification for a specific licitación.
    Returns alerta_ventana_corta, presion_score, pct_del_tipico.
    Returns 503-style dict if parquet not yet generated.
    """
    # El filtro viaja a SQL. `window_classified` tiene una fila por licitación
    # del histórico, y esto se traía la tabla ENTERA a memoria para quedarse con
    # una — en cada carga de la ficha de una licitación, que es la pantalla más
    # visitada del producto.
    df = _load("window_classified.parquet", filtros={"CodigoExterno": str(codigo_externo)})
    if df is None:
        return {
            "disponible": False,
            "motivo": "parquet window_classified no generado — ejecute el ETL de analytics",
        }

    rows = df
    if rows.is_empty():
        return {"disponible": False, "motivo": "licitación no encontrada en histórico"}

    row = rows.row(0, named=True)
    return {
        "disponible": True,
        "codigo_externo": codigo_externo,
        "alerta_ventana_corta": row.get("alerta_ventana_corta", False),
        "presion_score": row.get("presion_score"),
        "clasificacion_ventana": row.get("clasificacion_ventana"),
        "pct_del_tipico": row.get("pct_del_tipico"),
        "window_days": row.get("window_days"),
    }


def get_estacionalidad(
    organismo_id: str,
    rubro: str | None = None,
) -> dict:
    """
    Monthly seasonality patterns for an organismo (+ optional rubro filter).
    Returns prob_mes, consistencia, es_pico_estacional for each of the 12 months.
    """
    # 1,78 millones de filas en la tabla, doce en la respuesta.
    filtros: dict = {"CodigoOrganismoPublico": str(organismo_id)}
    if rubro:
        filtros["RubroN2"] = rubro

    df = _load("seasonality_patterns.parquet", filtros=filtros)
    if df is None:
        return {"disponible": False, "motivo": "parquet no generado"}

    rows = df.sort("mes")
    if rows.is_empty():
        return {
            "disponible": False,
            "motivo": "organismo no encontrado en histórico de estacionalidad",
        }

    cols = [
        c
        for c in ["mes", "compras_mes", "prob_mes", "consistencia", "z_score", "es_pico_estacional"]
        if c in rows.columns
    ]
    return {
        "disponible": True,
        "organismo_id": organismo_id,
        "rubro": rubro,
        "patrones": rows.select(cols).to_dicts(),
    }


def get_tendencia(
    rubro: str | None = None,
    tendencia: str | None = None,
    solo_emergentes: bool = False,
    limit: int = 50,
) -> dict:
    """
    Market growth trends from trend_by_market.parquet.
    emerging_markets.parquet contains the subset with CAGR > 20%.
    """
    filtros: dict = {}
    if rubro:
        filtros["RubroN2"] = rubro
    if tendencia:
        filtros["tendencia"] = tendencia
    # Filtros, mínimos de calidad, orden y top-N en SQL: sin rubro esto traía
    # `trend_by_market` y `emerging_markets` enteras a memoria.
    df = _load(
        "trend_by_market.parquet",
        filtros=filtros or None,
        minimos=_minimos_de_calidad("trend_by_market.parquet"),
        orden="cagr",
        limite=limit,
    )
    em_df = _load(
        "emerging_markets.parquet",
        filtros={"RubroN2": rubro} if rubro else None,
        minimos=_minimos_de_calidad("emerging_markets.parquet"),
        orden="cagr",
        limite=20,
    )

    if df is None:
        return {"disponible": False, "motivo": "parquet no generado"}

    # Require minimum data quality (MINIMOS_CALIDAD_TENDENCIA: años y transacciones)
    # to avoid CAGR blowups from near-zero base values or tiny samples
    min_anios = (
        df["n_anios"] >= MINIMOS_CALIDAD_TENDENCIA["n_anios"]
        if "n_anios" in df.columns
        else df["cagr"].is_not_null()
    )
    min_oc = (
        df["total_oc"] >= MINIMOS_CALIDAD_TENDENCIA["total_oc"]
        if "total_oc" in df.columns
        else df["cagr"].is_not_null()
    )

    mask = df["cagr"].is_not_null() & min_anios & min_oc
    if tendencia:
        mask = mask & (df["tendencia"] == tendencia)

    cols = [
        c
        for c in [
            "CodigoOrganismoPublico",
            "RubroN2",
            "slope_mensual",
            "r_squared",
            "cagr",
            "tendencia",
            "n_anios",
            "total_oc",
        ]
        if c in df.columns
    ]
    rows = df.filter(mask).sort("cagr", descending=True).head(limit)
    tendencias = rows.select(cols).to_dicts()

    emergentes: list = []
    if em_df is not None:
        em_min_anios = (
            em_df["n_anios"] >= MINIMOS_CALIDAD_TENDENCIA["n_anios"]
            if "n_anios" in em_df.columns
            else em_df["cagr"].is_not_null()
        )
        em_min_oc = (
            em_df["total_oc"] >= MINIMOS_CALIDAD_TENDENCIA["total_oc"]
            if "total_oc" in em_df.columns
            else em_df["cagr"].is_not_null()
        )
        em_mask = em_df["cagr"].is_not_null() & em_min_anios & em_min_oc
        em_cols = [c for c in cols if c in em_df.columns]
        em_rows = em_df.filter(em_mask).sort("cagr", descending=True).head(20)
        if not em_rows.is_empty():
            emergentes = em_rows.select(em_cols).to_dicts()

    # serie_anual + cagr_rubro: solo cuando hay rubro filtrado
    serie_anual = None
    cagr_rubro = None
    if rubro:
        import polars as pl  # noqa: PLC0415 — lazy import kept consistent with _load()

        # Filtrada en SQL y sólo con las columnas que se usan. Se traía la tabla
        # ENTERA (301 MB en Postgres con la ventana de 36 meses) para quedarse
        # con un rubro: +533 MB medidos con seis meses, y la API moría por OOM.
        ts_df = _load(
            "time_series.parquet",
            filtros={"RubroN2": rubro},
            columnas=["RubroN2", "anio", "mes", "monto_total", "n_oc"],
        )
        if ts_df is not None and "RubroN2" in ts_df.columns:
            # Filtrar por rubro
            rubro_ts = ts_df.filter(ts_df["RubroN2"] == rubro)

            # Determinar qué años están completos: max(mes) == 12
            if "mes" in rubro_ts.columns and len(rubro_ts) > 0:
                years_coverage = rubro_ts.group_by("anio").agg(pl.col("mes").max().alias("max_mes"))
                complete_years = set(
                    years_coverage.filter(pl.col("max_mes") == 12)
                    .select("anio")
                    .to_series()
                    .to_list()
                )
            else:
                complete_years = set()

            # Agregar por año, filtrar a solo años completos, quedarse con los últimos 6
            year_agg = (
                rubro_ts.group_by("anio")
                .agg(
                    [
                        pl.col("monto_total").sum().alias("monto_total"),
                        pl.col("n_oc").sum().alias("n_oc"),
                    ]
                )
                .filter(pl.col("anio").is_in(list(complete_years)))
                .sort("anio", descending=False)
                .tail(6)
            )

            if len(year_agg) >= 2:
                rows = year_agg.to_dicts()
                serie_anual = [
                    {
                        "anio": int(r["anio"]),
                        "monto_total": float(r["monto_total"] or 0),
                        "n_oc": int(r["n_oc"]) if r.get("n_oc") is not None else None,
                    }
                    for r in rows
                ]

                # CAGR rubro-level: (last / first) ^ (1 / (n-1)) - 1
                first_monto = rows[0]["monto_total"]
                last_monto = rows[-1]["monto_total"]
                n_points = len(rows)
                if first_monto and first_monto > 0 and n_points >= 2:
                    try:
                        cagr_rubro = ((last_monto / first_monto) ** (1 / (n_points - 1)) - 1) * 100
                        # Clamp a rango razonable para evitar valores de outliers extremos
                        if cagr_rubro > 1000 or cagr_rubro < -99:
                            cagr_rubro = None
                    except (ValueError, ZeroDivisionError, OverflowError):
                        cagr_rubro = None

    return {
        "disponible": True,
        "tendencias": tendencias,
        "emergentes": emergentes,
        "serie_anual": serie_anual,
        "cagr_rubro": cagr_rubro,  # CAGR rubro-level computed from serie_anual (complete years only)
        "total": len(tendencias),
    }


def _compute_cagr_rubro_desde_time_series(
    rubro: str,
) -> tuple[float | None, float | None, list[dict] | None]:
    """Helper: computa CAGR rubro-level + YoY + serie anual completa desde time_series.parquet.

    Excluye años incompletos (max(mes) < 12).
    Retorna (cagr_pct, yoy_pct, serie_anual_dicts).
      - cagr_pct: CAGR histórico sobre todos los años completos disponibles (hasta 6)
      - yoy_pct: variación del último año completo vs el anterior
    Si no hay data suficiente, retorna (None, None, None).
    """
    import polars as pl

    # Filtro empujado a SQL: time_series tiene decenas de miles de filas y de
    # todas ellas sólo interesan las de un rubro.
    ts_df = _load("time_series.parquet", filtros={"RubroN2": rubro})
    if ts_df is None or "RubroN2" not in ts_df.columns:
        return None, None, None

    rubro_ts = ts_df.filter(ts_df["RubroN2"] == rubro)
    if len(rubro_ts) == 0 or "mes" not in rubro_ts.columns:
        return None, None, None

    # Años con 12 meses de data
    years_coverage = rubro_ts.group_by("anio").agg(pl.col("mes").max().alias("max_mes"))
    complete_years = set(
        years_coverage.filter(pl.col("max_mes") == 12).select("anio").to_series().to_list()
    )
    if not complete_years:
        return None, None, None

    year_agg = (
        rubro_ts.group_by("anio")
        .agg(
            [
                pl.col("monto_total").sum().alias("monto_total"),
                pl.col("n_oc").sum().alias("n_oc"),
            ]
        )
        .filter(pl.col("anio").is_in(list(complete_years)))
        .sort("anio")
        .tail(6)
    )

    if len(year_agg) < 2:
        return None, None, None

    rows = year_agg.to_dicts()
    first = rows[0]["monto_total"]
    last = rows[-1]["monto_total"]
    n_points = len(rows)

    cagr_pct = None
    if first and first > 0:
        try:
            cagr_pct = ((last / first) ** (1 / (n_points - 1)) - 1) * 100
            if cagr_pct > 1000 or cagr_pct < -99:
                cagr_pct = None
        except (ValueError, ZeroDivisionError, OverflowError):
            cagr_pct = None

    # YoY: último año completo vs el anterior
    yoy_pct = None
    if len(rows) >= 2:
        prev_monto = rows[-2]["monto_total"]
        if prev_monto and prev_monto > 0:
            try:
                yoy_pct = ((rows[-1]["monto_total"] / prev_monto) - 1) * 100
                if yoy_pct > 1000 or yoy_pct < -99:
                    yoy_pct = None
            except (ValueError, ZeroDivisionError, OverflowError):
                yoy_pct = None

    return cagr_pct, yoy_pct, rows
