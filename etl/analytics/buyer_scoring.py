"""
Scoring de Compradores (Organismos Públicos) — 0 a 1

Evalúa la calidad de cada organismo como cliente para un proveedor PYME.
Un score alto = comprador confiable, rápido para pagar, predecible.
Un score bajo = comprador con cancelaciones, lento, impredecible.

Componentes del score (todos normalizados 0–1):

  ┌─────────────────────────────────────────────────────────────────────┐
  │ COMPONENTE              │ PESO  │ FUENTE   │ FÓRMULA              │
  ├─────────────────────────┼───────┼──────────┼──────────────────────┤
  │ Transparencia           │ 0.25  │ LIC      │ 1 - clamp(pct_TD /   │
  │                         │       │          │   0.40, 0, 1)        │
  │ Tasa de aceptación      │ 0.20  │ OC       │ clamp((tasa - 0.5)   │
  │                         │       │          │   / 0.5, 0, 1)       │
  │ Tasa de NO cancelación  │ 0.15  │ OC       │ 1 - clamp(tasa_      │
  │                         │       │          │   cancel / 0.20, 1)  │
  │ Tasa adjudicación LIC   │ 0.15  │ LIC      │ clamp((tasa - 0.5)   │
  │                         │       │          │   / 0.5, 0, 1)       │
  │ Regularidad de compras  │ 0.10  │ OC       │ 1 - clamp(cv_mensual │
  │                         │       │          │   / 1.5, 1)          │
  │ Volumen (oportunidad)   │ 0.10  │ OC       │ log(n_oc) / max_log  │
  │ Satisfacción proveedor  │ 0.05  │ OC       │ prom_calificación /  │
  │                         │       │          │   5.0                │
  └─────────────────────────┴───────┴──────────┴──────────────────────┘

  Nota: se reemplazó Velocidad de Pago por Transparencia (% Trato Directo).
  El Estado chileno paga rápido (mediana 1.4 días), lo que hacía que el 90 %
  de organismos obtuviera score "excelente" en esa dimensión — sin información
  diferenciadora. El % de Trato Directo discrimina mucho mejor.

  score_final = Σ(componente_i × peso_i)  ∈ [0, 1]

  Interpretación:
    0.8–1.0  Excelente — pago rápido, sin cancelaciones, predecible
    0.6–0.8  Bueno — confiable en general, tiempos razonables
    0.4–0.6  Regular — algunos problemas de pago o cancelaciones
    0.2–0.4  Riesgoso — lento, cancelaciones frecuentes
    0.0–0.2  Alto riesgo — evitar o cobrar prima

Output:
  - buyer_scores.parquet: score por organismo con desglose
  - buyer_payment_stats.parquet: estadísticas detalladas de pago
  - buyer_risk_flags.parquet: alertas de riesgo por comprador
"""

import logging

import polars as pl

from .config import OUTPUT_DIR
from .data_loader import iter_lic_parquets, iter_oc_parquets, orden_por_fila
from .identidad import nombre_vigente

logger = logging.getLogger(__name__)

#: Días de mediana por encima de los cuales una orden tarda en aceptarse más de
#: lo normal. Es el percentil 99 de la distribución real (19 compradores de
#: 1.222): por debajo de esto la bandera marcaría a demasiados para significar
#: algo.
UMBRAL_ACEPTACION_LENTA = 5.0

#: Ídem para la cola: p90 por encima de esto es el percentil 90 de los p90
#: (204 de 1.222). Marca al comprador cuyas órdenes a veces se quedan paradas,
#: aunque su mediana esté bien.
UMBRAL_ACEPTACION_ERRATICA = 15.0

# Pesos de cada componente
WEIGHTS = {
    "transparencia": 0.25,  # % Trato Directo — reemplaza velocidad_pago
    "tasa_aceptacion": 0.20,
    "tasa_no_cancelacion": 0.15,
    "tasa_adjudicacion": 0.15,
    "regularidad": 0.10,
    "volumen": 0.10,
    "satisfaccion": 0.05,
}


