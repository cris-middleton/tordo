"""Baseline: crear licitaciones y ordenes_compra

Revision ID: 000
Revises:
Create Date: 2026-08-05

Contexto
--------
Hasta ahora **ninguna migración creaba `licitaciones` ni `ordenes_compra`**, las dos
tablas centrales del producto. La 001 las *altera* (`ADD COLUMN organismo_id`)
asumiendo que ya existen.

Existían porque se creaban fuera de Alembic, con `Base.metadata.create_all()`:
`backend/scripts/init_production_db.py` y —más peligroso— `etl/loaders/
database_loader_v2.py`, que lo llama en cada carga.

Consecuencia: `alembic upgrade head` sobre una base vacía fallaba con
"relation licitaciones does not exist", así que no había forma reproducible de
levantar un entorno nuevo (staging, recuperación ante desastre, un dev nuevo, CI).

Esta migración es la línea base que faltaba. Crea ambas tablas **en su forma
anterior a la 001** — sin `organismo_id` ni `proveedor_id`, que añade la 001.

Idempotente a propósito
-----------------------
Las bases que ya existen (producción, desarrollo) tienen estas tablas creadas por
`create_all`. Por eso se inspecciona antes de crear: ahí esta migración no hace
nada y la cadena sigue igual. No hace falta ningún `alembic stamp` manual.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.sql import func

revision = "000"
down_revision = None
branch_labels = None
depends_on = None


def _existe(nombre: str) -> bool:
    return nombre in sa.inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _existe("licitaciones"):
        op.create_table(
            "licitaciones",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("codigo_externo", sa.String(length=100), nullable=False),
            sa.Column("codigo_interno", sa.String(length=100), nullable=True),
            sa.Column("nombre", sa.String(length=500), nullable=False),
            sa.Column("descripcion", sa.Text(), nullable=True),
            sa.Column("fecha_publicacion", sa.DateTime(timezone=True), nullable=False),
            sa.Column("fecha_cierre", sa.DateTime(timezone=True), nullable=True),
            sa.Column("fecha_inicio", sa.DateTime(timezone=True), nullable=True),
            sa.Column("fecha_final", sa.DateTime(timezone=True), nullable=True),
            sa.Column("monto_estimado", sa.Numeric(precision=15, scale=2), nullable=True),
            sa.Column("monto_total", sa.Numeric(precision=15, scale=2), nullable=True),
            sa.Column("moneda", sa.String(length=10), server_default="CLP", nullable=True),
            sa.Column("estado", sa.String(length=50), nullable=True),
            sa.Column("tipo_licitacion", sa.String(length=100), nullable=True),
            sa.Column("tipo_moneda", sa.String(length=10), nullable=True),
            sa.Column("codigo_organismo", sa.String(length=50), nullable=True),
            sa.Column("nombre_organismo", sa.String(length=500), nullable=True),
            sa.Column("rut_organismo", sa.String(length=20), nullable=True),
            sa.Column("region", sa.String(length=100), nullable=True),
            sa.Column("comuna", sa.String(length=100), nullable=True),
            sa.Column("informacion_adicional", sa.JSON(), nullable=True),
            sa.Column("items", sa.JSON(), nullable=True),
            sa.Column("url_acta", sa.String(length=500), nullable=True),
            sa.Column("url_licitacion", sa.String(length=500), nullable=True),
            sa.Column(
                "fecha_extraccion",
                sa.DateTime(timezone=True),
                server_default=func.now(),
                nullable=True,
            ),
            sa.Column("fecha_actualizacion", sa.DateTime(timezone=True), nullable=True),
            sa.Column("activo", sa.Boolean(), server_default=sa.true(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("codigo_externo"),
            comment="Licitaciones publicadas en Mercado Público (listado diario)",
        )
        op.create_index("ix_licitaciones_id", "licitaciones", ["id"])
        op.create_index("ix_licitaciones_codigo_externo", "licitaciones", ["codigo_externo"])
        op.create_index("ix_licitaciones_codigo_interno", "licitaciones", ["codigo_interno"])
        op.create_index("ix_licitaciones_fecha_publicacion", "licitaciones", ["fecha_publicacion"])
        op.create_index("ix_licitaciones_estado", "licitaciones", ["estado"])
        op.create_index("ix_licitaciones_codigo_organismo", "licitaciones", ["codigo_organismo"])

    if not _existe("ordenes_compra"):
        op.create_table(
            "ordenes_compra",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("codigo_oc", sa.String(length=100), nullable=False),
            sa.Column("codigo_licitacion", sa.String(length=100), nullable=True),
            sa.Column("nombre", sa.String(length=500), nullable=False),
            sa.Column("descripcion", sa.Text(), nullable=True),
            sa.Column("fecha_publicacion", sa.DateTime(timezone=True), nullable=False),
            sa.Column("fecha_aceptacion", sa.DateTime(timezone=True), nullable=True),
            sa.Column("fecha_entrega", sa.DateTime(timezone=True), nullable=True),
            sa.Column("fecha_estimada_entrega", sa.DateTime(timezone=True), nullable=True),
            sa.Column("monto_total", sa.Numeric(precision=15, scale=2), nullable=False),
            sa.Column("monto_neto", sa.Numeric(precision=15, scale=2), nullable=True),
            sa.Column("monto_iva", sa.Numeric(precision=15, scale=2), nullable=True),
            sa.Column("moneda", sa.String(length=10), server_default="CLP", nullable=True),
            sa.Column("estado", sa.String(length=50), nullable=True),
            sa.Column("estado_proveedor", sa.String(length=50), nullable=True),
            sa.Column("codigo_organismo", sa.String(length=50), nullable=True),
            sa.Column("nombre_organismo", sa.String(length=500), nullable=True),
            sa.Column("rut_organismo", sa.String(length=20), nullable=True),
            sa.Column("codigo_proveedor", sa.String(length=50), nullable=True),
            sa.Column("nombre_proveedor", sa.String(length=500), nullable=True),
            sa.Column("rut_proveedor", sa.String(length=20), nullable=True),
            sa.Column("region", sa.String(length=100), nullable=True),
            sa.Column("comuna", sa.String(length=100), nullable=True),
            sa.Column("informacion_adicional", sa.JSON(), nullable=True),
            sa.Column("items", sa.JSON(), nullable=True),
            sa.Column("url_oc", sa.String(length=500), nullable=True),
            sa.Column("url_acta", sa.String(length=500), nullable=True),
            sa.Column(
                "fecha_extraccion",
                sa.DateTime(timezone=True),
                server_default=func.now(),
                nullable=True,
            ),
            sa.Column("fecha_actualizacion", sa.DateTime(timezone=True), nullable=True),
            sa.Column("activo", sa.Boolean(), server_default=sa.true(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("codigo_oc"),
            comment="Órdenes de compra de Mercado Público (listado diario)",
        )
        op.create_index("ix_ordenes_compra_id", "ordenes_compra", ["id"])
        op.create_index("ix_ordenes_compra_codigo_oc", "ordenes_compra", ["codigo_oc"])
        op.create_index(
            "ix_ordenes_compra_codigo_licitacion", "ordenes_compra", ["codigo_licitacion"]
        )
        op.create_index(
            "ix_ordenes_compra_fecha_publicacion", "ordenes_compra", ["fecha_publicacion"]
        )
        op.create_index("ix_ordenes_compra_estado", "ordenes_compra", ["estado"])
        op.create_index(
            "ix_ordenes_compra_codigo_organismo", "ordenes_compra", ["codigo_organismo"]
        )
        op.create_index(
            "ix_ordenes_compra_codigo_proveedor", "ordenes_compra", ["codigo_proveedor"]
        )


def downgrade() -> None:
    op.drop_table("ordenes_compra")
    op.drop_table("licitaciones")
