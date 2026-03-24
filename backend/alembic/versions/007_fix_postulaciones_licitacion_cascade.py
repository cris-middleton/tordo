"""Fix postulaciones.licitacion_id FK to cascade on delete.

Revision ID: 007
Revises: 006
Create Date: 2026-03-24
"""
from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the existing FK without ON DELETE behaviour, recreate with CASCADE
    op.drop_constraint("postulaciones_licitacion_id_fkey", "postulaciones", type_="foreignkey")
    op.create_foreign_key(
        "postulaciones_licitacion_id_fkey",
        "postulaciones",
        "licitaciones",
        ["licitacion_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("postulaciones_licitacion_id_fkey", "postulaciones", type_="foreignkey")
    op.create_foreign_key(
        "postulaciones_licitacion_id_fkey",
        "postulaciones",
        "licitaciones",
        ["licitacion_id"],
        ["id"],
    )