# ─────────────────────────────────────────────────────────────────────
# Paso 1: Métricas de OC por comprador
# ─────────────────────────────────────────────────────────────────────


def build_oc_buyer_metrics() -> pl.DataFrame:
    """
    Agrega métricas de OC por organismo:
    - Días envío → aceptación (mediana, p75, p90)
    - Tasa de aceptación (Recepcion Conforme + Aceptada)
    - Tasa de cancelación
    - Regularidad mensual (CV del conteo mensual)
    - Calificación promedio de proveedores
    - Volumen total
    """
    logger.info("Calculando métricas de OC por comprador...")

    cols_needed = [
        "Codigo",
        "CodigoOrganismoPublico",
        "OrganismoPublico",
        "sector",
        "RegionUnidadCompra",
        "FechaEnvio",
        "FechaAceptacion",
        "Estado",
        "codigoEstado",
        "FechaCancelacion",
        "PromedioCalificacion",
        "CantidadEvaluacion",
        "MontoTotalOC_PesosChilenos",
        "_periodo_archivo",
    ]

    # Acumuladores por organismo
    payment_frames = []
    status_frames = []
    volume_frames = []
    rating_frames = []

    # Con las canceladas: la tasa de cancelación las cuenta, y sin ellas en el
    # denominador todo comprador saldría con 0 %.
    for _periodo, df in iter_oc_parquets(columns=cols_needed, canceladas=True):
        org_col = "CodigoOrganismoPublico"
        if org_col not in df.columns:
            continue

        # **Una fila por ORDEN, no por línea.** El archivo trae una fila por ítem
        # (≈2,9 por orden, medido), y todo lo de abajo contaba filas: «órdenes
        # emitidas» eran líneas, y la tasa de aceptación y los días de
        # aceptación quedaban ponderados por cuántos ítems tenía cada orden.
        # Todo lo que se mira aquí —fechas, estado, organismo— es de la orden.
        df = orden_por_fila(df)

        # --- Velocidad de ACEPTACIÓN: días entre FechaEnvio y FechaAceptacion ---
        #
        # **Esto NO es la velocidad de pago, y llamarlo así fue un error que
        # llegó hasta la landing.** `FechaEnvio → FechaAceptacion` es lo que
        # tarda el PROVEEDOR en aceptar la orden, no lo que tarda el comprador
        # en pagarla. Se nota en el dato: la mediana global es de 1,4 días y el
        # máximo de 12,8 — nadie en el Estado paga a día y medio.
        #
        # **La fecha de pago no existe en el dato de ChileCompra.** Las únicas
        # fechas del archivo de órdenes son creación, envío, aceptación,
        # cancelación y última modificación. Y `Forma de Pago` no sirve de
        # sustituto: el 98,7 % de las órdenes dice «30 días contra la recepción
        # conforme», así que no distingue entre compradores.
        #
        # Lo que sí mide esto es útil y hay que venderlo por lo que es: una
        # orden que tarda en aceptarse es una orden con fricción administrativa.
        if "FechaEnvio" in df.columns and "FechaAceptacion" in df.columns:
            pay = (
                df.filter(
                    (pl.col("FechaEnvio").str.len_chars() >= 10)
                    & (pl.col("FechaAceptacion").str.len_chars() >= 10)
                    & (pl.col("FechaEnvio") != "NA")
                    & (pl.col("FechaAceptacion") != "NA")
                )
                .with_columns(
                    [
                        pl.col("FechaEnvio")
                        .str.slice(0, 10)
                        .str.to_date("%Y-%m-%d", strict=False)
                        .alias("dt_envio"),
                        pl.col("FechaAceptacion")
                        .str.slice(0, 10)
                        .str.to_date("%Y-%m-%d", strict=False)
                        .alias("dt_aceptacion"),
                    ]
                )
                .filter(pl.col("dt_envio").is_not_null() & pl.col("dt_aceptacion").is_not_null())
                .with_columns(
                    [
                        (pl.col("dt_aceptacion") - pl.col("dt_envio"))
                        .dt.total_days()
                        .alias("dias_aceptacion"),
                    ]
                )
                .filter((pl.col("dias_aceptacion") >= 0) & (pl.col("dias_aceptacion") <= 365))
                .group_by(org_col)
                .agg(
                    [
                        pl.col("dias_aceptacion").median().alias("mediana_dias_aceptacion"),
                        pl.col("dias_aceptacion").quantile(0.75).alias("p75_dias_aceptacion"),
                        pl.col("dias_aceptacion").quantile(0.90).alias("p90_dias_aceptacion"),
                        pl.col("dias_aceptacion").mean().alias("promedio_dias_aceptacion"),
                        pl.len().alias("n_con_fecha_aceptacion"),
                    ]
                )
            )
            payment_frames.append(pay)

        # --- Estados: aceptación y cancelación ---
        if "Estado" in df.columns:
            estados = (
                df.filter(pl.col(org_col).is_not_null())
                .with_columns(
                    [
                        pl.col("Estado").str.to_lowercase().alias("estado_lower"),
                    ]
                )
                .group_by(org_col)
                .agg(
                    [
                        pl.len().alias("n_oc_estado"),
                        (pl.col("estado_lower").str.contains("recepcion conforme|aceptada"))
                        .sum()
                        .alias("n_aceptadas"),
                        (pl.col("estado_lower").str.contains("cancel")).sum().alias("n_canceladas"),
                        (pl.col("estado_lower").str.contains("enviada|proceso|nueva"))
                        .sum()
                        .alias("n_pendientes"),
                    ]
                )
            )
            status_frames.append(estados)

        # --- Volumen mensual (para regularidad) ---
        if "_periodo_archivo" in df.columns:
            vol = (
                df.filter(pl.col(org_col).is_not_null())
                .group_by([org_col, "_periodo_archivo"])
                .agg(pl.len().alias("oc_mes"))
            )
            volume_frames.append(vol)

        # --- Calificación de proveedores ---
        if "PromedioCalificacion" in df.columns:
            rat = (
                df.filter(
                    pl.col("PromedioCalificacion").is_not_null()
                    & (pl.col("PromedioCalificacion") != "0")
                    & (pl.col("PromedioCalificacion") != "null")
                )
                .with_columns(
                    [
                        pl.col("PromedioCalificacion")
                        .str.replace(",", ".")
                        .cast(pl.Float64, strict=False)
                        .alias("calif"),
                    ]
                )
                .filter(pl.col("calif").is_not_null() & (pl.col("calif") > 0))
                .group_by(org_col)
                .agg(
                    [
                        pl.col("calif").mean().alias("prom_calificacion"),
                        pl.len().alias("n_calificaciones"),
                    ]
                )
            )
            rating_frames.append(rat)

    # ─── Combinar y re-agregar ───

    org_col = "CodigoOrganismoPublico"

    # Velocidad de pago
    if payment_frames:
        payments = pl.concat(payment_frames, how="diagonal_relaxed")
        payments = (
            payments.group_by(org_col)
            .agg(
                [
                    (pl.col("mediana_dias_aceptacion") * pl.col("n_con_fecha_aceptacion"))
                    .sum()
                    .alias("_wt_med"),
                    (pl.col("p75_dias_aceptacion") * pl.col("n_con_fecha_aceptacion"))
                    .sum()
                    .alias("_wt_p75"),
                    (pl.col("p90_dias_aceptacion") * pl.col("n_con_fecha_aceptacion"))
                    .sum()
                    .alias("_wt_p90"),
                    (pl.col("promedio_dias_aceptacion") * pl.col("n_con_fecha_aceptacion"))
                    .sum()
                    .alias("_wt_avg"),
                    pl.col("n_con_fecha_aceptacion").sum(),
                ]
            )
            .with_columns(
                [
                    (pl.col("_wt_med") / pl.col("n_con_fecha_aceptacion")).alias(
                        "mediana_dias_aceptacion"
                    ),
                    (pl.col("_wt_p75") / pl.col("n_con_fecha_aceptacion")).alias(
                        "p75_dias_aceptacion"
                    ),
                    (pl.col("_wt_p90") / pl.col("n_con_fecha_aceptacion")).alias(
                        "p90_dias_aceptacion"
                    ),
                    (pl.col("_wt_avg") / pl.col("n_con_fecha_aceptacion")).alias(
                        "promedio_dias_aceptacion"
                    ),
                ]
            )
            .select(
                [
                    org_col,
                    "mediana_dias_aceptacion",
                    "p75_dias_aceptacion",
                    "p90_dias_aceptacion",
                    "promedio_dias_aceptacion",
                    "n_con_fecha_aceptacion",
                ]
            )
        )
    else:
        payments = pl.DataFrame({org_col: [], "mediana_dias_aceptacion": []})

    # Estados
    if status_frames:
        statuses = pl.concat(status_frames, how="diagonal_relaxed")
        statuses = (
            statuses.group_by(org_col)
            .agg(
                [
                    pl.col("n_oc_estado").sum(),
                    pl.col("n_aceptadas").sum(),
                    pl.col("n_canceladas").sum(),
                    pl.col("n_pendientes").sum(),
                ]
            )
            .with_columns(
                [
                    (pl.col("n_aceptadas") / pl.col("n_oc_estado")).alias("tasa_aceptacion"),
                    (pl.col("n_canceladas") / pl.col("n_oc_estado")).alias("tasa_cancelacion"),
                ]
            )
        )
    else:
        statuses = pl.DataFrame({org_col: []})

    # Regularidad mensual
    if volume_frames:
        volumes = pl.concat(volume_frames, how="diagonal_relaxed")
        volumes = volumes.group_by([org_col, "_periodo_archivo"]).agg(pl.col("oc_mes").sum())
        regularity = (
            volumes.group_by(org_col)
            .agg(
                [
                    pl.col("oc_mes").sum().alias("n_oc_total"),
                    pl.col("oc_mes").mean().alias("promedio_oc_mes"),
                    pl.col("oc_mes").std().alias("std_oc_mes"),
                    pl.col("_periodo_archivo").n_unique().alias("n_meses_activo"),
                ]
            )
            .with_columns(
                [
                    (pl.col("std_oc_mes") / pl.col("promedio_oc_mes").clip(lower_bound=0.01)).alias(
                        "cv_mensual"
                    ),
                ]
            )
        )
    else:
        regularity = pl.DataFrame({org_col: []})

    # Calificaciones
    if rating_frames:
        ratings = pl.concat(rating_frames, how="diagonal_relaxed")
        ratings = (
            ratings.group_by(org_col)
            .agg(
                [
                    (pl.col("prom_calificacion") * pl.col("n_calificaciones"))
                    .sum()
                    .alias("_wt_calif"),
                    pl.col("n_calificaciones").sum(),
                ]
            )
            .with_columns(
                [
                    (pl.col("_wt_calif") / pl.col("n_calificaciones")).alias("prom_calificacion"),
                ]
            )
            .select([org_col, "prom_calificacion", "n_calificaciones"])
        )
    else:
        ratings = pl.DataFrame({org_col: []})

    # ─── Join todo ───

    # Usar regularity como base (tiene n_oc_total)
    result = (
        regularity.join(payments, on=org_col, how="left")
        .join(statuses, on=org_col, how="left")
        .join(ratings, on=org_col, how="left")
    )

    logger.info(f"Métricas OC: {len(result):,} organismos")
    return result


