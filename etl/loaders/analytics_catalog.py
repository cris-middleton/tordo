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
    # get_precio_producto: producto + organismo + unidad, con fallback L1→L2→L3.
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
    ),
]

POR_TABLA: dict[str, TablaAnalytics] = {t.tabla: t for t in CATALOGO}
POR_PARQUET: dict[str, TablaAnalytics] = {t.parquet: t for t in CATALOGO}
