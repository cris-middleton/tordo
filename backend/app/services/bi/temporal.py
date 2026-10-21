"""Todo lo que depende del tiempo: ventana de preparación, estacionalidad y
tendencia de un mercado.

Parte de `app.services.bi`, que reemplaza al antiguo `bi_service.py` de 1.476
líneas. El contrato hacia los endpoints no cambia: lo fija el golden master en
`backend/tests/golden/bi_golden.json`.
"""

from __future__ import annotations

import logging
from datetime import date

import polars as pl

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
    """En qué meses compra un organismo: doce filas, una por mes.

    Con rubro, las de `seasonality_patterns` para ese (organismo, rubro), tal
    como las calcula el ETL.

    **Sin rubro, se suman los rubros del organismo mes a mes.** La tabla tiene
    doce filas por rubro y sin rubro se devolvían todas mezcladas, sin decir de
    qué rubro era cada una: el mismo mes salía varias veces con cifras distintas.
    Ahora `compras_mes` es la suma, `prob_mes` la parte del año del organismo
    que cae en ese mes y `z_score` se recalcula sobre esas partes, como hace el
    ETL. `consistencia` (en qué fracción de los años compró ese mes) y con ella
    `es_pico_estacional` van nulas: la tabla guarda cuántos años tuvo compras
    cada rubro, no cuáles, y la unión entre rubros no se puede reconstruir. Con
    un solo rubro en el organismo no hay nada que sumar y salen sus filas.
    """
    # 1,78 millones de filas en la tabla; las de un organismo, doce por rubro.
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

    # Un solo rubro (pedido, o el único que el organismo tiene): sus filas son
    # ya las del organismo, con su consistencia exacta.
    if rubro or rows.get_column("RubroN2").n_unique() == 1:
        cols = [
            c
            for c in [
                "mes",
                "compras_mes",
                "prob_mes",
                "consistencia",
                "z_score",
                "es_pico_estacional",
            ]
            if c in rows.columns
        ]
        patrones = rows.select(cols).to_dicts()
    else:
        patrones = _estacionalidad_sumada(rows)

    return {
        "disponible": True,
        "organismo_id": organismo_id,
        "rubro": rubro,
        "patrones": patrones,
    }


def _estacionalidad_sumada(filas: pl.DataFrame) -> list[dict]:
    """Los rubros de un organismo sumados por mes (ver `get_estacionalidad`)."""
    por_mes = filas.group_by("mes").agg(pl.col("compras_mes").sum().cast(pl.Int64)).sort("mes")
    total = float(por_mes.get_column("compras_mes").sum() or 0)
    if total <= 0:
        return []
    por_mes = por_mes.with_columns((pl.col("compras_mes") / total).alias("prob_mes"))
    # Como `etl/analytics/seasonality.py`: desviación muestral, y 0 sin dispersión.
    media = por_mes.get_column("prob_mes").mean()
    desviacion = por_mes.get_column("prob_mes").std()
    if desviacion and desviacion > 0:
        z = (pl.col("prob_mes") - media) / desviacion
    else:
        z = pl.lit(0.0)
    return (
        por_mes.with_columns(
            z.alias("z_score"),
            pl.lit(None, dtype=pl.Float64).alias("consistencia"),
            pl.lit(None, dtype=pl.Boolean).alias("es_pico_estacional"),
        )
        .select(["mes", "compras_mes", "prob_mes", "consistencia", "z_score", "es_pico_estacional"])
        .to_dicts()
    )


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

    # serie_anual + cagr_rubro: sólo con rubro, y con la MISMA función que el
    # resumen (`_compute_cagr_rubro_desde_time_series`). Eran dos copias del
    # cálculo, y las dos contaban como completo un año a medias.
    serie_anual = None
    cagr_rubro = None
    if rubro:
        cagr_rubro, _, filas = _compute_cagr_rubro_desde_time_series(rubro)
        if filas:
            serie_anual = [
                {
                    "anio": int(r["anio"]),
                    "monto_total": float(r["monto_total"] or 0),
                    "n_oc": int(r["n_oc"]) if r.get("n_oc") is not None else None,
                }
                for r in filas
            ]

    return {
        "disponible": True,
        "tendencias": tendencias,
        "emergentes": emergentes,
        "serie_anual": serie_anual,
        "cagr_rubro": cagr_rubro,  # CAGR rubro-level computed from serie_anual (complete years only)
        "total": len(tendencias),
    }


