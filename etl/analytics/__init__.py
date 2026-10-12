"""
TORDO Analytics Module

Análisis ML e inteligencia sobre datos históricos de ChileCompra
(103M+ órdenes de compra, 100M+ licitaciones desde 2007).

Módulos:
  - seasonality:        Detección de estacionalidad
  - price_benchmarking: Bandas de precio por (organismo, rubro)
  - competitor_analysis: Mapeo de competidores, market share, win rates
  - tfidf_matcher:      Matching TF-IDF; modelo de referencia del harness, no corre cada semana
  - trend_analysis:     Tendencias de mercado y mercados emergentes
  - opportunity_scorer: Score combinado de oportunidad

Uso:
  python -m etl.analytics.run_all
"""