# ─────────────────────────────────────────────────────────────────────
# Paso 2: Métricas de Licitaciones por comprador
# ─────────────────────────────────────────────────────────────────────


def build_lic_buyer_metrics() -> pl.DataFrame:
    """
    Agrega métricas de licitaciones por organismo:
    - Tasa de adjudicación (vs revocadas/desiertas)
    - Promedio de oferentes (proxy de competitividad)
    - Tasa de reclamos
    """
    logger.info("Calculando métricas de LIC por comprador...")

    cols_needed = [
        "CodigoExterno",
        "CodigoOrganismo",
        "NombreOrganismo",
        "Estado",
        "NumeroOferentes",
        "CantidadReclamos",
        "CodigoTipo",
    ]
    org_col = "CodigoOrganismo"

    frames = []
    vistas: set[str] = set()

    for periodo, df in iter_lic_parquets(columns=cols_needed):
        if org_col not in df.columns or "Estado" not in df.columns or "CodigoExterno" not in df:
            continue

        # **Una fila por LICITACIÓN, no por línea ni por oferta.** El archivo trae
        # una fila por cada (línea, oferta), y contar filas ponderaba cada
        # licitación por su número de líneas × ofertas: medido en 42 meses, la
        # tasa de adjudicación salía 93,2 % por filas y es 84,2 % por
        # licitaciones (las grandes, con muchas líneas, se adjudican más). Igual
        # que `buyer_transparency`: la primera fila de cada licitación, y la
        # primera vez que aparece.
        lics = (
            df.filter(
                pl.col("CodigoExterno").is_not_null()
                & (pl.col("CodigoExterno") != "null")
                & pl.col(org_col).is_not_null()
                & (pl.col(org_col) != "null")
            )
            .group_by("CodigoExterno")
            .agg(
                pl.col(org_col).first(),
                pl.col("NombreOrganismo").first(),
                pl.col("Estado").str.to_lowercase().first().alias("estado_lower"),
                pl.col("NumeroOferentes").first().alias("n_oferentes"),
                pl.col("CantidadReclamos").first().alias("n_reclamos"),
                (pl.col("CodigoTipo").first() == "TD").cast(pl.Int8).alias("es_td"),
            )
            .with_columns(pl.lit(periodo).alias("_periodo_archivo"))
        )
        if vistas:
            lics = lics.filter(~pl.col("CodigoExterno").is_in(list(vistas)))
        vistas.update(lics["CodigoExterno"].to_list())
        frames.append(lics)

    if not frames:
        return pl.DataFrame()

    # La clave es el CÓDIGO. Con `NombreOrganismo` dentro, un comprador
    # renombrado salía con DOS filas de score —medido: 111 de 1.192— y
    # `get_comprador` se quedaba con la primera que llegara. Ver `identidad.py`.
    result = (
        pl.concat(frames, how="diagonal_relaxed")
        .group_by(org_col)
        .agg(
            [
                pl.len().alias("n_lic"),
                nombre_vigente("NombreOrganismo"),
                pl.col("estado_lower").str.contains("adjudicada").sum().alias("n_adjudicadas"),
                pl.col("estado_lower").str.contains("revocada").sum().alias("n_revocadas"),
                pl.col("estado_lower").str.contains("desierta").sum().alias("n_desiertas"),
                pl.col("n_oferentes").mean().alias("prom_oferentes"),
                pl.col("n_reclamos").mean().alias("prom_reclamos"),
                pl.col("es_td").sum().alias("n_trato_directo"),
            ]
        )
        .with_columns(
            [
                (
                    pl.col("n_adjudicadas")
                    / (
                        pl.col("n_adjudicadas") + pl.col("n_revocadas") + pl.col("n_desiertas")
                    ).clip(lower_bound=1)
                ).alias("tasa_adjudicacion"),
                (pl.col("n_trato_directo") / pl.col("n_lic").clip(lower_bound=1)).alias(
                    "pct_trato_directo"
                ),
            ]
        )
        .select(
            [
                org_col,
                "NombreOrganismo",
                "n_lic",
                "tasa_adjudicacion",
                "n_revocadas",
                "n_desiertas",
                "prom_oferentes",
                "prom_reclamos",
                "pct_trato_directo",
            ]
        )
    )

    logger.info(f"Métricas LIC: {len(result):,} organismos")
    return result


