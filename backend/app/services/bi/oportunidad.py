"""Scoring de oportunidades y catálogo de rubros.

Parte de `app.services.bi`, que reemplaza al antiguo `bi_service.py` de 1.476
líneas. El contrato hacia los endpoints no cambia: lo fija el golden master en
`backend/tests/golden/bi_golden.json`.
"""

from __future__ import annotations

import logging

from app.services.bi._base import _contar, _load

logger = logging.getLogger(__name__)


def get_oportunidades(
    organismo_id: str | None = None,
    rubro: str | None = None,
    min_score: float = 6.0,
    limit: int = 50,
) -> dict:
    """
    Ranked opportunities (opportunity_score 0–10).
    Optionally filtered by organismo and/or rubro.
    """
    filtros: dict = {}
    if organismo_id:
        filtros["CodigoOrganismoPublico"] = str(organismo_id)
    if rubro:
        filtros["RubroN2"] = rubro

    # Todo viaja a SQL: el rubro/organismo, el mínimo y el top-N. Sin rubro esto
    # se traía la tabla entera (238.000 filas) para quedarse con 50, y junto con
    # /bi/rubros y /bi/tendencia mataba la API por memoria al abrir /mercado.
    df = _load(
        "opportunity_scores.parquet",
        filtros=filtros or None,
        minimos={"opportunity_score": min_score},
        orden="opportunity_score",
        limite=limit,
    )
    if df is None:
        return {"disponible": False, "motivo": "parquet no generado"}

    mask = df["opportunity_score"] >= min_score

    rows = df.filter(mask).sort("opportunity_score", descending=True).head(limit)

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

    # El nombre sale de buyer_scores, pedido sólo para los compradores de la
    # respuesta y sólo con las dos columnas que hacen falta.
    codigos = sorted(
        {str(row["CodigoOrganismoPublico"]) for row in result if "CodigoOrganismoPublico" in row}
    )
    bs_df = (
        _load(
            "buyer_scores.parquet",
            filtros={"CodigoOrganismoPublico": codigos},
            columnas=["CodigoOrganismoPublico", "NombreOrganismo"],
        )
        if codigos
        else None
    )
    if bs_df is not None:
        name_map = dict(
            zip(
                bs_df["CodigoOrganismoPublico"].cast(str).to_list(),
                bs_df["NombreOrganismo"].to_list(),
                strict=True,
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


def get_rubros(limit: int = 354) -> dict:
    """
    Return the standardized RubroN2 list from ChileCompra taxonomy,
    sorted by frequency (number of market opportunities) descending.
    Excludes null / 'NA' entries.
    """
    # Se cuenta en SQL. Traerse la columna de las 238.000 filas para contarla en
    # Polars era parte de la ráfaga que mataba la API al abrir /mercado. Los
    # empates se ordenan por nombre, en bytes, como antes: con `limit` el empate
    # decide QUÉ rubros entran (ver `sql_contar_por`).
    conteos = _contar("opportunity_scores.parquet", "RubroN2", excluir=["NA", ""], limite=limit)
    if conteos is None:
        return {"disponible": False, "motivo": "parquet no generado"}

    rubros = [valor for valor, _filas in conteos]
    return {
        "disponible": True,
        "rubros": rubros,
        "total": len(rubros),
    }