def ventana_de_los_datos() -> tuple[date, date] | None:
    """(primer día, último día) de la ventana de analytics, o None.

    La escribe el ETL en las tablas que la llevan (`data_loader.con_ventana`);
    `time_series` sale de la misma ventana pero no la publica, así que se lee de
    una fila de `competitors_by_market`. None si la tabla no existe o es de antes
    de la ventana.
    """
    if not {"ventana_desde", "ventana_hasta"} <= _columnas("competitors_by_market.parquet"):
        return None
    df = _load(
        "competitors_by_market.parquet", columnas=["ventana_desde", "ventana_hasta"], limite=1
    )
    if df is None or df.is_empty():
        return None
    desde, hasta = df.row(0)
    if desde is None or hasta is None:
        return None
    return date.fromisoformat(str(desde)[:10]), date.fromisoformat(str(hasta)[:10])


def anios_completos(ts: pl.DataFrame, ventana: tuple[date, date] | None = None) -> list[int]:
    """Los años de la serie que los datos cubren entero, de enero a diciembre.

    **Antes bastaba con que el año tuviera diciembre** (`max(mes) == 12`). La
    ventana de analytics empieza a mitad de año —36 meses hacia atrás desde el
    último, p. ej. noviembre de 2023—, así que el primer año entraba al CAGR con
    dos meses contra los doce del siguiente: un rubro estable salía creciendo un
    ~145 % al año.

    Con la ventana conocida, un año es completo si la ventana lo cubre entero,
    aunque el rubro no haya comprado algún mes (ese mes vale cero, no «sin
    dato»). Sin ventana —una tabla de antes de que existiera—, si la serie trae
    los doce meses.
    """
    if ts.is_empty() or "mes" not in ts.columns:
        return []
    if ventana is not None:
        desde, hasta = ventana
        anios = ts.get_column("anio").drop_nulls().unique().to_list()
        return sorted(
            int(a) for a in anios if date(int(a), 1, 1) >= desde and date(int(a), 12, 31) <= hasta
        )
    cobertura = ts.group_by("anio").agg(pl.col("mes").n_unique().alias("meses"))
    return sorted(int(a) for a in cobertura.filter(pl.col("meses") == 12).get_column("anio"))


def _compute_cagr_rubro_desde_time_series(
    rubro: str,
) -> tuple[float | None, float | None, list[dict] | None]:
    """CAGR del rubro, variación interanual y serie anual, desde `time_series`.

    Sólo con años completos (`anios_completos`), los últimos 6 como mucho.
    Retorna (cagr_pct, yoy_pct, serie_anual_dicts).
      - cagr_pct: CAGR histórico sobre esos años
      - yoy_pct: variación del último año completo vs el anterior
    Con menos de dos años completos, (None, None, None).

    Es la única copia del cálculo: la usan `/bi/tendencia` (`cagr_rubro`,
    `serie_anual`) y `/bi/resumen` (`cagr_pct`, `yoy_pct`).
    """
    # Filtro empujado a SQL y sólo las columnas que se usan: la tabla entera son
    # 301 MB en Postgres con la ventana de 36 meses, y la API moría por OOM.
    ts_df = _load(
        "time_series.parquet",
        filtros={"RubroN2": rubro},
        columnas=["RubroN2", "anio", "mes", "monto_total", "n_oc"],
    )
    if ts_df is None or ts_df.is_empty():
        return None, None, None

    completos = anios_completos(ts_df, ventana_de_los_datos())
    if not completos:
        return None, None, None

    year_agg = (
        ts_df.group_by("anio")
        .agg(
            [
                pl.col("monto_total").sum().alias("monto_total"),
                pl.col("n_oc").sum().alias("n_oc"),
            ]
        )
        .filter(pl.col("anio").is_in(completos))
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
            # Fuera de un rango razonable es un artefacto de una base casi nula.
            if cagr_pct > 1000 or cagr_pct < -99:
                cagr_pct = None
        except (ValueError, ZeroDivisionError, OverflowError):
            cagr_pct = None

    # YoY: último año completo vs el anterior
    yoy_pct = None
    prev_monto = rows[-2]["monto_total"]
    if prev_monto and prev_monto > 0:
        try:
            yoy_pct = ((rows[-1]["monto_total"] / prev_monto) - 1) * 100
            if yoy_pct > 1000 or yoy_pct < -99:
                yoy_pct = None
        except (ValueError, ZeroDivisionError, OverflowError):
            yoy_pct = None

    return cagr_pct, yoy_pct, rows