# ─────────────────────────────────────────────────────────────────────
# Paso 3: Calcular scores
# ─────────────────────────────────────────────────────────────────────


def compute_buyer_scores(oc_metrics: pl.DataFrame, lic_metrics: pl.DataFrame) -> pl.DataFrame:
    """
    Combina métricas OC y LIC en un score 0–1 por organismo.

    Fórmulas:
      score_transparencia = 1 - clamp(pct_trato_directo / 0.40, 0, 1)
      score_aceptacion    = clamp((tasa_aceptacion - 0.50) / 0.50, 0, 1)
      score_no_cancel     = 1 - clamp(tasa_cancelacion / 0.20, 0, 1)
      score_adjudicacion  = clamp((tasa_adjudicacion - 0.50) / 0.50, 0, 1)
      score_regularidad   = 1 - clamp(cv_mensual / 1.50, 0, 1)
      score_volumen       = clamp(log(n_oc_total) / log(max_oc), 0, 1)
      score_satisfaccion  = clamp(prom_calificacion / 5.0, 0, 1)

      score_final = Σ(score_i × peso_i)
    """
    logger.info("Calculando scores de compradores...")

    # Join OC con LIC (matching por código organismo)
    combined = oc_metrics.join(
        lic_metrics,
        left_on="CodigoOrganismoPublico",
        right_on="CodigoOrganismo",
        how="left",
    )

    # Filtrar organismos con al menos 10 OC
    combined = combined.filter(pl.col("n_oc_total") >= 10)

    max_log_oc = combined["n_oc_total"].log().max() or 1.0

    scored = combined.with_columns(
        [
            # --- Transparencia: 0=compra todo por TD (40%+), 1=0% TD ---
            (1 - (pl.col("pct_trato_directo").fill_null(0.20) / 0.40).clip(0, 1))
            .round(4)
            .alias("score_transparencia"),
            # --- Tasa de aceptación: 0=50% o menos, 1=100% ---
            ((pl.col("tasa_aceptacion").fill_null(0.7) - 0.5) / 0.5)
            .clip(0, 1)
            .round(4)
            .alias("score_tasa_aceptacion"),
            # --- Tasa de NO cancelación: 0=20%+ cancelaciones, 1=0% ---
            (1 - (pl.col("tasa_cancelacion").fill_null(0.05) / 0.20).clip(0, 1))
            .round(4)
            .alias("score_tasa_no_cancelacion"),
            # --- Adjudicación LIC: 0=50% o menos, 1=100% ---
            ((pl.col("tasa_adjudicacion").fill_null(0.7) - 0.5) / 0.5)
            .clip(0, 1)
            .round(4)
            .alias("score_tasa_adjudicacion"),
            # --- Regularidad: 0=CV>1.5, 1=CV≈0 ---
            (1 - (pl.col("cv_mensual").fill_null(0.75) / 1.5).clip(0, 1))
            .round(4)
            .alias("score_regularidad"),
            # --- Volumen: normalizado por log ---
            (pl.col("n_oc_total").log() / max_log_oc).clip(0, 1).round(4).alias("score_volumen"),
            # --- Satisfacción: calificación / 5 ---
            (pl.col("prom_calificacion").fill_null(2.5) / 5.0)
            .clip(0, 1)
            .round(4)
            .alias("score_satisfaccion"),
        ]
    )

    # Score final ponderado
    scored = scored.with_columns(
        [
            (
                pl.col("score_transparencia") * WEIGHTS["transparencia"]
                + pl.col("score_tasa_aceptacion") * WEIGHTS["tasa_aceptacion"]
                + pl.col("score_tasa_no_cancelacion") * WEIGHTS["tasa_no_cancelacion"]
                + pl.col("score_tasa_adjudicacion") * WEIGHTS["tasa_adjudicacion"]
                + pl.col("score_regularidad") * WEIGHTS["regularidad"]
                + pl.col("score_volumen") * WEIGHTS["volumen"]
                + pl.col("score_satisfaccion") * WEIGHTS["satisfaccion"]
            )
            .round(4)
            .alias("buyer_score"),
        ]
    )

    # Clasificación
    scored = scored.with_columns(
        [
            pl.when(pl.col("buyer_score") >= 0.8)
            .then(pl.lit("excelente"))
            .when(pl.col("buyer_score") >= 0.6)
            .then(pl.lit("bueno"))
            .when(pl.col("buyer_score") >= 0.4)
            .then(pl.lit("regular"))
            .when(pl.col("buyer_score") >= 0.2)
            .then(pl.lit("riesgoso"))
            .otherwise(pl.lit("alto_riesgo"))
            .alias("clasificacion"),
        ]
    )

    result = scored.select(
        [
            "CodigoOrganismoPublico",
            "NombreOrganismo",
            "buyer_score",
            "clasificacion",
            "n_oc_total",
            "n_meses_activo",
            # Desglose de scores
            "score_transparencia",
            "score_tasa_aceptacion",
            "score_tasa_no_cancelacion",
            "score_tasa_adjudicacion",
            "score_regularidad",
            "score_volumen",
            "score_satisfaccion",
            # Métricas raw
            "pct_trato_directo",
            "mediana_dias_aceptacion",
            "p75_dias_aceptacion",
            "p90_dias_aceptacion",
            "tasa_aceptacion",
            "tasa_cancelacion",
            "tasa_adjudicacion",
            "cv_mensual",
            "prom_calificacion",
            "prom_oferentes",
        ]
    ).sort("buyer_score", descending=True)

    # Log distribución
    for cat in ["excelente", "bueno", "regular", "riesgoso", "alto_riesgo"]:
        n = scored.filter(pl.col("clasificacion") == cat).shape[0]
        logger.info(f"  {cat}: {n:,} organismos")

    logger.info(f"Score promedio: {result['buyer_score'].mean():.3f}")

    return result


