"""
Runner principal del módulo de analytics de TORDO.

Ejecuta todos los análisis en orden y genera reportes en etl/data/analytics/.

Uso:
  # Todos los análisis
  python -m etl.analytics.run_all

  # Solo un módulo
  python -m etl.analytics.run_all --modulo seasonality
  python -m etl.analytics.run_all --modulo price
  python -m etl.analytics.run_all --modulo competitors
  python -m etl.analytics.run_all --modulo tfidf
  python -m etl.analytics.run_all --modulo clustering
  python -m etl.analytics.run_all --modulo trends
  python -m etl.analytics.run_all --modulo scorer
"""

import argparse
import logging
import sys
import time
from pathlib import Path

# Asegurar que el proyecto está en el path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from etl.analytics.config import OUTPUT_DIR

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(OUTPUT_DIR / "analytics.log"),
    ],
)
logger = logging.getLogger("tordo.analytics")


def run_module(name: str):
    """Ejecuta un módulo de analytics por nombre."""
    t0 = time.time()

    if name == "seasonality":
        from etl.analytics.seasonality import run_seasonality
        run_seasonality()

    elif name == "price":
        from etl.analytics.price_benchmarking import run_price_benchmarking
        run_price_benchmarking()

    elif name == "competitors":
        from etl.analytics.competitor_analysis import run_competitor_analysis
        run_competitor_analysis()

    elif name == "tfidf":
        from etl.analytics.tfidf_matcher import run_tfidf
        run_tfidf()

    elif name == "clustering":
        from etl.analytics.word_clustering import run_word_clustering
        run_word_clustering()

    elif name == "trends":
        from etl.analytics.trend_analysis import run_trend_analysis
        run_trend_analysis()

    elif name == "scorer":
        from etl.analytics.opportunity_scorer import run_opportunity_scorer
        run_opportunity_scorer()

    elif name == "product_prices":
        from etl.analytics.product_price_bands import run_product_price_bands
        run_product_price_bands()

    elif name == "buyers":
        from etl.analytics.buyer_scoring import run_buyer_scoring
        run_buyer_scoring()

    elif name == "sectors":
        from etl.analytics.sector_intelligence import run_sector_intelligence
        run_sector_intelligence()

    else:
        logger.error(f"Módulo desconocido: {name}")
        return

    elapsed = time.time() - t0
    logger.info(f"  Módulo '{name}' completado en {elapsed:.0f}s ({elapsed/60:.1f} min)")


def main():
    parser = argparse.ArgumentParser(description="TORDO Analytics Runner")
    parser.add_argument(
        "--modulo",
        choices=["seasonality", "price", "competitors", "tfidf", "clustering", "trends", "scorer", "product_prices", "buyers", "sectors"],
        default=None,
        help="Ejecutar solo un módulo específico. Si no se especifica, ejecuta todos.",
    )
    args = parser.parse_args()

    logger.info("=" * 70)
    logger.info("TORDO ANALYTICS — Inicio de análisis")
    logger.info(f"Output: {OUTPUT_DIR}")
    logger.info("=" * 70)

    t_total = time.time()

    if args.modulo:
        run_module(args.modulo)
    else:
        # Orden de ejecución: los módulos base primero, scorer al final
        modules = [
            ("seasonality", "Estacionalidad de compras"),
            ("price", "Benchmarking de precios"),
            ("competitors", "Análisis de competidores"),
            ("trends", "Tendencias de mercado"),
            ("tfidf", "Matching semántico TF-IDF"),
            ("clustering", "Clustering de tipos de compra"),
            ("product_prices", "Bandas de precio por producto"),
            ("buyers", "Scoring de compradores"),
            ("sectors", "Inteligencia por sector y región"),
            ("scorer", "Scoring de oportunidades"),
        ]

        for mod_name, mod_desc in modules:
            logger.info(f"\n{'─'*50}")
            logger.info(f"Iniciando: {mod_desc}")
            logger.info(f"{'─'*50}")
            try:
                run_module(mod_name)
            except Exception as e:
                logger.error(f"Error en módulo '{mod_name}': {e}", exc_info=True)
                logger.info("Continuando con el siguiente módulo...")

    elapsed_total = time.time() - t_total
    logger.info(f"\n{'='*70}")
    logger.info(f"TORDO ANALYTICS — Completado en {elapsed_total:.0f}s ({elapsed_total/60:.1f} min)")

    # Resumen de archivos generados
    outputs = sorted(OUTPUT_DIR.glob("*.parquet"))
    if outputs:
        logger.info(f"Archivos generados en {OUTPUT_DIR}:")
        total_mb = 0
        for f in outputs:
            mb = f.stat().st_size / 1024 / 1024
            total_mb += mb
            logger.info(f"  {f.name:45s} {mb:8.1f} MB")
        logger.info(f"  {'TOTAL':45s} {total_mb:8.1f} MB")

    logger.info("=" * 70)


if __name__ == "__main__":
    main()
