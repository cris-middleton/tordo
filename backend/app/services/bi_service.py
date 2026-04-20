"""
BIService — reads pre-computed Polars parquets from the analytics pipeline.

Files are lazy-loaded on first access and cached for 24h.  Each method
returns plain Python dicts/lists ready for Pydantic serialisation.

Parquet files live at settings.analytics_data_path (default: etl/data/analytics/).
"""
from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Cache: {filename: (loaded_at_unix, polars.DataFrame)}
_cache: dict[str, tuple[float, Any]] = {}
_CACHE_TTL = 86_400  # 24h


def _load(filename: str) -> Any:
    """Return a Polars DataFrame, using in-process cache with TTL."""
    import polars as pl  # lazy import — not installed in base env during tests

    from app.config import settings  # avoid circular import at module level

    now = time.time()
    if filename in _cache:
        loaded_at, df = _cache[filename]
        if now - loaded_at < _CACHE_TTL:
            return df

    path = Path(settings.analytics_data_path) / filename
    if not path.exists():
        return None

    df = pl.read_parquet(path)
    _cache[filename] = (now, df)
    logger.info("Loaded %s (%d rows)", filename, len(df))
    return df


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────


def get_precio_producto(
    codigo_producto: str,
    organismo_id: Optional[str] = None,
    unidad_medida: Optional[str] = None,
) -> dict:
    """
    Price bands for a given product (codigoProductoONU).

    Hierarchical fallback L1 → L2 → L3:
      L1 (producto + organismo + unidad): most specific, requires organismo_id.
      L2 (producto + sector + unidad): sector fallback when organismo has no data.
      L3 (producto + unidad nacional): national fallback of last resort.

    Returns p10/p25/p50/p75/p90, confidence, sample count, and nivel_usado.
    """
    # ETL writes the column as "NombreroductoGenerico" (missing 'P' — historical typo).
    # COLS lists use the typo'd name so _sel finds it; _to_dicts renames to the
    # canonical API name "NombreProductoGenerico" before Pydantic serialisation.
    COLS_L1 = [
        "codigoProductoONU", "NombreroductoGenerico",
        "CodigoOrganismoPublico", "OrganismoPublico", "UnidadMedida",
        "p10", "p25", "p50", "p75", "p90", "pu_mean", "cv", "confianza", "n",
    ]
    COLS_L2 = [
        "codigoProductoONU", "NombreroductoGenerico", "sector", "UnidadMedida",
        "p10", "p25", "p50", "p75", "p90", "pu_mean", "cv", "confianza", "n",
    ]
    COLS_L3 = [
        "codigoProductoONU", "NombreroductoGenerico", "UnidadMedida",
        "p10", "p25", "p50", "p75", "p90", "pu_mean", "cv", "confianza", "n",
    ]

    def _sel(df, cols):
        return [c for c in cols if c in df.columns]

    def _to_dicts(df, cols):
        selected = df.select(_sel(df, cols))
        if "NombreroductoGenerico" in selected.columns:
            selected = selected.rename({"NombreroductoGenerico": "NombreProductoGenerico"})
        return selected.to_dicts()

    def _unit_mask(df):
        if unidad_medida:
            return df["UnidadMedida"] == unidad_medida
        return None

    # ── Level 1: producto + organismo ────────────────────────────────────────
    if organismo_id:
        df1 = _load("product_price_bands_L1.parquet")
        if df1 is not None:
            mask = (
                (df1["codigoProductoONU"].cast(str) == str(codigo_producto)) &
                (df1["CodigoOrganismoPublico"].cast(str) == str(organismo_id))
            )
            um = _unit_mask(df1)
            if um is not None:
                mask = mask & um
            rows = df1.filter(mask)
            if not rows.is_empty():
                return {
                    "disponible": True,
                    "codigo_producto": codigo_producto,
                    "resultado": _to_dicts(rows, COLS_L1),
                    "total_registros": len(rows),
                    "nivel_usado": "L1",
                    "fallback": False,
                }

    # ── Level 2: producto + sector ───────────────────────────────────────────
    df2 = _load("product_price_bands_L2.parquet")
    if df2 is not None:
        mask = df2["codigoProductoONU"].cast(str) == str(codigo_producto)
        um = _unit_mask(df2)
        if um is not None:
            mask = mask & um
        rows = df2.filter(mask)
        if not rows.is_empty():
            return {
                "disponible": True,
                "codigo_producto": codigo_producto,
                "resultado": _to_dicts(rows, COLS_L2),
                "total_registros": len(rows),
                "nivel_usado": "L2",
                "fallback": True,
                "fallback_motivo": "sin datos del organismo específico — referencia por sector",
            }

    # ── Level 3: producto nacional ───────────────────────────────────────────
    df3 = _load("product_price_bands_L3.parquet")
    if df3 is not None:
        mask = df3["codigoProductoONU"].cast(str) == str(codigo_producto)
        um = _unit_mask(df3)
        if um is not None:
            mask = mask & um
        rows = df3.filter(mask)
        if not rows.is_empty():
            return {
                "disponible": True,
                "codigo_producto": codigo_producto,
                "resultado": _to_dicts(rows, COLS_L3),
                "total_registros": len(rows),
                "nivel_usado": "L3",
                "fallback": True,
                "fallback_motivo": "sin datos por organismo ni sector — referencia nacional",
            }

    # ── Level 4: organismo-level price bands (general context) ───────────────
    if organismo_id:
        df4 = _load("price_bands.parquet")
        if df4 is not None:
            mask4 = df4["CodigoOrganismoPublico"].cast(str) == str(organismo_id)
            rows4 = df4.filter(mask4).head(5)
            if not rows4.is_empty():
                # Map price_bands columns to PrecioBanda layout
                mapped = []
                for r in rows4.to_dicts():
                    mapped.append({
                        "p10": r.get("p10"),
                        "p25": r.get("p25"),
                        "p50": r.get("precio_mediana"),
                        "p75": r.get("p75"),
                        "p90": r.get("p90"),
                        "pu_mean": r.get("precio_promedio"),
                        "cv": r.get("coef_variacion"),
                        "NombreProductoGenerico": r.get("RubroN2"),
                        "n": r.get("n_transacciones"),
                        "confianza": "referencial" if r.get("precio_predecible") else "baja",
                    })
                return {
                    "disponible": True,
                    "codigo_producto": codigo_producto,
                    "resultado": mapped,
                    "total_registros": len(mapped),
                    "nivel_usado": "L4",
                    "fallback": True,
                    "fallback_motivo": "sin datos por producto — referencia general del organismo por rubro",
                }

    return {"disponible": False, "motivo": "producto no encontrado en histórico (L1+L2+L3+L4)"}


