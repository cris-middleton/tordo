"""Competidores de un mercado, previsión de competencia y posición propia.

Parte de `app.services.bi`, que reemplaza al antiguo `bi_service.py` de 1.476
líneas. El contrato hacia los endpoints no cambia: lo fija el golden master en
`backend/tests/golden/bi_golden.json`.
"""

from __future__ import annotations

import contextlib
import logging

from app.services.bi._base import _load

logger = logging.getLogger(__name__)


def _normalize_rut(rut: str | None) -> str:
    """Normaliza RUT chileno al formato esperado por CodigoProveedor del parquet.
    ChileCompra típicamente usa '12345678-9' (sin puntos, con guión).
    Retorna cadena vacía si el input es inválido o None."""
    if not rut:
        return ""
    cleaned = str(rut).replace(".", "").replace(" ", "").upper()
    if not cleaned:
        return ""
    # Si no tiene guión, insertar uno antes del último char (DV)
    if "-" not in cleaned and len(cleaned) > 1:
        cleaned = f"{cleaned[:-1]}-{cleaned[-1]}"
    return cleaned


def get_competidores(
    organismo_id: str,
    rubro: str | None = None,
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

    rows = df.filter(mask).sort("rank_monto").head(top_n)

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
        hhi_rows = (
            mc_df.filter(mc_mask)
            .select(["RubroN2", "hhi", "tipo_mercado", "n_proveedores"])
            .to_dicts()
        )

    return {
        "disponible": True,
        "organismo_id": organismo_id,
        "competidores": result,
        "concentracion": hhi_rows,
    }


def get_forecast_competidores(
    organismo_id: str | None = None,
    rubro: str | None = None,
    tipo: str | None = None,
) -> dict:
    """
    Competitor count forecast with hierarchical fallback L1 → L2 → L3.
      L1: organismo + rubro + tipo  (competitor_forecast_l1.parquet)
      L2: rubro + tipo              (competitor_forecast_l2.parquet)
      L3: tipo only                 (competitor_forecast_l3.parquet)
    """
    STAT_COLS = [
        "n",
        "p10",
        "p25",
        "p50",
        "p75",
        "p90",
        "media",
        "std",
        "n_sin_competencia",
        "n_baja_competencia",
        "pct_sin_competencia",
        "pct_baja_competencia",
        "nivel",
    ]

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
                    "disponible": True,
                    "nivel_usado": "L1",
                    "fallback": False,
                    "organismo_id": organismo_id,
                    "rubro": rubro,
                    "tipo": tipo,
                    "data": rows1.select(
                        _select(df1, ["CodigoOrganismo", "NombreOrganismo", "Rubro2", "CodigoTipo"])
                    ).to_dicts(),
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
                "disponible": True,
                "nivel_usado": "L2",
                "fallback": True,
                "organismo_id": organismo_id,
                "rubro": rubro,
                "tipo": tipo,
                "data": rows2.select(_select(df2, ["Rubro2", "CodigoTipo"])).to_dicts(),
            }

    # L3: tipo only
    if tipo:
        df3 = _load("competitor_forecast_l3.parquet")
        if df3 is not None:
            rows3 = df3.filter(df3["CodigoTipo"].cast(str) == str(tipo))
            if not rows3.is_empty():
                return {
                    "disponible": True,
                    "nivel_usado": "L3",
                    "fallback": True,
                    "organismo_id": organismo_id,
                    "rubro": rubro,
                    "tipo": tipo,
                    "data": rows3.select(_select(df3, ["CodigoTipo"])).to_dicts(),
                }

    return {"disponible": False, "motivo": "sin datos para los parámetros solicitados"}


