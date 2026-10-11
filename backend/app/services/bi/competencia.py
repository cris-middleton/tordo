"""Competidores de un mercado y previsión de competencia.

Parte de `app.services.bi`, que reemplaza al antiguo `bi_service.py` de 1.476
líneas. El contrato hacia los endpoints no cambia: lo fija el golden master en
`backend/tests/golden/bi_golden.json`.
"""

from __future__ import annotations

import logging

from app.services.bi._base import _load

logger = logging.getLogger(__name__)


def get_competidores(
    organismo_id: str,
    rubro: str | None = None,
    top_n: int = 20,
) -> dict:
    """
    Top competitors in a buyer's market.
    Optionally filtered by RubroN2 category.
    """
    # `competitors_by_market` tiene 4,2 millones de filas. Sin empujar el
    # filtro se traían todas para quedarse con veinte.
    filtros: dict = {"CodigoOrganismoPublico": str(organismo_id)}
    if rubro:
        filtros["RubroN2"] = rubro

    df = _load("competitors_by_market.parquet", filtros=filtros)
    if df is None:
        return {"disponible": False, "motivo": "parquet no generado"}

    rows = df.sort("rank_monto").head(top_n)

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
    mc_df = _load("market_concentration.parquet", filtros=filtros)
    hhi_rows: list[dict] = []
    if mc_df is not None:
        hhi_rows = mc_df.select(["RubroN2", "hhi", "tipo_mercado", "n_proveedores"]).to_dicts()

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
