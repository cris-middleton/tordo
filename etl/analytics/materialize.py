"""Paso final del batch: llevar los parquets de analytics a PostgreSQL.

Corre después de `run_all`. A partir de aquí la API no toca el sistema de
archivos: consulta `analytics.*` con SQL como todo lo demás.

    uv run --project .. python -m analytics.materialize
    uv run --project .. python -m analytics.materialize --solo product_price_bands_l1
    uv run --project .. python -m analytics.materialize --dry-run

Ver docs/decisiones/0006-analytics-en-postgres.md.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from sqlalchemy import create_engine, text

# Mismo arranque que etl/analytics/run_all.py: permite invocarlo tanto desde la
# raíz del repo (`python -m etl.analytics.materialize`) como desde etl/
# (`python -m analytics.materialize`). Desaparece cuando el ETL consuma el
# backend como paquete en vez de por sys.path.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from etl.analytics.config import OUTPUT_DIR  # noqa: E402
from etl.config import config  # noqa: E402
from etl.loaders.analytics_catalog import CATALOGO  # noqa: E402
from etl.loaders.analytics_loader import SCHEMA, materializar_desde_parquet  # noqa: E402

logger = logging.getLogger(__name__)

# get_productos busca por subcadena sobre el nombre del producto. El nombre viene
# con un typo histórico en el parquet ('NombreroductoGenerico'), así que se
# intentan ambas variantes.
_COLUMNAS_NOMBRE_PRODUCTO = ("NombreroductoGenerico", "NombreProductoGenerico")


def _url_sync() -> str:
    """URL psycopg2. El ETL es sync; asyncpg no sirve aquí."""
    url = config.DATABASE_URL
    return url.replace("postgresql+asyncpg://", "postgresql://", 1).replace(
        "postgres+asyncpg://", "postgresql://", 1
    )


def _crear_indice_busqueda_productos(engine) -> None:
    """Índice GIN con pg_trgm sobre el nombre del producto.

    Sin esto, la búsqueda de productos es un scan completo: `LIKE '%algo%'` con
    comodín inicial no lo puede servir ningún B-tree.
    """
    with engine.begin() as conn:
        existentes = {
            r[0]
            for r in conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = :s AND table_name = 'product_price_bands_l3'"
                ),
                {"s": SCHEMA},
            )
        }
        columna = next((c for c in _COLUMNAS_NOMBRE_PRODUCTO if c in existentes), None)
        if columna is None:
            logger.warning(
                "product_price_bands_l3 no tiene columna de nombre de producto — "
                "se omite el índice de búsqueda"
            )
            return
        conn.execute(
            text(
                f"CREATE INDEX IF NOT EXISTS ix_product_price_bands_l3_nombre_trgm "
                f"ON {SCHEMA}.product_price_bands_l3 "
                f'USING gin (lower("{columna}") gin_trgm_ops)'
            )
        )
        logger.info("índice de búsqueda de productos creado sobre %s", columna)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Materializa los parquets de analytics en Postgres"
    )
    parser.add_argument("--solo", action="append", help="materializar sólo estas tablas")
    parser.add_argument("--dry-run", action="store_true", help="listar qué se haría, sin escribir")
    parser.add_argument(
        "--data-dir",
        default=None,
        help="directorio de parquets (por defecto, el del pipeline)",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)-8s %(name)s: %(message)s"
    )

    directorio = Path(args.data_dir) if args.data_dir else OUTPUT_DIR
    if not directorio.exists():
        logger.error("no existe el directorio de analytics: %s", directorio)
        return 1

    seleccion = [t for t in CATALOGO if not args.solo or t.tabla in args.solo]
    if args.solo:
        desconocidas = set(args.solo) - {t.tabla for t in CATALOGO}
        if desconocidas:
            logger.error("tablas desconocidas: %s", sorted(desconocidas))
            return 1

    if args.dry_run:
        for spec in seleccion:
            existe = (directorio / spec.parquet).exists()
            print(f"{'[ok]   ' if existe else '[falta]'} {spec.parquet:42} → {SCHEMA}.{spec.tabla}")
        return 0

    engine = create_engine(_url_sync(), pool_pre_ping=True)
    total, omitidas, fallidas = 0, [], []

    # Se cierra al acabar: el cron semanal lo llama en proceso, y una conexión
    # abierta deja la ejecución viva — Railway descartaría la siguiente.
    try:
        for spec in seleccion:
            try:
                filas = materializar_desde_parquet(directorio, spec, engine)
            except Exception:
                logger.exception("falló la materialización de %s", spec.tabla)
                fallidas.append(spec.tabla)
                continue
            if filas is None:
                omitidas.append(spec.tabla)
            else:
                total += filas

        if not fallidas:
            try:
                _crear_indice_busqueda_productos(engine)
            except Exception:
                logger.exception("falló la creación del índice de búsqueda de productos")
    finally:
        engine.dispose()

    logger.info(
        "materialización terminada: %d tablas, %d filas, %d omitidas, %d fallidas",
        len(seleccion) - len(omitidas) - len(fallidas),
        total,
        len(omitidas),
        len(fallidas),
    )
    if omitidas:
        logger.info("omitidas (parquet ausente): %s", ", ".join(omitidas))
    if fallidas:
        logger.error("fallidas: %s", ", ".join(fallidas))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
