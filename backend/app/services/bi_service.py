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
    COLS_L1 = [
        "codigoProductoONU", "NombreProductoGenerico",
        "CodigoOrganismoPublico", "OrganismoPublico", "UnidadMedida",
        "p10", "p25", "p50", "p75", "p90", "pu_mean", "cv", "confianza", "n",
    ]
    COLS_L2 = [
        "codigoProductoONU", "NombreProductoGenerico", "sector", "UnidadMedida",
        "p10", "p25", "p50", "p75", "p90", "pu_mean", "cv", "confianza", "n",
    ]
    COLS_L3 = [
        "codigoProductoONU", "NombreProductoGenerico", "UnidadMedida",
        "p10", "p25", "p50", "p75", "p90", "pu_mean", "cv", "confianza", "n",
    ]

    def _sel(df, cols):
        return [c for c in cols if c in df.columns]

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
                    "resultado": rows.select(_sel(rows, COLS_L1)).to_dicts(),
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
                "resultado": rows.select(_sel(rows, COLS_L2)).to_dicts(),
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
                "resultado": rows.select(_sel(rows, COLS_L3)).to_dicts(),
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

    result = rows.select(
        [
            "CodigoOrganismoPublico",
            "RubroN2",
            "opportunity_score",
            "n_transacciones",
            "coef_variacion",
            "hhi",
            "n_proveedores",
            "cagr",
        ]
    ).to_dicts()

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

    mask = df["cagr"].is_not_null()
    if rubro:
        mask = mask & (df["RubroN2"] == rubro)
    if tendencia:
        mask = mask & (df["tendencia"] == tendencia)

    cols = [c for c in ["CodigoOrganismoPublico", "RubroN2", "slope_mensual", "r_squared", "cagr", "tendencia"] if c in df.columns]
    rows = df.filter(mask).sort("cagr", descending=True).head(limit)
    tendencias = rows.select(cols).to_dicts()

    emergentes: list = []
    if em_df is not None:
        em_mask = em_df["cagr"].is_not_null()
        if rubro:
            em_mask = em_mask & (em_df["RubroN2"] == rubro)
        em_cols = [c for c in cols if c in em_df.columns]
        em_rows = em_df.filter(em_mask).sort("cagr", descending=True).head(20)
        if not em_rows.is_empty():
            emergentes = em_rows.select(em_cols).to_dicts()

    return {
        "disponible": True,
        "tendencias": tendencias,
        "emergentes": emergentes,
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
