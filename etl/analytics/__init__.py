"""
TORDO Analytics Module

Análisis ML e inteligencia sobre datos históricos de ChileCompra
(103M+ órdenes de compra, 100M+ licitaciones desde 2007).

Módulos:
  - seasonality:        Detección de estacionalidad y predicción de compras
  - price_benchmarking: Bandas de precio con probabilidad de adjudicación
  - competitor_analysis: Mapeo de competidores, market share, win rates
  - tfidf_matcher:      Matching semántico TF-IDF sobre historial
  - word_clustering:    Agrupación de tipos de compra por similitud textual
  - trend_analysis:     Tendencias de mercado, crecimiento por sector
  - opportunity_scorer: Score combinado de oportunidad

Uso:
  python -m etl.analytics.run_all
"""
