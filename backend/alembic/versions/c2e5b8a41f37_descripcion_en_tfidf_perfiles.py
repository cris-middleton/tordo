"""descripcion en tfidf_perfiles

Revision ID: c2e5b8a41f37
Revises: ab7e6b4260a0
Create Date: 2026-08-16 10:05:00.000000

El perfil semántico se construía con `" ".join(rubros_usados)`, así que dos
empresas del mismo rubro tenían **el mismo vector** y por tanto las mismas
alertas. La descripción libre es la entrada que las distingue, y además quita
del onboarding el paso de entender la taxonomía UNSPSC antes de ver el primer
resultado.

Nullable a propósito: los perfiles que ya existen siguen funcionando con sus
rubros hasta que su dueño escriba la descripción.
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c2e5b8a41f37"
down_revision: str | None = "b1f4a7c2d9e0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tfidf_perfiles",
        sa.Column(
            "descripcion",
            sa.Text(),
            nullable=True,
            comment=(
                "A qué se dedica la empresa, en sus palabras. Entrada principal del "
                "vector TF-IDF: los rubros solos no distinguen a dos empresas del "
                "mismo rubro, así que compartían perfil."
            ),
        ),
    )


def downgrade() -> None:
    op.drop_column("tfidf_perfiles", "descripcion")