def get_mi_posicion(empresa_rut: str, rubro: str) -> dict:
    """
    Posición del proveedor (empresa del usuario) en un rubro específico.
    Combina market_concentration / competitors_by_market para participación + rank,
    y provider_diversification para score de diversificación y alerta.
    """
    import polars as pl

    if not empresa_rut or not rubro:
        return {
            "disponible": False,
            "tiene_historial": False,
            "motivo": "rut y rubro requeridos",
        }

    rut_norm = _normalize_rut(empresa_rut)

    # ── Competencia en el rubro: buscar al proveedor ─────────────────────────
    # Preferir competitor_analysis; fallback a competitors_by_market
    df_comp = _load("competitor_analysis.parquet")
    if df_comp is None:
        df_comp = _load("competitors_by_market.parquet")

    if df_comp is None:
        return {
            "disponible": False,
            "tiene_historial": False,
            "motivo": "parquets de competencia no disponibles",
        }

    if "RubroN2" not in df_comp.columns or "CodigoProveedor" not in df_comp.columns:
        return {
            "disponible": False,
            "tiene_historial": False,
            "motivo": "schema de parquet no esperado",
        }

    subset = df_comp.filter(df_comp["RubroN2"] == rubro)
    if len(subset) == 0:
        return {
            "disponible": True,
            "tiene_historial": False,
            "motivo": f"sin datos para el rubro '{rubro}'",
        }

    # Ranking: preferir market_share_pct, fallback a monto_total
    if "market_share_pct" in subset.columns:
        ranked = subset.sort("market_share_pct", descending=True)
    elif "monto_total" in subset.columns:
        ranked = subset.sort("monto_total", descending=True)
    else:
        ranked = subset
    ranked_rows = ranked.to_dicts()
    total_prov = len(ranked_rows)

    empresa_row = None
    rank = None
    for i, row in enumerate(ranked_rows):
        if str(row.get("CodigoProveedor")) == rut_norm:
            empresa_row = row
            rank = i + 1
            break

    if empresa_row is None:
        return {
            "disponible": True,
            "tiene_historial": False,
            "total_proveedores": total_prov,
            "motivo": f"El RUT {rut_norm} no tiene historial de OC en '{rubro}'",
        }

    participacion_pct = (
        float(empresa_row.get("market_share_pct") or 0)
        if "market_share_pct" in empresa_row
        else None
    )

    # ── n_organismos atendidos (del row de la empresa si existe) ─────────────
    n_org_atendidos = None
    for key in ("n_organismos", "n_organismos_atendidos", "organismos_distintos"):
        if key in empresa_row and empresa_row[key] is not None:
            try:
                n_org_atendidos = int(empresa_row[key])
                break
            except (TypeError, ValueError):
                pass

    # ── n_organismos promedio del sector (heurística simple) ─────────────────
    # Promedio de n_organismos entre proveedores del mismo rubro, si la columna existe
    n_org_prom = None
    org_col = None
    for key in ("n_organismos", "n_organismos_atendidos", "organismos_distintos"):
        if key in ranked.columns:
            org_col = key
            break
    if org_col is not None:
        try:
            avg_val = ranked.select(pl.col(org_col).mean()).item()
            if avg_val is not None:
                n_org_prom = round(avg_val, 1)
        except Exception:
            n_org_prom = None

    # ── Diversificación (desde provider_diversification.parquet) ─────────────
    diversificacion_pct = None
    alerta_dependencia = False
    top_org_nombre = None
    top_org_pct = None
    df_div = _load("provider_diversification.parquet")
    if df_div is not None and "CodigoProveedor" in df_div.columns:
        row = df_div.filter(df_div["CodigoProveedor"] == rut_norm)
        if len(row) > 0:
            d = row.to_dicts()[0]
            # score_diversificacion suele estar en 0-1
            score = d.get("score_diversificacion")
            if score is not None:
                with contextlib.suppress(TypeError, ValueError):
                    diversificacion_pct = float(score) * 100
            alerta_dependencia = bool(d.get("alerta_dependencia") or False)
            top_org_nombre = d.get("top_comprador_nombre") or d.get("top_organismo_nombre")
            top_org_pct_raw = d.get("top_comprador_pct") or d.get("top_organismo_pct")
            if top_org_pct_raw is not None:
                try:
                    # Puede estar en fracción (0-1) o porcentaje
                    val = float(top_org_pct_raw)
                    top_org_pct = val * 100 if val <= 1.0 else val
                except (TypeError, ValueError):
                    pass

    top_organismo_empresa = None
    if top_org_nombre:
        top_organismo_empresa = {
            "nombre": top_org_nombre,
            "porcentaje_oc": top_org_pct,
        }

    return {
        "disponible": True,
        "tiene_historial": True,
        "participacion_pct": participacion_pct,
        "rank": rank,
        "total_proveedores": total_prov,
        "n_organismos_atendidos": n_org_atendidos,
        "n_organismos_promedio_sector": n_org_prom,
        "diversificacion_pct": diversificacion_pct,
        "alerta_dependencia": alerta_dependencia,
        "top_organismo_empresa": top_organismo_empresa,
    }
