"""Scoring de oportunidades y catálogo de rubros.

Parte de `app.services.bi`, que reemplaza al antiguo `bi_service.py` de 1.476
líneas. El contrato hacia los endpoints no cambia: lo fija el golden master en
`backend/tests/golden/bi_golden.json`.
"""

from __future__ import annotations

import logging

from app.services.bi._base import _load

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
    # Los filtros de igualdad viajan al WHERE; el de `min_score` es una
    # desigualdad y se queda en Polars sobre lo ya reducido. Antes se traían las
    # 238.000 filas de la tabla para descartar casi todas.
    filtros: dict = {}
    if organismo_id:
        filtros["CodigoOrganismoPublico"] = str(organismo_id)
    if rubro:
        filtros["RubroN2"] = rubro

    df = _load("opportunity_scores.parquet", filtros=filtros or None)
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


def get_rubros(limit: int = 354) -> dict:
    """
    Return the standardized RubroN2 list from ChileCompra taxonomy,
    sorted by frequency (number of market opportunities) descending.
    Excludes null / 'NA' entries.
    """
    # Sólo hace falta la columna del rubro: traer las quince restantes de las
    # 238.000 filas para contar valores distintos es tráfico puro.
    df = _load("opportunity_scores.parquet", columnas=["RubroN2"])
    if df is None:
        return {"disponible": False, "motivo": "parquet no generado"}

    rubros = (
        df.filter(df["RubroN2"].is_not_null() & (df["RubroN2"] != "NA") & (df["RubroN2"] != ""))
        .group_by("RubroN2")
        .len()
        # El desempate por nombre no es cosmético: muchos rubros comparten el
        # mismo conteo, y con `head(limit)` el empate decide QUÉ rubros entran en
        # la respuesta, no sólo en qué orden. Sin él, dos llamadas sobre los
        # mismos datos podían devolver listas distintas según el orden físico de
        # las filas.
        .sort(["len", "RubroN2"], descending=[True, False])
        .head(limit)
        .get_column("RubroN2")
        .to_list()
    )

    return {
        "disponible": True,
        "rubros": rubros,
        "total": len(rubros),
    }
