"""
Runner principal del módulo de analytics de TORDO.

Ejecuta todos los análisis en orden y genera reportes en etl/data/analytics/.

Uso:
  # Todos los análisis (reconstrucción completa tras descarga OC + LIC)
  python -m etl.analytics.run_all

  # Solo un grupo de módulos por fuente de datos
  python -m etl.analytics.run_all --grupo oc    # módulos basados en Órdenes de Compra
  python -m etl.analytics.run_all --grupo lic   # módulos basados en Licitaciones

  # Solo un módulo específico
  python -m etl.analytics.run_all --modulo seasonality
  python -m etl.analytics.run_all --modulo price
  python -m etl.analytics.run_all --modulo competitors
  python -m etl.analytics.run_all --modulo tfidf
  python -m etl.analytics.run_all --modulo clustering
  python -m etl.analytics.run_all --modulo trends
  python -m etl.analytics.run_all --modulo scorer
  python -m etl.analytics.run_all --modulo product_prices
  python -m etl.analytics.run_all --modulo buyers
  python -m etl.analytics.run_all --modulo sectors
  python -m etl.analytics.run_all --modulo discounts
  python -m etl.analytics.run_all --modulo competitor_predictor
  python -m etl.analytics.run_all --modulo transparency
  python -m etl.analytics.run_all --modulo windows
  python -m etl.analytics.run_all --modulo diversification

Grupos por fuente de datos:
  oc  — seasonality, price, competitors, tfidf, clustering, trends, product_prices,
         buyers, sectors, discounts, diversification, compra_agil_mensual, scorer
  lic — transparency, windows, competitor_predictor
"""

# Módulos cuya fuente primaria son los ZIPs de Órdenes de Compra
_MODULOS_OC = [
    ("seasonality", "Estacionalidad de compras"),
    ("price", "Benchmarking de precios"),
    ("competitors", "Análisis de competidores"),
    ("trends", "Tendencias de mercado"),
    ("tfidf", "Matching semántico TF-IDF"),
    ("clustering", "Clustering de tipos de compra"),
    ("product_prices", "Bandas de precio por producto"),
    ("buyers", "Scoring de compradores"),
    ("sectors", "Inteligencia por sector y región"),
    ("discounts", "Descuento óptimo por contexto"),
    ("diversification", "Score de diversificación de proveedores"),
    ("compra_agil_mensual", "Compra Ágil por comprador y mes"),
    ("scorer", "Scoring de oportunidades"),  # al final: usa outputs anteriores
]

# Módulos cuya fuente primaria son los ZIPs de Licitaciones
_MODULOS_LIC = [
    ("transparency", "Índice de transparencia del comprador"),
    ("windows", "Ventanas de preparación de ofertas"),
    ("competitor_predictor", "Predictor de N° competidores"),
]

import argparse
import logging
import sys
import time
from pathlib import Path

# Asegurar que el proyecto está en el path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from etl.analytics.compra_agil_mensual import run_compra_agil_mensual
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

    elif name == "discounts":
        from etl.analytics.discount_optimizer import run_discount_optimizer

        run_discount_optimizer()

    elif name == "competitor_predictor":
        from etl.analytics.competitor_predictor import run_competitor_predictor

        run_competitor_predictor()

    elif name == "transparency":
        from etl.analytics.buyer_transparency import run_buyer_transparency

        run_buyer_transparency()

    elif name == "windows":
        from etl.analytics.preparation_window import run_preparation_window

        run_preparation_window()

    elif name == "diversification":
        from etl.analytics.provider_diversification import run_provider_diversification

        run_provider_diversification()

    elif name == "compra_agil_mensual":
        run_compra_agil_mensual()

    else:
        logger.error(f"Módulo desconocido: {name}")
        return

    elapsed = time.time() - t0
    logger.info(f"  Módulo '{name}' completado en {elapsed:.0f}s ({elapsed / 60:.1f} min)")


def _run_modules(modules: list) -> list[str]:
    """Ejecuta una lista de (nombre, descripción) y devuelve los que fallaron.

    Un módulo roto no detiene a los demás, pero quien orquesta tiene que
    enterarse: el cron semanal lo convierte en un /fail del latido.
    """
    fallidos: list[str] = []
    for mod_name, mod_desc in modules:
        logger.info(f"\n{'─' * 50}")
        logger.info(f"Iniciando: {mod_desc}")
        logger.info(f"{'─' * 50}")
        try:
            run_module(mod_name)
        except Exception as e:
            logger.error(f"Error en módulo '{mod_name}': {e}", exc_info=True)
            logger.info("Continuando con el siguiente módulo...")
            fallidos.append(mod_name)
    return fallidos


def ejecutar_todos() -> list[str]:
    """Reconstrucción completa en su orden (OC, LIC, scorer al final).

    Devuelve los módulos que fallaron.
    """
    return (
        _run_modules(_MODULOS_OC[:-1])  # OC sin scorer
        + _run_modules(_MODULOS_LIC)  # LIC
        + _run_modules(_MODULOS_OC[-1:])  # scorer al final: usa los anteriores
    )


def main():
    parser = argparse.ArgumentParser(description="TORDO Analytics Runner")
    parser.add_argument(
        "--modulo",
        choices=[
            "seasonality",
            "price",
            "competitors",
            "tfidf",
            "clustering",
            "trends",
            "scorer",
            "product_prices",
            "buyers",
            "sectors",
            "discounts",
            "competitor_predictor",
            "transparency",
            "windows",
            "diversification",
            "compra_agil_mensual",
        ],
        default=None,
        help="Ejecutar solo un módulo específico.",
    )
    parser.add_argument(
        "--grupo",
        choices=["oc", "lic"],
        default=None,
        help=(
            "Ejecutar solo los módulos de un grupo de datos: "
            "'oc' (Órdenes de Compra) o 'lic' (Licitaciones). "
            "Si se omite junto con --modulo, ejecuta todos."
        ),
    )
    args = parser.parse_args()

    logger.info("=" * 70)
    logger.info("TORDO ANALYTICS — Inicio de análisis")
    logger.info(f"Output: {OUTPUT_DIR}")
    logger.info("=" * 70)

    t_total = time.time()

    if args.modulo:
        run_module(args.modulo)
    elif args.grupo == "oc":
        logger.info("Grupo: OC — módulos basados en Órdenes de Compra")
        _run_modules(_MODULOS_OC)
    elif args.grupo == "lic":
        logger.info("Grupo: LIC — módulos basados en Licitaciones")
        _run_modules(_MODULOS_LIC)
    else:
        ejecutar_todos()

    elapsed_total = time.time() - t_total
    logger.info(f"\n{'=' * 70}")
    logger.info(
        f"TORDO ANALYTICS — Completado en {elapsed_total:.0f}s ({elapsed_total / 60:.1f} min)"
    )

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