def get_competidores(
    organismo_id: str,
    rubro: Optional[str] = None,
    top_n: int = 20,
) -> dict:
    """
    Top competitors in a buyer's market.
    Optionally filtered by RubroN2 category.
    """
    df = _load("competitors_by_market.parquet")
    if df is None:
        return {"disponible": False, "motivo": "parquet no generado"}

    mask = df["CodigoOrganismoPublico"].cast(str) == str(organismo_id)
    if rubro:
        mask = mask & (df["RubroN2"] == rubro)

    rows = (
        df.filter(mask)
        .sort("rank_monto")
        .head(top_n)
    )

    if rows.is_empty():
        return {"disponible": False, "motivo": "organismo no encontrado en histórico"}

    result = rows.select(
        [
            "CodigoOrganismoPublico",
            "OrganismoPublico",
            "RubroN2",
            "CodigoProveedor",
            "NombreProveedor",
            "market_share_pct",
            "win_rate_pct",
            "rank_monto",
            "n_oc",
            "monto_total",
            "n_proveedores",
        ]
    ).to_dicts()

    # Pull HHI from market_concentration if available
    mc_df = _load("market_concentration.parquet")
    hhi_rows: list[dict] = []
    if mc_df is not None:
        mc_mask = mc_df["CodigoOrganismoPublico"].cast(str) == str(organismo_id)
        if rubro:
            mc_mask = mc_mask & (mc_df["RubroN2"] == rubro)
        hhi_rows = mc_df.filter(mc_mask).select(["RubroN2", "hhi", "tipo_mercado", "n_proveedores"]).to_dicts()

    return {
        "disponible": True,
        "organismo_id": organismo_id,
        "competidores": result,
        "concentracion": hhi_rows,
    }


def get_oportunidades(
    organismo_id: Optional[str] = None,
    rubro: Optional[str] = None,
    min_score: float = 6.0,
    limit: int = 50,
) -> dict:
    """
    Ranked opportunities (opportunity_score 0–10).
    Optionally filtered by organismo and/or rubro.
    """
    df = _load("opportunity_scores.parquet")
    if df is None:
        return {"disponible": False, "motivo": "parquet no generado"}

    mask = df["opportunity_score"] >= min_score
    if organismo_id:
        mask = mask & (df["CodigoOrganismoPublico"].cast(str) == str(organismo_id))
    if rubro:
        mask = mask & (df["RubroN2"] == rubro)

    rows = (
        df.filter(mask)
        .sort("opportunity_score", descending=True)
        .head(limit)
    )

    wanted = [
        "CodigoOrganismoPublico",
        "RubroN2",
        "opportunity_score",
        "n_transacciones",
        "coef_variacion",
        "hhi",
        "n_proveedores",
        "cagr",
    ]
    available = [c for c in wanted if c in rows.columns]
    result = rows.select(available).to_dicts()

    # Enrich with NombreOrganismo from buyer_scores
    bs_df = _load("buyer_scores.parquet")
    if bs_df is not None:
        name_map = dict(
            zip(
                bs_df["CodigoOrganismoPublico"].cast(str).to_list(),
                bs_df["NombreOrganismo"].to_list(),
            )
        )
        for row in result:
            code = str(row.get("CodigoOrganismoPublico", ""))
            row["NombreOrganismo"] = name_map.get(code)

    return {
        "disponible": True,
        "oportunidades": result,
        "total": len(result),
        "filtros": {
            "organismo_id": organismo_id,
            "rubro": rubro,
            "min_score": min_score,
        },
    }


