"""retirar whatsapp de users

Revision ID: b1f4a7c2d9e0
Revises: ab7e6b4260a0
Create Date: 2026-08-16 09:10:00.000000

WhatsApp se retira del producto. El canal estaba construido tras un flag apagado
y su verificación WABA con Meta —4 a 8 semanas— nunca se inició, así que las dos
columnas llevan desde su migración con el valor por defecto y ninguna fila útil.

El `downgrade` las devuelve idénticas, incluido el `server_default`: una
migración que no revierte no pasa CI, y aquí revertir es barato porque no hay
datos que reconstruir.
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1f4a7c2d9e0"
down_revision: str | None = "ab7e6b4260a0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("users", "notification_whatsapp")
    op.drop_column("users", "whatsapp_number")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("whatsapp_number", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "notification_whatsapp",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
