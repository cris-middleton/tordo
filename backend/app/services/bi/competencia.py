"""Competidores de un mercado y previsión de competencia.

Parte de `app.services.bi`, que reemplaza al antiguo `bi_service.py` de 1.476
líneas. El contrato hacia los endpoints no cambia: lo fija el golden master en
`backend/tests/golden/bi_golden.json`.
"""

from __future__ import annotations

import logging

from app.services.bi._base import _load, periodo_de

logger = logging.getLogger(__name__)

#: Tope de filas de `competitor_forecast_l2` por lectura. La tabla tiene una fila
#: por (rubro, tipo de licitación): unas pocas miles como mucho. Sólo corta si
#: alguien llama sin rubro ni tipo; con cualquiera de los dos filtros va muy por
#: debajo. Existe para que ninguna lectura de BI sea «la tabla entera, sin más».
MAX_FILAS_FORECAST = 5000


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
        "periodo": periodo_de(df),
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

    # Los tres niveles filtran en SQL (índice [CodigoOrganismo, Rubro2, CodigoTipo]
    # en L1): antes se traía cada tabla entera para quedarse con unas filas.
    # Las columnas de código son texto en las tres, así que la igualdad es directa.

    # L1: organismo + rubro + tipo
    if organismo_id:
        filtros1: dict = {"CodigoOrganismo": str(organismo_id)}
        if rubro:
            filtros1["Rubro2"] = rubro
        if tipo:
            filtros1["CodigoTipo"] = str(tipo)
        rows1 = _load("competitor_forecast_l1.parquet", filtros=filtros1)
        if rows1 is not None and not rows1.is_empty():
            return {
                "disponible": True,
                "nivel_usado": "L1",
                "fallback": False,
                "organismo_id": organismo_id,
                "rubro": rubro,
                "tipo": tipo,
                "data": rows1.select(
                    _select(rows1, ["CodigoOrganismo", "NombreOrganismo", "Rubro2", "CodigoTipo"])
                ).to_dicts(),
            }

    # L2: rubro + tipo
    filtros2: dict = {}
    if rubro:
        filtros2["Rubro2"] = rubro
    if tipo:
        filtros2["CodigoTipo"] = str(tipo)
    df2 = _load(
        "competitor_forecast_l2.parquet", filtros=filtros2 or None, limite=MAX_FILAS_FORECAST
    )
    if df2 is not None:
        # Sin tipo pedido, las filas sin tipo siguen fuera, como siempre.
        rows2 = df2.filter(df2["CodigoTipo"].is_not_null())
        if not rows2.is_empty():
            return {
                "disponible": True,
                "nivel_usado": "L2",
                "fallback": True,
                "organismo_id": organismo_id,
                "rubro": rubro,
                "tipo": tipo,
                "data": rows2.select(_select(rows2, ["Rubro2", "CodigoTipo"])).to_dicts(),
            }

    # L3: tipo only
    if tipo:
        rows3 = _load("competitor_forecast_l3.parquet", filtros={"CodigoTipo": str(tipo)})
        if rows3 is not None and not rows3.is_empty():
            return {
                "disponible": True,
                "nivel_usado": "L3",
                "fallback": True,
                "organismo_id": organismo_id,
                "rubro": rubro,
                "tipo": tipo,
                "data": rows3.select(_select(rows3, ["CodigoTipo"])).to_dicts(),
            }

    return {"disponible": False, "motivo": "sin datos para los parámetros solicitados"}
