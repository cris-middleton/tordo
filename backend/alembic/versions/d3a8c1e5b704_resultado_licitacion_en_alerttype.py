"""resultado de licitacion y competidores vigilados

Revision ID: d3a8c1e5b704
Revises: b1f4a7c2d9e0
Create Date: 2026-08-16 11:20:00.000000

Dos cosas que van juntas porque cierran el mismo hueco: saber cómo terminó lo
que seguiste, y saber cuándo gana algo un competidor que vigilas.

**Los valores del enum se añaden en MAYÚSCULAS**, que es lo que SQLAlchemy manda
a Postgres cuando la columna es `SQLEnum(AlertType)`: el driver serializa el
*nombre* del miembro, no su valor. Confundirlos ya rompió este repo una vez — la
migración 005 insertó los valores en minúscula y la 011 tuvo que añadir los
nombres en mayúscula porque `invalid input value for enum alerttype` aparecía en
producción, no en los tests.

El `downgrade` borra la tabla pero **no quita los valores del enum**: Postgres no
lo permite sin recrear el tipo, y recrear un tipo en uso es mucho peor que dejar
dos valores sin usar.
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "d3a8c1e5b704"
down_revision: str | None = "c2e5b8a41f37"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


VALORES = ("RESULTADO_LICITACION", "COMPETIDOR_GANO")


def upgrade() -> None:
    conn = op.get_bind()
    for valor in VALORES:
        conn.execute(sa.text(f"ALTER TYPE alerttype ADD VALUE IF NOT EXISTS '{valor}'"))

    op.create_table(
        "competidor_seguido",
        sa.Column("id", sa.BigInteger(), nullable=False, comment="Identificador del seguimiento."),
        sa.Column(
            "empresa_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            comment="Empresa que vigila al competidor.",
        ),
        sa.Column(
            "rut", sa.String(length=20), nullable=False, comment="RUT tal como lo escribió el usuario."
        ),
        sa.Column(
            "rut_norm",
            sa.String(length=20),
            nullable=False,
            comment="RUT sin puntos ni guion. Es la clave de comparación con ChileCompra.",
        ),
        sa.Column(
            "nombre",
            sa.String(length=500),
            nullable=True,
            comment="Nombre legible del competidor, para no unir con proveedores al alertar.",
        ),
        sa.Column(
            "ultimo_visto_en",
            sa.DateTime(timezone=True),
            nullable=True,
            comment=(
                "Fecha de la última orden por la que ya se avisó. Es lo que separa "
                "«acaba de ganar» de «ha ganado alguna vez»: sin ella, la primera "
                "corrida avisaría del historial completo."
            ),
        ),
        sa.Column(
            "creada_en",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="Cuándo se empezó a vigilar.",
        ),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("empresa_id", "rut_norm", name="uq_competidor_seguido_empresa_rut"),
        comment="Proveedores cuyas adjudicaciones vigila una empresa.",
    )
    op.create_index(
        "ix_competidor_seguido_empresa_id", "competidor_seguido", ["empresa_id"], unique=False
    )
    op.create_index("ix_competidor_seguido_rut", "competidor_seguido", ["rut_norm"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_competidor_seguido_rut", table_name="competidor_seguido")
    op.drop_index("ix_competidor_seguido_empresa_id", table_name="competidor_seguido")
    op.drop_table("competidor_seguido")
    # PostgreSQL no permite quitar un valor de un enum sin recrear el tipo, y
    # recrear un tipo en uso es mucho peor que dejar un valor sin usar.