# ─────────────────────────────────────────────────────────────────────
# Paso 4: Flags de riesgo
# ─────────────────────────────────────────────────────────────────────


def compute_risk_flags(buyer_scores: pl.DataFrame) -> pl.DataFrame:
    """
    Genera alertas de riesgo específicas por comprador.
    Cada flag es un motivo concreto de precaución.
    """
    logger.info("Generando flags de riesgo...")

    flags = buyer_scores.with_columns(
        [
            # Aceptación lenta.
            #
            # **Los umbrales de antes eran 30 y 60 días, y no podían dispararse
            # nunca.** Estaban calibrados para «días de pago»; sobre días de
            # aceptación la mediana global es 1,4 y el máximo 12,8, así que las
            # dos banderas estaban muertas desde que existen.
            #
            # Ahora salen de la distribución real: `> UMBRAL_ACEPTACION_LENTA`
            # es el percentil 99 de la mediana por comprador (19 de 1.222), y
            # `> UMBRAL_ACEPTACION_ERRATICA` el percentil 90 del p90 (204 de
            # 1.222). Una bandera que marca al 90 % de los compradores no avisa
            # de nada; una que no marca a ninguno, tampoco.
            (pl.col("mediana_dias_aceptacion") > UMBRAL_ACEPTACION_LENTA)
            .fill_null(False)
            .alias("flag_aceptacion_lenta"),
            (pl.col("p90_dias_aceptacion") > UMBRAL_ACEPTACION_ERRATICA)
            .fill_null(False)
            .alias("flag_aceptacion_impredecible"),
            # Alta tasa de cancelación (> 5%)
            (pl.col("tasa_cancelacion") > 0.05).fill_null(False).alias("flag_cancelaciones"),
            # Baja tasa de adjudicación en licitaciones (< 70%)
            (pl.col("tasa_adjudicacion") < 0.70)
            .fill_null(False)
            .alias("flag_licitaciones_fallidas"),
            # Baja calificación (< 3.0 en escala 1-5)
            (pl.col("prom_calificacion") < 3.0).fill_null(False).alias("flag_baja_calificacion"),
            # Compras irregulares (CV > 1.0)
            (pl.col("cv_mensual") > 1.0).fill_null(False).alias("flag_compras_irregulares"),
        ]
    )

    # Contar flags activos
    flag_cols = [c for c in flags.columns if c.startswith("flag_")]
    flags = flags.with_columns(
        [
            sum(pl.col(c).cast(pl.Int32) for c in flag_cols).alias("n_flags"),
        ]
    )

    # Solo organismos con al menos un flag
    flagged = (
        flags.filter(pl.col("n_flags") > 0)
        .select(
            [
                "CodigoOrganismoPublico",
                "NombreOrganismo",
                "buyer_score",
                "clasificacion",
                "n_flags",
            ]
            + flag_cols
            + [
                "mediana_dias_aceptacion",
                "tasa_cancelacion",
                "tasa_adjudicacion",
                "prom_calificacion",
                "cv_mensual",
            ]
        )
        .sort("n_flags", descending=True)
    )

    logger.info(f"Organismos con flags de riesgo: {len(flagged):,} / {len(buyer_scores):,}")
    for fc in flag_cols:
        n = flagged.filter(pl.col(fc)).shape[0]
        logger.info(f"  {fc}: {n:,}")

    return flagged


