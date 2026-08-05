"""Esquema analytics para servir el BI desde Postgres

Revision ID: 012
Revises: 011
Create Date: 2026-08-05

Crea el esquema `analytics`, donde el pipeline materializa los resultados del
batch de Polars (ver etl/loaders/analytics_loader.py y
docs/decisiones/0006-analytics-en-postgres.md).

Las TABLAS de dentro no se crean aquí a propósito: son datos derivados que el
pipeline reemplaza enteros en cada corrida, con el esquema inferido del parquet.
Versionarlas en migraciones las desincronizaría al primer cambio del pipeline.
Lo que sí es migración es el contenedor: el esquema y sus extensiones.

Se habilita `pg_trgm` porque `get_productos` busca productos por subcadena
(`... LIKE '%consulta%'`), un patrón que ningún B-tree puede servir. El índice
GIN sobre el nombre lo crea el pipeline al materializar product_price_bands_l3.
"""

from alembic import op

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS analytics")
    op.execute(
        "COMMENT ON SCHEMA analytics IS "
        "'Resultados materializados del pipeline de analytics (Polars). "
        "Datos derivados: el pipeline los reemplaza enteros en cada corrida. "
        "No llevan migraciones.'"
    )
    # Necesaria para el índice GIN de búsqueda de productos por subcadena.
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")


def downgrade() -> None:
    op.execute("DROP SCHEMA IF EXISTS analytics CASCADE")
    # pg_trgm no se elimina: puede haber otros índices dependiendo de ella.
