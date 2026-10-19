"""Vistas agregadas de mercado: descuento esperado, diversificación de
proveedores, dashboard por sector y el resumen narrativo de un rubro.

Parte de `app.services.bi`, que reemplaza al antiguo `bi_service.py` de 1.476
líneas. El contrato hacia los endpoints no cambia: lo fija el golden master en
`backend/tests/golden/bi_golden.json`.
"""

from __future__ import annotations

import logging

import polars as pl

from app.services.bi._base import _load
from app.services.bi.temporal import _compute_cagr_rubro_desde_time_series

logger = logging.getLogger(__name__)

#: Cuántos contextos de descuento devuelve `get_descuento`, los de más `n`.
MAX_CONTEXTOS_DESCUENTO = 100


def get_descuento(
    tipo: str | None = None,
    rubro: str | None = None,
    n_oferentes_rango: str | None = None,
) -> dict:
    """Bandas de descuento por contexto competitivo (tipo + rubro + rango de oferentes).

    **Las de más licitaciones primero** (`n`), como mucho `MAX_CONTEXTOS_DESCUENTO`.
    Con un rubro son pocas filas y caben todas; sin filtros, la tabla tiene una por
    cada (tipo, rubro, rango) del país y lo que se devuelve son los contextos con
    más observaciones —los que más dicen—. Antes era un `LIMIT 100` sin orden: cien
    filas cualesquiera, las que Postgres leyera primero.
    """
    # Los filtros viajan a SQL. Antes se traía la tabla entera y se recortaba en
    # Polars a cien filas: el 99 % del trabajo era leer lo que se iba a tirar.
    filtros = {}
    if tipo:
        filtros["CodigoTipo"] = str(tipo)
    if rubro:
        filtros["Rubro2"] = rubro
    if n_oferentes_rango:
        filtros["n_oferentes_rango"] = n_oferentes_rango

    df = _load(
        "discount_by_context.parquet",
        filtros=filtros or None,
        orden="n",
        limite=MAX_CONTEXTOS_DESCUENTO,
    )
    if df is None:
        return {"disponible": False, "motivo": "parquet no generado"}

    # `CodigoTipo` nulo nunca sirve: la recomendación de descuento se lee por
    # tipo de licitación.
    rows = df.filter(df["CodigoTipo"].is_not_null())
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
    df = _load(
        "provider_diversification.parquet", filtros={"CodigoProveedor": str(codigo_proveedor)}
    )
    if df is None:
        return {"disponible": False, "motivo": "parquet no generado"}

    rows = df
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
            # La ventana sólo si la tabla la trae: la del golden master no la
            # tiene, y su contrato no cambia.
            "ventana_desde",
            "ventana_hasta",
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

    # ── Proveedores y líder REAL del rubro ───────────────────────────────────
    #
    # Una sola lectura de `competitors_by_market` para las dos cosas: el número
    # de proveedores distintos y quién lidera de verdad. Antes eran dos lecturas
    # y la segunda daba un resultado incorrecto (ver abajo).
    n_prov_actual: int | None = None
    lider: dict | None = None
    hhi_rubro: float | None = None
    df_comp = _load(
        "competitors_by_market.parquet",
        filtros={"RubroN2": rubro},
        columnas=["CodigoProveedor", "NombreProveedor", "monto_total"],
    )
    if df_comp is not None and not df_comp.is_empty():
        n_prov_actual = df_comp.select("CodigoProveedor").n_unique()

        monto_rubro = df_comp.select(pl.col("monto_total").sum()).item() or 0
        if monto_rubro > 0:
            por_proveedor = (
                df_comp.group_by("CodigoProveedor")
                .agg(
                    pl.col("monto_total").sum().alias("monto"),
                    pl.col("NombreProveedor").first().alias("nombre"),
                )
                .with_columns((pl.col("monto") / monto_rubro * 100).alias("share"))
            )
            top = por_proveedor.sort(["monto", "CodigoProveedor"], descending=[True, False]).head(1)
            fila = top.row(0, named=True)
            lider = {"nombre": fila["nombre"], "share_pct": round(float(fila["share"]), 2)}
            # HHI de verdad: suma de los cuadrados de las cuotas de TODOS los
            # proveedores del rubro. El que se usaba antes venía de
            # `market_concentration`, que lo calcula por (organismo, rubro): es
            # la concentración dentro de UN comprador, no la del mercado.
            hhi_rubro = float(por_proveedor.select((pl.col("share") ** 2).sum()).item())

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
            for opp in opps_rubro.to_dicts():
                code = str(opp["CodigoOrganismoPublico"])
                row = df_buyers.filter(df_buyers["CodigoOrganismoPublico"].cast(str) == code)
                if len(row) > 0:
                    b = row.to_dicts()[0]
                    # **Se quitó la clasificación «bueno | medio | lento».**
                    # Clasificaba `mediana_dias_pago` con cortes en 30 y 45 días
                    # sobre un dato cuyo máximo es 12,8 — así que TODOS los
                    # compradores salían «bueno», siempre. Una etiqueta con un
                    # solo valor posible no clasifica: decora.
                    #
                    # Lo que se publica ahora es el volumen, que sí distingue y
                    # sí se puede verificar.
                    top_comprador = {
                        "codigo": code,
                        "nombre": b.get("NombreOrganismo"),
                        "n_oc_total": b.get("n_oc_total"),
                        # Las de ESTE rubro, que es por lo que se le eligió. La
                        # frase decía «el comprador más activo [del rubro], con
                        # N órdenes» usando `n_oc_total`, que son TODAS las
                        # suyas, de cualquier rubro.
                        "n_oc_rubro": opp.get("n_transacciones"),
                    }
                    top_organismo_code = code
                    break  # el primero con datos en buyer_scores

    # ── Competencia del rubro ────────────────────────────────────────────────
    #
    # **Lo que había aquí era incorrecto.** Tomaba de `market_concentration` la
    # fila con mayor `monto_total_mercado` —es decir, el par (organismo, rubro)
    # más grande— y publicaba su `top_proveedor` como «el líder del rubro» con
    # su `top_share_pct` como si fuera la cuota del rubro entero. Medido sobre
    # datos reales, el teaser decía «UNIVERSIDAD DE LOS LAGOS con 0 %» cuando su
    # cuota real del rubro es 66,79 %.
    #
    # Ahora el líder y el HHI salen de agregar por proveedor sobre el rubro
    # completo, que es lo que la frase promete.
    teaser_competencia: dict | None = None
    if lider and lider.get("nombre"):
        if hhi_rubro is None:
            tipo_mercado = None
        elif hhi_rubro > 2500:
            tipo_mercado = "concentrado"
        elif hhi_rubro > 1500:
            tipo_mercado = "moderado"
        else:
            tipo_mercado = "fragmentado"
        teaser_competencia = {
            "lider_nombre": lider["nombre"],
            "lider_share_pct": lider["share_pct"],
            "tipo_mercado": tipo_mercado,
            "hhi": round(hhi_rubro) if hhi_rubro is not None else None,
        }

    # ── Teaser estacionalidad: mes pico + consistencia avg ──────────────────
    teaser_estacionalidad: dict | None = None
    meses_es = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    if top_organismo_code:
        # Filtro empujado: sin él se traían los 1,78 millones de filas de
        # `seasonality_patterns` para quedarse con doce.
        df_seas = _load(
            "seasonality_patterns.parquet",
            filtros={"CodigoOrganismoPublico": top_organismo_code},
        )
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
        "top_comprador": top_comprador,
        "teaser_competencia": teaser_competencia,
        "teaser_estacionalidad": teaser_estacionalidad,
    }
