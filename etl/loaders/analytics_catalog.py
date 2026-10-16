"""Catálogo de tablas de analytics: qué parquet va a qué tabla y con qué índices.

Los índices **no son intuición**: salen de leer por dónde filtra realmente cada
función de `backend/app/services/bi_service.py`. Un índice que nadie usa sólo
hace más lenta la carga y ocupa disco.

Convención de nombres: el parquet sin extensión, en minúsculas.
`product_price_bands_L1.parquet` → `analytics.product_price_bands_l1`.

Los nombres de columna se conservan tal cual vienen del parquet, en camelCase y
con sus rarezas históricas (`NombreroductoGenerico`, con una P perdida), para
que el código de la API no tenga que traducir.

Si el pipeline deja de generar un parquet o le cambia las columnas, la carga lo
registra y sigue: no tumba la corrida entera.
"""

from __future__ import annotations

from etl.loaders.analytics_loader import TablaAnalytics

# Cada entrada: qué lee la API de ahí y por dónde filtra.
CATALOGO: list[TablaAnalytics] = [
    # ── Bandas de precio ─────────────────────────────────────────────────────
    # get_precio_producto: producto + organismo + unidad, con fallback
    # L0→L0N→L1→L2→L3.
    #
    # L0 y L0N son las únicas bandas donde el grupo contiene el MISMO producto:
    # agrupan por la firma de `EspecificacionComprador` en vez de por la
    # categoría UNSPSC. Se consultan por `codigoProductoONU` igual que las demás
    # —la columna va en la tabla aunque no sea la clave— para que el endpoint no
    # tenga que saber que existen dos formas de identificar un producto.
    TablaAnalytics(
        tabla="product_price_bands_l0",
        parquet="product_price_bands_L0.parquet",
        indices=[
            ["codigoProductoONU", "CodigoOrganismoPublico", "UnidadMedida"],
            ["firma_producto", "CodigoOrganismoPublico"],
        ],
    ),
    # La lee también la página pública de producto: `compradores` y
    # `cuota_mayor` deciden si la banda es un precio de mercado
    # (backend/app/services/publico/indexables.py).
    TablaAnalytics(
        tabla="product_price_bands_l0n",
        parquet="product_price_bands_L0N.parquet",
        indices=[["codigoProductoONU", "UnidadMedida"], ["firma_producto"]],
        comentarios={
            "compradores": (
                "Organismos compradores distintos entre las compras de la banda (ya sin "
                "atípicos: las mismas filas que dan n)."
            ),
            "cuota_mayor": (
                "Fracción de las compras de la banda (0–1) que hizo el organismo que más "
                "compró. Con 1 comprador vale 1: la banda es el precio de su contrato."
            ),
        },
    ),
    TablaAnalytics(
        tabla="product_price_bands_l1",
        parquet="product_price_bands_L1.parquet",
        indices=[["codigoProductoONU", "CodigoOrganismoPublico", "UnidadMedida"]],
    ),
    TablaAnalytics(
        tabla="product_price_bands_l2",
        parquet="product_price_bands_L2.parquet",
        indices=[["codigoProductoONU", "sector", "UnidadMedida"]],
    ),
    TablaAnalytics(
        tabla="product_price_bands_l3",
        parquet="product_price_bands_L3.parquet",
        # get_productos además busca por subcadena en el nombre; ese índice es
        # GIN con pg_trgm y se crea en la migración, no aquí.
        indices=[["codigoProductoONU", "UnidadMedida"]],
    ),
    TablaAnalytics(
        tabla="price_bands",
        parquet="price_bands.parquet",
        indices=[["CodigoOrganismoPublico", "RubroN2"]],
    ),
    # ── Competencia ──────────────────────────────────────────────────────────
    TablaAnalytics(
        tabla="competitors_by_market",
        parquet="competitors_by_market.parquet",
        indices=[["CodigoOrganismoPublico", "RubroN2"], ["RubroN2"]],
    ),
    TablaAnalytics(
        tabla="market_concentration",
        parquet="market_concentration.parquet",
        indices=[["CodigoOrganismoPublico", "RubroN2"], ["RubroN2"]],
    ),
    # OJO: el pipeline NO genera competitor_analysis.parquet — ningún módulo de
    # analytics lo escribe. Pero bi_service.get_mi_posicion lo lee, así que esa
    # función siempre ha operado sin esa fuente. Se deja declarado para que
    # materialice solo el día que el pipeline empiece a producirlo.
    TablaAnalytics(
        tabla="competitor_analysis",
        parquet="competitor_analysis.parquet",
        indices=[["CodigoProveedor"], ["RubroN2"]],
    ),
    # get_forecast_competidores: L1 organismo+rubro+tipo, L2 rubro+tipo, L3 tipo.
    TablaAnalytics(
        tabla="competitor_forecast_l1",
        parquet="competitor_forecast_l1.parquet",
        indices=[["CodigoOrganismo", "Rubro2", "CodigoTipo"]],
    ),
    TablaAnalytics(
        tabla="competitor_forecast_l2",
        parquet="competitor_forecast_l2.parquet",
        indices=[["Rubro2", "CodigoTipo"]],
    ),
    TablaAnalytics(
        tabla="competitor_forecast_l3",
        parquet="competitor_forecast_l3.parquet",
        indices=[["CodigoTipo"]],
    ),
    # ── Compradores ──────────────────────────────────────────────────────────
    TablaAnalytics(
        tabla="buyer_scores",
        parquet="buyer_scores.parquet",
        # Sin RubroN2: verificado contra los datos reales, el score es por
        # organismo, no por organismo×rubro.
        indices=[["CodigoOrganismoPublico"]],
    ),
    TablaAnalytics(
        tabla="buyer_risk_flags",
        parquet="buyer_risk_flags.parquet",
        indices=[["CodigoOrganismoPublico"]],
    ),
    TablaAnalytics(
        tabla="buyer_payment_stats",
        parquet="buyer_payment_stats.parquet",
        indices=[["CodigoOrganismoPublico"]],
    ),
    TablaAnalytics(
        tabla="buyer_transparency",
        parquet="buyer_transparency.parquet",
        # Ojo: aquí la columna es CodigoOrganismo, sin "Publico" — a diferencia
        # del resto de las tablas. Verificado contra los datos reales.
        indices=[["CodigoOrganismo"]],
    ),
    # ── Oportunidades, tendencia, estacionalidad ─────────────────────────────
    TablaAnalytics(
        tabla="opportunity_scores",
        parquet="opportunity_scores.parquet",
        indices=[["CodigoOrganismoPublico", "RubroN2"], ["RubroN2"]],
    ),
    TablaAnalytics(
        tabla="seasonality_patterns",
        parquet="seasonality_patterns.parquet",
        indices=[["CodigoOrganismoPublico", "RubroN2"], ["RubroN2"]],
    ),
    TablaAnalytics(
        tabla="trend_by_market",
        parquet="trend_by_market.parquet",
        indices=[["RubroN2"]],
    ),
    TablaAnalytics(
        tabla="emerging_markets",
        parquet="emerging_markets.parquet",
        indices=[["RubroN2"]],
    ),
    TablaAnalytics(
        tabla="time_series",
        parquet="time_series.parquet",
        indices=[["RubroN2", "anio"]],
    ),
    # ── Ventana de preparación, descuento, diversificación, sector ───────────
    TablaAnalytics(
        tabla="window_classified",
        parquet="window_classified.parquet",
        indices=[["CodigoExterno"]],
    ),
    TablaAnalytics(
        tabla="discount_by_context",
        parquet="discount_by_context.parquet",
        indices=[["CodigoTipo", "Rubro2", "n_oferentes_rango"]],
    ),
    TablaAnalytics(
        tabla="provider_diversification",
        parquet="provider_diversification.parquet",
        indices=[["CodigoProveedor"]],
    ),
    TablaAnalytics(
        tabla="sector_dashboard",
        parquet="sector_dashboard.parquet",
        indices=[["sector"]],
        comentarios={
            "ventana_desde": (
                "Primer día de la ventana (36 meses anclados en el último mes con datos)."
            ),
            "ventana_hasta": "Último día de la ventana (no pasa de hoy).",
        },
    ),
    # ── Compra Ágil ──────────────────────────────────────────────────────────
    # Compras Ágiles publicadas y adjudicadas por comprador y mes (spec del
    # pivote §6.2): se consulta por comprador, y el mes acota la ventana. Las
    # lee la ficha pública del comprador (vía `compra_agil_comprador.publicadas`),
    # no el puntaje de «lo mejor de hoy».
    #
    # `adjudicadas / publicadas` NO es una tasa: son dos conteos de cosas
    # distintas, en meses que no se corresponden (la orden sale días después de
    # publicar). Ver el comentario de cada columna y etl/analytics/compra_agil_mensual.py.
    TablaAnalytics(
        tabla="compra_agil_mensual",
        parquet="compra_agil_mensual.parquet",
        indices=[["CodigoOrganismoPublico", "mes"]],
        comentarios={
            "publicadas": (
                "Compras Ágiles PUBLICADAS por el comprador ese mes (fecha de publicación, "
                "hora de Chile), según lo ingerido por el ETL. Se acumula semana a semana: "
                "nulo = mes anterior al despliegue, sin dato. No es el denominador de una tasa."
            ),
            "adjudicadas": (
                "ÓRDENES DE COMPRA de Compra Ágil vigentes emitidas ese mes (FechaCreacion "
                "de la OC), de la descarga masiva. Cuenta órdenes, no solicitudes; medido: "
                "1 Compra Ágil → 1 orden en el 99,996 % de los casos enlazables. El mes es "
                "el de la orden, no el de la publicación: adjudicadas/publicadas NO es una tasa."
            ),
        },
    ),
    # La historia del ORGANISMO comprador (paso 9). Hoy sólo la leen la ficha
    # pública (`/publico/compradores/{codigo}`) y el filtro `codigo_organismo` de
    # «lo mejor de hoy», que traduce RUT → código con `comprador_rut`; el puntaje
    # lee `compra_agil_unidad`. Ver etl/analytics/compra_agil_comprador.py.
    TablaAnalytics(
        tabla="compra_agil_comprador",
        parquet="compra_agil_comprador.parquet",
        indices=[["CodigoOrganismoPublico"]],
        comentarios={
            "CodigoOrganismoPublico": "Comprador (código de Mercado Público). Una fila por comprador.",
            "ordenes": (
                "ÓRDENES DE COMPRA de Compra Ágil vigentes (sin canceladas) en la ventana. "
                "Equivale a Compras Ágiles adjudicadas: 1 → 1 en el 99,996 % de los casos enlazables."
            ),
            "publicadas": (
                "Suma de compra_agil_mensual.publicadas en la ventana. Nula = sin dato, no cero. "
                "ordenes/publicadas es una aproximación: la orden sale días después de publicar."
            ),
            "proveedores_distintos": (
                "Proveedores distintos que ganaron alguna orden en la ventana. Las personas "
                "naturales se cuentan por seudónimo; ningún proveedor se nombra."
            ),
            "cuota_lider_pct": "% de las órdenes que se llevó el proveedor que más ganó (0–100).",
            "monto_p25": "Percentil 25 del monto TOTAL por orden, en CLP (una vez por orden, no por línea).",
            "monto_mediana": "Mediana del monto TOTAL por orden, en CLP (una vez por orden, no por línea).",
            "monto_p75": "Percentil 75 del monto TOTAL por orden, en CLP (una vez por orden, no por línea).",
            "ventana_desde": "Primer día de la ventana (6 meses anclados en el último mes con datos).",
            "ventana_hasta": "Último día de la ventana.",
        },
    ),
    TablaAnalytics(
        tabla="comprador_rut",
        parquet="comprador_rut.parquet",
        indices=[["rut"]],
        comentarios={
            "rut": (
                "RUT del comprador sin puntos, guion ni ceros a la izquierda, K mayúscula. Así identifica al "
                "comprador la Compra Ágil ingerida (licitaciones.rut_organismo)."
            ),
            "CodigoOrganismoPublico": (
                "Código de comprador más frecuente para ese RUT en las órdenes de Compra "
                "Ágil de la ventana. Traduce RUT → código para unir con la analítica. "
                "Sólo para el filtro por comprador: el puntaje une por RUT con compra_agil_unidad."
            ),
        },
    ),
    # «Lo mejor de hoy» (rediseño 0a): la historia de la UNIDAD que publica cada
    # Compra Ágil, por su RUT. Es lo que puntúa; `compra_agil_comprador` (por
    # organismo) queda para la ficha pública del comprador.
    TablaAnalytics(
        tabla="compra_agil_unidad",
        parquet="compra_agil_unidad.parquet",
        # Sin índice: son ~2.000 filas y la API las lee enteras (DISTINCT ON sobre
        # el RUT sin ceros), así que un índice sobre `rut` no lo usaba ninguna consulta.
        indices=[],
        comentarios={
            "rut": (
                "RUT de la UNIDAD de compra (RutUnidadCompra) sin puntos, guion ni ceros a "
                "la izquierda, K mayúscula. Así la identifica la Compra Ágil ingerida "
                "(licitaciones.rut_organismo). Una fila por RUT; sólo unidades con al menos "
                "una orden en la ventana."
            ),
            "ordenes": "ÓRDENES DE COMPRA de Compra Ágil vigentes (sin canceladas) de la unidad en la ventana.",
            "proveedores_distintos": (
                "Proveedores distintos que ganaron alguna orden de la unidad. Las personas "
                "naturales se cuentan por seudónimo; ningún proveedor se nombra."
            ),
            "cuota_lider_pct": "% de las órdenes de la unidad que se llevó el proveedor que más ganó (0–100).",
            "monto_p25": "Percentil 25 del monto TOTAL por orden, en CLP (una vez por orden, no por línea).",
            "monto_mediana": "Mediana del monto TOTAL por orden, en CLP (una vez por orden, no por línea).",
            "monto_p75": "Percentil 75 del monto TOTAL por orden, en CLP (una vez por orden, no por línea).",
            "percentil_ordenes": (
                "Qué parte de las unidades con órdenes de Compra Ágil emitió MENOS en la ventana "
                "(percent_rank, 0–1). Mide cuánto compra, no si adjudica lo que publica. Una "
                "unidad que no figura en la tabla (sin órdenes) vale 0 para la API."
            ),
            "ventana_desde": "Primer día de la ventana (6 meses anclados en el último mes con datos).",
            "ventana_hasta": "Último día de la ventana.",
        },
    ),
]

POR_TABLA: dict[str, TablaAnalytics] = {t.tabla: t for t in CATALOGO}
POR_PARQUET: dict[str, TablaAnalytics] = {t.parquet: t for t in CATALOGO}