def get_ventana(codigo_externo: str) -> dict:
    """
    Preparation window classification for a specific licitación.
    Returns alerta_ventana_corta, presion_score, pct_del_tipico.
    Returns 503-style dict if parquet not yet generated.
    """
    df = _load("window_classified.parquet")
    if df is None:
        return {
            "disponible": False,
            "motivo": "parquet window_classified no generado — ejecute el ETL de analytics",
        }

    rows = df.filter(df["CodigoExterno"] == str(codigo_externo))
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


def get_comprador(organismo_id: str) -> dict:
    """
    Buyer profile: payment behaviour, risk flags, and overall score.
    Combines buyer_scores + buyer_risk_flags + buyer_payment_stats.
    """
    score_df = _load("buyer_scores.parquet")
    flags_df = _load("buyer_risk_flags.parquet")
    payment_df = _load("buyer_payment_stats.parquet")

    if score_df is None:
        return {"disponible": False, "motivo": "parquet no generado"}

    mask_score = score_df["CodigoOrganismoPublico"].cast(str) == str(organismo_id)
    score_rows = score_df.filter(mask_score)
    if score_rows.is_empty():
        return {"disponible": False, "motivo": "organismo no encontrado en histórico"}

    score = score_rows.row(0, named=True)

    flags: dict = {}
    if flags_df is not None:
        mask_f = flags_df["CodigoOrganismoPublico"].cast(str) == str(organismo_id)
        f_rows = flags_df.filter(mask_f)
        if not f_rows.is_empty():
            flags = f_rows.row(0, named=True)

    payment: dict = {}
    if payment_df is not None:
        mask_p = payment_df["CodigoOrganismoPublico"].cast(str) == str(organismo_id)
        p_rows = payment_df.filter(mask_p)
        if not p_rows.is_empty():
            payment = p_rows.row(0, named=True)

    # ── Transparency index ────────────────────────────────────────────────────
    transp_df = _load("buyer_transparency.parquet")
    transp: dict = {}
    if transp_df is not None:
        # buyer_transparency uses CodigoOrganismo (from LIC data); buyer_scores uses
        # CodigoOrganismoPublico (from OC data).  Try both column names.
        id_col = (
            "CodigoOrganismo"
            if "CodigoOrganismo" in transp_df.columns
            else "CodigoOrganismoPublico"
        )
        t_rows = transp_df.filter(transp_df[id_col].cast(str) == str(organismo_id))
        if not t_rows.is_empty():
            transp = t_rows.row(0, named=True)

    return {
        "disponible": True,
        "organismo_id": organismo_id,
        "nombre": score.get("NombreOrganismo"),
        "buyer_score": score.get("buyer_score"),
        "clasificacion": score.get("clasificacion"),
        "pago": {
            "mediana_dias_pago": score.get("mediana_dias_pago"),
            "p75_dias_pago": score.get("p75_dias_pago"),
            "p90_dias_pago": score.get("p90_dias_pago"),
            "tasa_aceptacion": score.get("tasa_aceptacion"),
            "tasa_cancelacion": score.get("tasa_cancelacion"),
            "tasa_adjudicacion": score.get("tasa_adjudicacion"),
        },
        "scores_detalle": {
            "velocidad_pago": score.get("score_velocidad_pago"),
            "tasa_aceptacion": score.get("score_tasa_aceptacion"),
            "no_cancelacion": score.get("score_tasa_no_cancelacion"),
            "adjudicacion": score.get("score_tasa_adjudicacion"),
            "regularidad": score.get("score_regularidad"),
            "volumen": score.get("score_volumen"),
            "satisfaccion": score.get("score_satisfaccion"),
        },
        "risk_flags": {
            "n_flags": flags.get("n_flags", 0),
            "pago_lento": flags.get("flag_pago_lento", False),
            "pago_impredecible": flags.get("flag_pago_impredecible", False),
            "cancelaciones": flags.get("flag_cancelaciones", False),
            "licitaciones_fallidas": flags.get("flag_licitaciones_fallidas", False),
            "baja_calificacion": flags.get("flag_baja_calificacion", False),
            "compras_irregulares": flags.get("flag_compras_irregulares", False),
        },
        "volumen": {
            "n_oc_total": payment.get("n_oc_total") or score.get("n_oc_total"),
            "n_meses_activo": score.get("n_meses_activo"),
            "prom_calificacion": score.get("prom_calificacion"),
            "prom_oferentes": score.get("prom_oferentes"),
        },
        "transparencia": {
            "transparencia_score": transp.get("transparencia_score"),
            "clasificacion": transp.get("clasificacion"),
            "pct_trato_directo": transp.get("pct_trato_directo"),
            "tasa_fracaso": transp.get("tasa_fracaso"),
            "hhi": transp.get("hhi"),
            "n_lic_total": transp.get("n_lic_total"),
        } if transp else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Composite panel (single call for tender detail view)
# ─────────────────────────────────────────────────────────────────────────────


def get_licitacion_panel(
    codigo_externo: str,
    organismo_id: Optional[str] = None,
    product_codes: Optional[list] = None,
) -> dict:
    """
    Composite BI snapshot for the licitación detail page.

    Aggregates: comprador score + transparencia, ventana de preparación,
    top-5 competidores, and per-product price fallback bands (L1→L2→L3).
    Returns a single dict matching the LicitacionBIPanel schema.
    """
    # ── Comprador ─────────────────────────────────────────────────────────────
    if organismo_id:
        full = get_comprador(organismo_id)
        pago = full.get("pago") or {}
        flags = full.get("risk_flags") or {}
        comprador: dict = {
            "disponible": full["disponible"],
            "nombre": full.get("nombre"),
            "buyer_score": full.get("buyer_score"),
            "clasificacion": full.get("clasificacion"),
            "mediana_dias_pago": pago.get("mediana_dias_pago"),
            "tasa_adjudicacion": pago.get("tasa_adjudicacion"),
            "n_flags": flags.get("n_flags", 0),
            "transparencia": full.get("transparencia"),
            "motivo": full.get("motivo"),
        }
    else:
        comprador = {"disponible": False, "motivo": "organismo_id no disponible", "n_flags": 0}

    # ── Ventana ───────────────────────────────────────────────────────────────
    v = get_ventana(codigo_externo)
    ventana: dict = {
        "disponible": v["disponible"],
        "alerta_ventana_corta": v.get("alerta_ventana_corta"),
        "presion_score": v.get("presion_score"),
        "clasificacion_ventana": v.get("clasificacion_ventana"),
        "pct_del_tipico": v.get("pct_del_tipico"),
        "window_days": v.get("window_days"),
        "motivo": v.get("motivo"),
    }

    # ── Competidores (top 5) ──────────────────────────────────────────────────
    if organismo_id:
        c = get_competidores(organismo_id, top_n=5)
        conc = (c.get("concentracion") or [{}])[0]
        competidores: dict = {
            "disponible": c["disponible"],
            "top5": (c.get("competidores") or [])[:5],
            "hhi": conc.get("hhi"),
            "tipo_mercado": conc.get("tipo_mercado"),
            "motivo": c.get("motivo"),
        }
    else:
        competidores = {"disponible": False, "motivo": "organismo_id no disponible"}

    # ── Precios (L1→L2→L3 per product) ───────────────────────────────────────
    precios: list = []
    if product_codes and organismo_id:
        seen: set = set()
        for code in product_codes:
            if code in seen or len(precios) >= 5:
                break
            seen.add(code)
            p = get_precio_producto(code, organismo_id)
            if p["disponible"] and p.get("resultado"):
                first = p["resultado"][0]
                precios.append({
                    "disponible": True,
                    "codigo_producto": code,
                    "nivel_usado": p.get("nivel_usado"),
                    "fallback": p.get("fallback", False),
                    "p10": first.get("p10"),
                    "p25": first.get("p25"),
                    "p50": first.get("p50"),
                    "p75": first.get("p75"),
                    "p90": first.get("p90"),
                    "confianza": first.get("confianza"),
                    "n": first.get("n"),
                })
            else:
                precios.append({"disponible": False, "codigo_producto": code})

    return {
        "codigo_externo": codigo_externo,
        "organismo_id": organismo_id,
        "comprador": comprador,
        "ventana": ventana,
        "competidores": competidores,
        "precios": precios,
        # postulacion_id and estado_habil injected by the API layer (need DB)
        "postulacion_id": None,
        "estado_habil": None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Paso D — extended BI API
# ─────────────────────────────────────────────────────────────────────────────


def get_estacionalidad(
    organismo_id: str,
    rubro: Optional[str] = None,
) -> dict:
    """
    Monthly seasonality patterns for an organismo (+ optional rubro filter).
    Returns prob_mes, consistencia, es_pico_estacional for each of the 12 months.
    """
    df = _load("seasonality_patterns.parquet")
    if df is None:
        return {"disponible": False, "motivo": "parquet no generado"}

    mask = df["CodigoOrganismoPublico"].cast(str) == str(organismo_id)
    if rubro:
        mask = mask & (df["RubroN2"] == rubro)

    rows = df.filter(mask).sort("mes")
    if rows.is_empty():
        return {"disponible": False, "motivo": "organismo no encontrado en histórico de estacionalidad"}

    cols = [c for c in ["mes", "compras_mes", "prob_mes", "consistencia", "z_score", "es_pico_estacional"] if c in rows.columns]
    return {
        "disponible": True,
        "organismo_id": organismo_id,
        "rubro": rubro,
        "patrones": rows.select(cols).to_dicts(),
    }


def get_tendencia(
    rubro: Optional[str] = None,
    tendencia: Optional[str] = None,
    solo_emergentes: bool = False,
    limit: int = 50,
) -> dict:
    """
    Market growth trends from trend_by_market.parquet.
    emerging_markets.parquet contains the subset with CAGR > 20%.
    """
    df = _load("trend_by_market.parquet")
    em_df = _load("emerging_markets.parquet")

    if df is None:
        return {"disponible": False, "motivo": "parquet no generado"}

    # Require minimum data quality: at least 3 years and 15 transactions
    # to avoid CAGR blowups from near-zero base values or tiny samples
    min_anios = df["n_anios"] >= 3 if "n_anios" in df.columns else df["cagr"].is_not_null()
    min_oc = df["total_oc"] >= 15 if "total_oc" in df.columns else df["cagr"].is_not_null()

    mask = df["cagr"].is_not_null() & min_anios & min_oc
    if rubro:
        mask = mask & (df["RubroN2"] == rubro)
    if tendencia:
        mask = mask & (df["tendencia"] == tendencia)

    cols = [c for c in ["CodigoOrganismoPublico", "RubroN2", "slope_mensual", "r_squared", "cagr", "tendencia", "n_anios", "total_oc"] if c in df.columns]
    rows = df.filter(mask).sort("cagr", descending=True).head(limit)
    tendencias = rows.select(cols).to_dicts()

    emergentes: list = []
    if em_df is not None:
        em_min_anios = em_df["n_anios"] >= 3 if "n_anios" in em_df.columns else em_df["cagr"].is_not_null()
        em_min_oc = em_df["total_oc"] >= 15 if "total_oc" in em_df.columns else em_df["cagr"].is_not_null()
        em_mask = em_df["cagr"].is_not_null() & em_min_anios & em_min_oc
        if rubro:
            em_mask = em_mask & (em_df["RubroN2"] == rubro)
        em_cols = [c for c in cols if c in em_df.columns]
        em_rows = em_df.filter(em_mask).sort("cagr", descending=True).head(20)
        if not em_rows.is_empty():
            emergentes = em_rows.select(em_cols).to_dicts()

    # serie_anual + cagr_rubro: solo cuando hay rubro filtrado
    serie_anual = None
    cagr_rubro = None
    if rubro:
        import polars as pl  # noqa: PLC0415 — lazy import kept consistent with _load()
        ts_df = _load("time_series.parquet")
        if ts_df is not None and "RubroN2" in ts_df.columns:
            # Filtrar por rubro
            rubro_ts = ts_df.filter(ts_df["RubroN2"] == rubro)

            # Determinar qué años están completos: max(mes) == 12
            if "mes" in rubro_ts.columns and len(rubro_ts) > 0:
                years_coverage = (
                    rubro_ts
                    .group_by("anio")
                    .agg(pl.col("mes").max().alias("max_mes"))
                )
                complete_years = set(
                    years_coverage
                    .filter(pl.col("max_mes") == 12)
                    .select("anio")
                    .to_series()
                    .to_list()
                )
            else:
                complete_years = set()

            # Agregar por año, filtrar a solo años completos, quedarse con los últimos 6
            year_agg = (
                rubro_ts
                .group_by("anio")
                .agg([
                    pl.col("monto_total").sum().alias("monto_total"),
                    pl.col("n_oc").sum().alias("n_oc"),
                ])
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


def get_descuento(
    tipo: Optional[str] = None,
    rubro: Optional[str] = None,
    n_oferentes_rango: Optional[str] = None,
) -> dict:
    """
    Optimal discount recommendations by competitive context (type + rubro + n_oferentes band).
    """
    df = _load("discount_by_context.parquet")
    if df is None:
        return {"disponible": False, "motivo": "parquet no generado"}

    mask = df["CodigoTipo"].is_not_null()
    if tipo:
        mask = mask & (df["CodigoTipo"].cast(str) == str(tipo))
    if rubro:
        mask = mask & (df["Rubro2"] == rubro)
    if n_oferentes_rango:
        mask = mask & (df["n_oferentes_rango"] == n_oferentes_rango)

    rows = df.filter(mask).head(100)
    if rows.is_empty():
        return {"disponible": False, "motivo": "sin datos para los filtros solicitados"}

    # Rename señal_competencia → senial_competencia for clean JSON keys
    rename_map = {"señal_competencia": "senial_competencia"}
    select_cols = [c for c in ["CodigoTipo", "Rubro2", "n_oferentes_rango", "n", "p10", "p25", "p50", "p75", "p90", "media", "cv_descuento"] if c in rows.columns]
    result = rows.select(select_cols).to_dicts()
    if "señal_competencia" in rows.columns:
        sc = rows.select(["señal_competencia"]).to_dicts()
        for i, row in enumerate(result):
            row["senial_competencia"] = sc[i]["señal_competencia"]

    return {
        "disponible": True,
        "tipo": tipo,
        "rubro": rubro,
        "descuentos": result,
        "total": len(result),
    }


def get_forecast_competidores(
    organismo_id: Optional[str] = None,
    rubro: Optional[str] = None,
    tipo: Optional[str] = None,
) -> dict:
    """
    Competitor count forecast with hierarchical fallback L1 → L2 → L3.
      L1: organismo + rubro + tipo  (competitor_forecast_l1.parquet)
      L2: rubro + tipo              (competitor_forecast_l2.parquet)
      L3: tipo only                 (competitor_forecast_l3.parquet)
    """
    STAT_COLS = ["n", "p10", "p25", "p50", "p75", "p90", "media", "std",
                 "n_sin_competencia", "n_baja_competencia",
                 "pct_sin_competencia", "pct_baja_competencia", "nivel"]

    def _select(df, extra_cols):
        all_cols = extra_cols + STAT_COLS
        return [c for c in all_cols if c in df.columns]

    # L1: organismo + rubro + tipo
    if organismo_id:
        df1 = _load("competitor_forecast_l1.parquet")
        if df1 is not None:
            m = df1["CodigoOrganismo"].cast(str) == str(organismo_id)
            if rubro:
                m = m & (df1["Rubro2"] == rubro)
            if tipo:
                m = m & (df1["CodigoTipo"].cast(str) == str(tipo))
            rows1 = df1.filter(m)
            if not rows1.is_empty():
                return {
                    "disponible": True, "nivel_usado": "L1", "fallback": False,
                    "organismo_id": organismo_id, "rubro": rubro, "tipo": tipo,
                    "data": rows1.select(_select(df1, ["CodigoOrganismo", "NombreOrganismo", "Rubro2", "CodigoTipo"])).to_dicts(),
                }

    # L2: rubro + tipo
    df2 = _load("competitor_forecast_l2.parquet")
    if df2 is not None:
        m2 = df2["CodigoTipo"].is_not_null()
        if rubro:
            m2 = m2 & (df2["Rubro2"] == rubro)
        if tipo:
            m2 = m2 & (df2["CodigoTipo"].cast(str) == str(tipo))
        rows2 = df2.filter(m2)
        if not rows2.is_empty():
            return {
                "disponible": True, "nivel_usado": "L2", "fallback": True,
                "organismo_id": organismo_id, "rubro": rubro, "tipo": tipo,
                "data": rows2.select(_select(df2, ["Rubro2", "CodigoTipo"])).to_dicts(),
            }

    # L3: tipo only
    if tipo:
        df3 = _load("competitor_forecast_l3.parquet")
        if df3 is not None:
            rows3 = df3.filter(df3["CodigoTipo"].cast(str) == str(tipo))
            if not rows3.is_empty():
                return {
                    "disponible": True, "nivel_usado": "L3", "fallback": True,
                    "organismo_id": organismo_id, "rubro": rubro, "tipo": tipo,
                    "data": rows3.select(_select(df3, ["CodigoTipo"])).to_dicts(),
                }

    return {"disponible": False, "motivo": "sin datos para los parámetros solicitados"}


def get_diversificacion(codigo_proveedor: str) -> dict:
    """
    Provider diversification score and customer-concentration alert.
    High HHI / alerta_dependencia=True indicates risk of single-buyer dependency.
    """
    df = _load("provider_diversification.parquet")
    if df is None:
        return {"disponible": False, "motivo": "parquet no generado"}

    rows = df.filter(df["CodigoProveedor"].cast(str) == str(codigo_proveedor))
    if rows.is_empty():
        return {"disponible": False, "motivo": "proveedor no encontrado en histórico"}

    row = rows.row(0, named=True)
    return {
        "disponible": True,
        "codigo_proveedor": codigo_proveedor,
        "nombre_proveedor": row.get("NombreProveedor"),
        "hhi_org": row.get("hhi_org"),
        "score_diversificacion": row.get("score_diversificacion"),
        "clasificacion": row.get("clasificacion"),
        "n_oc": row.get("n_oc"),
        "n_organismos": row.get("n_organismos"),
        "alerta_dependencia": row.get("alerta_dependencia"),
    }


def get_sector(
    sector: Optional[str] = None,
    limit: int = 50,
) -> dict:
    """
    Sector-level market overview from sector_dashboard.parquet.
    Returns all sectors sorted by monto_total, or a single sector if specified.
    """
    df = _load("sector_dashboard.parquet")
    if df is None:
        return {"disponible": False, "motivo": "parquet no generado"}

    if sector:
        rows = df.filter(df["sector"] == sector)
    else:
        rows = df.sort("monto_total", descending=True).head(limit)

    if rows.is_empty():
        return {"disponible": False, "motivo": "sector no encontrado"}

    cols = [c for c in ["sector", "n_oc", "monto_total", "ticket_mediana", "n_organismos", "n_proveedores"] if c in rows.columns]
    return {
        "disponible": True,
        "sectores": rows.select(cols).to_dicts(),
        "total": len(rows),
    }


def _compute_cagr_rubro_desde_time_series(rubro: str) -> "tuple[Optional[float], Optional[float], Optional[list[dict]]]":
    """Helper: computa CAGR rubro-level + YoY + serie anual completa desde time_series.parquet.

    Excluye años incompletos (max(mes) < 12).
    Retorna (cagr_pct, yoy_pct, serie_anual_dicts).
      - cagr_pct: CAGR histórico sobre todos los años completos disponibles (hasta 6)
      - yoy_pct: variación del último año completo vs el anterior
    Si no hay data suficiente, retorna (None, None, None).
    """
    import polars as pl

    ts_df = _load("time_series.parquet")
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
        rubro_ts
        .group_by("anio")
        .agg([
            pl.col("monto_total").sum().alias("monto_total"),
            pl.col("n_oc").sum().alias("n_oc"),
        ])
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


def get_resumen(rubro: Optional[str] = None) -> dict:
    """
    Resumen narrativo de un rubro. Combina:
    - time_series (monto_anual, n_organismos, CAGR rubro-level, n proveedores)
    - market_concentration (teaser competencia: líder, share, tipo_mercado)
    - buyer_scores + opportunity_scores (top comprador con clasificación de pago)
    - seasonality_patterns (teaser estacionalidad: mes pico, consistencia avg)
    """
    import polars as pl

    if not rubro:
        return {"disponible": False, "motivo": "rubro requerido"}

    # ── CAGR + YoY + serie anual desde time_series ───────────────────────────
    cagr_pct, yoy_pct, serie_rows = _compute_cagr_rubro_desde_time_series(rubro)

    # ── Monto anual + n_organismos desde time_series ─────────────────────────
    monto_anual: Optional[float] = None
    n_organismos: Optional[int] = None
    if serie_rows:
        monto_anual = float(serie_rows[-1]["monto_total"])

    ts_df = _load("time_series.parquet")
    if ts_df is not None and "RubroN2" in ts_df.columns and serie_rows:
        years = [r["anio"] for r in serie_rows]
        last_year = years[-1]
        rubro_last = ts_df.filter((ts_df["RubroN2"] == rubro) & (ts_df["anio"] == last_year))
        if "CodigoOrganismoPublico" in rubro_last.columns and len(rubro_last) > 0:
            n_organismos = rubro_last.select("CodigoOrganismoPublico").n_unique()

    # ── N proveedores desde competitors_by_market ────────────────────────────
    n_prov_actual: Optional[int] = None
    df_comp = _load("competitors_by_market.parquet")
    if df_comp is not None and "CodigoProveedor" in df_comp.columns and "RubroN2" in df_comp.columns:
        subset = df_comp.filter(df_comp["RubroN2"] == rubro)
        if len(subset) > 0:
            n_prov_actual = subset.select("CodigoProveedor").n_unique()

    # ── Top comprador: organismo más activo del rubro en opportunity_scores ──
    top_comprador: Optional[dict] = None
    top_organismo_code: Optional[str] = None
    df_opp = _load("opportunity_scores.parquet")
    df_buyers = _load("buyer_scores.parquet")
    if df_opp is not None and "RubroN2" in df_opp.columns and df_buyers is not None:
        opps_rubro = (
            df_opp.filter(df_opp["RubroN2"] == rubro)
            .sort("n_transacciones", descending=True)
            .head(10)
        )
        if len(opps_rubro) > 0:
            codes = opps_rubro.select("CodigoOrganismoPublico").to_series().cast(str).to_list()
            for code in codes:
                row = df_buyers.filter(df_buyers["CodigoOrganismoPublico"].cast(str) == code)
                if len(row) > 0:
                    b = row.to_dicts()[0]
                    pago_dias = b.get("mediana_dias_pago")
                    if pago_dias and pago_dias > 45:
                        clasif = "lento"
                    elif pago_dias and pago_dias > 30:
                        clasif = "medio"
                    else:
                        clasif = "bueno"
                    top_comprador = {
                        "codigo": code,
                        "nombre": b.get("NombreOrganismo"),
                        "pago_mediana_dias": int(pago_dias) if pago_dias is not None else None,
                        "clasificacion_pago": clasif,
                    }
                    top_organismo_code = code
                    break  # el primero con datos en buyer_scores

    # ── Teaser competencia desde market_concentration ────────────────────────
    teaser_competencia: Optional[dict] = None
    df_mc = _load("market_concentration.parquet")
    if df_mc is not None and "RubroN2" in df_mc.columns:
        mc_subset = df_mc.filter(df_mc["RubroN2"] == rubro)
        if len(mc_subset) > 0:
            # Agregar por rubro: líder global (mayor top_share_pct acumulado), HHI promedio
            # Buscar el registro con mayor monto_total_mercado para representar el mercado
            if "monto_total_mercado" in mc_subset.columns:
                mc_top = mc_subset.sort("monto_total_mercado", descending=True).head(1).to_dicts()[0]
            else:
                mc_top = mc_subset.sort("hhi", descending=True).head(1).to_dicts()[0]

            lider_nombre = mc_top.get("top_proveedor")
            lider_share = float(mc_top.get("top_share_pct") or 0)
            tipo_mercado = mc_top.get("tipo_mercado")
            # Fallback tipo_mercado desde HHI si no está
            if not tipo_mercado:
                hhi = mc_top.get("hhi")
                if hhi:
                    if hhi > 2500:
                        tipo_mercado = "concentrado"
                    elif hhi > 1500:
                        tipo_mercado = "moderado"
                    else:
                        tipo_mercado = "fragmentado"

            if lider_nombre:
                teaser_competencia = {
                    "lider_nombre": lider_nombre,
                    "lider_share_pct": lider_share,
                    "tipo_mercado": tipo_mercado,
                }

    # ── Teaser estacionalidad: mes pico + consistencia avg ──────────────────
    teaser_estacionalidad: Optional[dict] = None
    meses_es = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    if top_organismo_code:
        df_seas = _load("seasonality_patterns.parquet")
        if df_seas is not None and "CodigoOrganismoPublico" in df_seas.columns:
            seas_rows = df_seas.filter(
                (df_seas["CodigoOrganismoPublico"].cast(str) == top_organismo_code)
                & (df_seas["RubroN2"] == rubro)
            )
            if len(seas_rows) == 0:
                # Fallback: cualquier rubro del organismo
                seas_rows = df_seas.filter(df_seas["CodigoOrganismoPublico"].cast(str) == top_organismo_code)
            if len(seas_rows) > 0:
                dicts = seas_rows.to_dicts()
                pico = max(dicts, key=lambda r: r.get("prob_mes") or 0)
                mes_num = pico.get("mes")
                mes_pico = meses_es[mes_num - 1] if mes_num and 1 <= mes_num <= 12 else None
                consistencias = [r.get("consistencia") for r in dicts if r.get("consistencia") is not None]
                consistencia_avg = int(sum(consistencias) / len(consistencias) * 100) if consistencias else None
                if mes_pico or consistencia_avg is not None:
                    teaser_estacionalidad = {
                        "mes_pico_mayor": mes_pico,
                        "consistencia_avg_pct": consistencia_avg,
                    }

    return {
        "disponible": True,
        "rubro": rubro,
        "monto_anual_clp": monto_anual,
        "n_organismos": n_organismos,
        "cagr_pct": cagr_pct,
        "yoy_pct": yoy_pct,
        "n_proveedores_actual": n_prov_actual,
        "n_proveedores_hace_3_anios": None,  # not computable without temporal provider data
        "top_comprador": top_comprador,
        "teaser_competencia": teaser_competencia,
        "teaser_estacionalidad": teaser_estacionalidad,
    }


def get_rubros(limit: int = 354) -> dict:
    """
    Return the standardized RubroN2 list from ChileCompra taxonomy,
    sorted by frequency (number of market opportunities) descending.
    Excludes null / 'NA' entries.
    """
    df = _load("opportunity_scores.parquet")
    if df is None:
        return {"disponible": False, "motivo": "parquet no generado"}

    rubros = (
        df.filter(
            df["RubroN2"].is_not_null() & (df["RubroN2"] != "NA") & (df["RubroN2"] != "")
        )
        .group_by("RubroN2")
        .len()
        .sort("len", descending=True)
        .head(limit)
        .get_column("RubroN2")
        .to_list()
    )

    return {
        "disponible": True,
        "rubros": rubros,
        "total": len(rubros),
    }
