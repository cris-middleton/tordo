"""Vistas agregadas de mercado: descuento esperado, diversificación de
proveedores, dashboard por sector y el resumen narrativo de un rubro.

Parte de `app.services.bi`, que reemplaza al antiguo `bi_service.py` de 1.476
líneas. El contrato hacia los endpoints no cambia: lo fija el golden master en
`backend/tests/golden/bi_golden.json`.
"""

from __future__ import annotations

import logging

from app.services.bi._base import _load
from app.services.bi.temporal import _compute_cagr_rubro_desde_time_series

logger = logging.getLogger(__name__)


def get_descuento(
    tipo: str | None = None,
    rubro: str | None = None,
    n_oferentes_rango: str | None = None,
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

    # El renombrado señal_competencia → senial_competencia se hace más abajo,
    # de forma explícita sobre las filas ya seleccionadas.
    select_cols = [
        c
        for c in [
            "CodigoTipo",
            "Rubro2",
            "n_oferentes_rango",
            "n",
            "p10",
            "p25",
            "p50",
            "p75",
            "p90",
            "media",
            "cv_descuento",
        ]
        if c in rows.columns
    ]
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
    sector: str | None = None,
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

    cols = [
        c
        for c in [
            "sector",
            "n_oc",
            "monto_total",
            "ticket_mediana",
            "n_organismos",
            "n_proveedores",
        ]
        if c in rows.columns
    ]
    return {
        "disponible": True,
        "sectores": rows.select(cols).to_dicts(),
        "total": len(rows),
    }


def get_resumen(rubro: str | None = None) -> dict:
    """
    Resumen narrativo de un rubro. Combina:
    - time_series (monto_anual, n_organismos, CAGR rubro-level, n proveedores)
    - market_concentration (teaser competencia: líder, share, tipo_mercado)
    - buyer_scores + opportunity_scores (top comprador con clasificación de pago)
    - seasonality_patterns (teaser estacionalidad: mes pico, consistencia avg)
    """

    if not rubro:
        return {"disponible": False, "motivo": "rubro requerido"}

    # ── CAGR + YoY + serie anual desde time_series ───────────────────────────
    cagr_pct, yoy_pct, serie_rows = _compute_cagr_rubro_desde_time_series(rubro)

    # ── Monto anual + n_organismos desde time_series ─────────────────────────
    monto_anual: float | None = None
    n_organismos: int | None = None
    if serie_rows:
        monto_anual = float(serie_rows[-1]["monto_total"])

    ts_df = _load("time_series.parquet", filtros={"RubroN2": rubro})
    if ts_df is not None and "RubroN2" in ts_df.columns and serie_rows:
        years = [r["anio"] for r in serie_rows]
        last_year = years[-1]
        rubro_last = ts_df.filter((ts_df["RubroN2"] == rubro) & (ts_df["anio"] == last_year))
        if "CodigoOrganismoPublico" in rubro_last.columns and len(rubro_last) > 0:
            n_organismos = rubro_last.select("CodigoOrganismoPublico").n_unique()

    # ── N proveedores desde competitors_by_market ────────────────────────────
    n_prov_actual: int | None = None
    df_comp = _load("competitors_by_market.parquet", filtros={"RubroN2": rubro})
    if (
        df_comp is not None
        and "CodigoProveedor" in df_comp.columns
        and "RubroN2" in df_comp.columns
    ):
        subset = df_comp.filter(df_comp["RubroN2"] == rubro)
        if len(subset) > 0:
            n_prov_actual = subset.select("CodigoProveedor").n_unique()

    # ── Top comprador: organismo más activo del rubro en opportunity_scores ──
    top_comprador: dict | None = None
    top_organismo_code: str | None = None
    df_opp = _load("opportunity_scores.parquet", filtros={"RubroN2": rubro})
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
    teaser_competencia: dict | None = None
    df_mc = _load("market_concentration.parquet")
    if df_mc is not None and "RubroN2" in df_mc.columns:
        mc_subset = df_mc.filter(df_mc["RubroN2"] == rubro)
        if len(mc_subset) > 0:
            # Agregar por rubro: líder global (mayor top_share_pct acumulado), HHI promedio
            # Buscar el registro con mayor monto_total_mercado para representar el mercado
            if "monto_total_mercado" in mc_subset.columns:
                mc_top = (
                    mc_subset.sort("monto_total_mercado", descending=True).head(1).to_dicts()[0]
                )
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
    teaser_estacionalidad: dict | None = None
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
                seas_rows = df_seas.filter(
                    df_seas["CodigoOrganismoPublico"].cast(str) == top_organismo_code
                )
            if len(seas_rows) > 0:
                dicts = seas_rows.to_dicts()
                pico = max(dicts, key=lambda r: r.get("prob_mes") or 0)
                mes_num = pico.get("mes")
                mes_pico = meses_es[mes_num - 1] if mes_num and 1 <= mes_num <= 12 else None
                consistencias = [
                    r.get("consistencia") for r in dicts if r.get("consistencia") is not None
                ]
                consistencia_avg = (
                    int(sum(consistencias) / len(consistencias) * 100) if consistencias else None
                )
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