# ─────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────


def run_buyer_scoring() -> dict[str, pl.DataFrame]:
    """Ejecuta pipeline completo de scoring de compradores."""
    logger.info("=" * 60)
    logger.info("SCORING DE COMPRADORES")
    logger.info("=" * 60)

    oc_metrics = build_oc_buyer_metrics()
    lic_metrics = build_lic_buyer_metrics()

    # Guardar métricas detalladas
    stats_path = OUTPUT_DIR / "buyer_payment_stats.parquet"
    oc_metrics.write_parquet(stats_path, compression="snappy")
    logger.info(f"Guardado: {stats_path.name} ({stats_path.stat().st_size / 1024 / 1024:.1f} MB)")

    # Scores
    scores = compute_buyer_scores(oc_metrics, lic_metrics)
    scores_path = OUTPUT_DIR / "buyer_scores.parquet"
    scores.write_parquet(scores_path, compression="snappy")
    logger.info(f"Guardado: {scores_path.name} ({scores_path.stat().st_size / 1024 / 1024:.1f} MB)")

    # Risk flags
    risk = compute_risk_flags(scores)
    risk_path = OUTPUT_DIR / "buyer_risk_flags.parquet"
    risk.write_parquet(risk_path, compression="snappy")
    logger.info(f"Guardado: {risk_path.name}")

    # Top 10 mejores y peores
    logger.info("\nTop 10 mejores compradores:")
    for row in scores.head(10).iter_rows(named=True):
        logger.info(
            f"  [{row['buyer_score']:.3f}] {row['NombreOrganismo']} "
            f"(pago: {row['mediana_dias_aceptacion']:.0f}d, OC: {row['n_oc_total']:,})"
        )

    logger.info("\nTop 10 peores compradores (con >50 OC):")
    worst = scores.filter(pl.col("n_oc_total") > 50).sort("buyer_score").head(10)
    for row in worst.iter_rows(named=True):
        logger.info(
            f"  [{row['buyer_score']:.3f}] {row['NombreOrganismo']} "
            f"(pago: {row['mediana_dias_aceptacion']:.0f}d, cancel: {row['tasa_cancelacion']:.1%})"
        )

    return {"scores": scores, "risk": risk, "oc_metrics": oc_metrics}
