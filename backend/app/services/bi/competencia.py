"""Competidores de un mercado, previsión de competencia y posición propia.

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


def get_mi_posicion(codigo_proveedor: str, rubro: str) -> dict:
    """Posición REAL de un proveedor dentro de un rubro.

    **Recibe el `CodigoProveedor` de ChileCompra, no el RUT.** Antes recibía el
    RUT y lo normalizaba a `12345678-9` para compararlo con `CodigoProveedor`,
    que es el identificador interno de Mercado Público: de los 4.204.598
    registros de la tabla real, **ninguno** tiene esa forma. La comparación no
    acertaba nunca, así que esta pantalla le decía a todo el mundo —también a
    quien sí tiene historial— que no tenía órdenes en el rubro. La traducción
    RUT → código vive en `repositories/proveedores.py`.

    **Lo que había aquí estaba mal, y el error no era sutil.**
    `competitors_by_market` tiene una fila por *(organismo, rubro, proveedor)*:
    un mismo proveedor aparece tantas veces como compradores tiene. El código
    anterior filtraba por rubro, ordenaba por `market_share_pct` y devolvía la
    posición de la **primera fila** que coincidía con el RUT. Consecuencias,
    medidas sobre datos reales en «Servicios de recursos humanos»:

    - `total_proveedores` decía **128.462** cuando los proveedores distintos son
      **77.720** — contaba filas, no proveedores.
    - `participacion_pct` era la participación del proveedor **en un solo
      comprador**, presentada como su participación en el rubro. Los tres
      «líderes» del rubro tenían 99,9 %, 99,9 % y 99,0 %… cada uno de un
      comprador distinto.
    - `rank` ordenaba esas mismas filas, así que no significaba nada.

    Lo correcto es agregar por proveedor antes de rankear: sumar su monto en
    todos los compradores del rubro y dividir por el monto total del rubro. Con
    eso el líder real sale con 66,8 %, que es una cifra que se puede enseñar.

    Y el filtro viaja a SQL. Antes se traían los 4,2 millones de filas de la
    tabla a memoria para descartar el 97 %.
    """
    import polars as pl

    if not codigo_proveedor or not rubro:
        return {
            "disponible": False,
            "tiene_historial": False,
            "motivo": "código de proveedor y rubro requeridos",
        }

    codigo = str(codigo_proveedor).strip()

    df = _load(
        "competitors_by_market.parquet",
        filtros={"RubroN2": rubro},
        columnas=[
            "CodigoOrganismoPublico",
            "CodigoProveedor",
            "NombreProveedor",
            "monto_total",
            "n_oc",
        ],
    )
    if df is None:
        return {
            "disponible": False,
            "tiene_historial": False,
            "motivo": "parquets de competencia no disponibles",
        }
    if df.is_empty():
        return {
            "disponible": True,
            "tiene_historial": False,
            "motivo": f"sin datos para el rubro '{rubro}'",
        }

    # Una fila por proveedor: monto y órdenes sumados, y cuántos compradores
    # distintos atiende dentro del rubro.
    por_proveedor = (
        df.group_by("CodigoProveedor")
        .agg(
            pl.col("monto_total").sum().alias("monto"),
            pl.col("n_oc").sum().alias("oc"),
            pl.col("CodigoOrganismoPublico").n_unique().alias("compradores"),
            pl.col("NombreProveedor").first().alias("nombre"),
        )
        .sort(["monto", "CodigoProveedor"], descending=[True, False])
        .with_row_index("posicion", offset=1)
    )

    total_proveedores = por_proveedor.height
    monto_rubro = por_proveedor.select(pl.col("monto").sum()).item() or 0

    mias = por_proveedor.filter(pl.col("CodigoProveedor").cast(pl.Utf8) == codigo)
    if mias.is_empty():
        return {
            "disponible": True,
            "tiene_historial": False,
            "total_proveedores": total_proveedores,
            "motivo": f"Tu empresa no tiene historial de órdenes en '{rubro}'",
        }

    yo = mias.row(0, named=True)
    participacion = (yo["monto"] / monto_rubro * 100) if monto_rubro else None

    # Cuántos compradores atiende un proveedor típico del rubro. La MEDIANA y no
    # la media: la distribución tiene una cola larguísima —un puñado de
    # proveedores atiende cientos de organismos— y la media los sigue, dejando
    # al usuario comparándose contra un número que casi nadie alcanza.
    compradores_tipico = por_proveedor.select(pl.col("compradores").median()).item()

    return {
        "disponible": True,
        "tiene_historial": True,
        "participacion_pct": round(participacion, 4) if participacion is not None else None,
        "rank": int(yo["posicion"]),
        "total_proveedores": total_proveedores,
        "monto_rubro_clp": float(monto_rubro),
        "monto_propio_clp": float(yo["monto"]),
        "n_oc_propias": int(yo["oc"]),
        "n_organismos_atendidos": int(yo["compradores"]),
        "n_organismos_mediana_rubro": (
            round(float(compradores_tipico), 1) if compradores_tipico is not None else None
        ),
        **_diversificacion(codigo),
    }


def _diversificacion(codigo_proveedor: str) -> dict:
    """Concentración de cartera del proveedor, mirando TODOS sus rubros.

    Es la contraparte del resto de la respuesta: lo demás mira un rubro, esto
    mira si la empresa depende de un solo cliente en general. `hhi_org` es el
    Herfindahl de sus compradores, así que 10.000 es «un único cliente».

    Se devuelve `diversificacion_disponible` explícito porque la tabla puede no
    estar materializada todavía, y unos campos en `null` no distinguen «no lo
    sabemos» de «no tiene riesgo» — que es justo lo contrario.
    """
    df = _load(
        "provider_diversification.parquet",
        filtros={"CodigoProveedor": codigo_proveedor},
        columnas=[
            "hhi_org",
            "n_organismos",
            "n_rubros",
            "n_regiones",
            "score_diversificacion",
            "clasificacion",
            "alerta_dependencia",
        ],
    )
    if df is None:
        return {"diversificacion_disponible": False}
    if df.is_empty():
        return {"diversificacion_disponible": True, "diversificacion": None}

    fila = df.row(0, named=True)
    return {
        "diversificacion_disponible": True,
        "diversificacion": {
            "hhi_compradores": _num(fila.get("hhi_org")),
            "n_compradores_total": _int(fila.get("n_organismos")),
            "n_rubros_total": _int(fila.get("n_rubros")),
            "n_regiones_total": _int(fila.get("n_regiones")),
            "score": _num(fila.get("score_diversificacion")),
            "clasificacion": fila.get("clasificacion"),
            "alerta_dependencia": bool(fila.get("alerta_dependencia") or False),
        },
    }


def _num(v) -> float | None:
    return None if v is None else round(float(v), 4)


def _int(v) -> int | None:
    return None if v is None else int(v)
