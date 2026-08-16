"""tokens de verificacion de correo

Revision ID: e4b7d2f91a56
Revises: c2e5b8a41f37
Create Date: 2026-08-16 12:30:00.000000

`users.is_verified` existe desde la primera migración y **nunca hubo un flujo que
la pusiera en `True`**: la columna estaba, la promesa no. Sin verificación, una
cuenta puede registrarse con el correo de otra persona y todo lo que el producto
manda —avisos con datos de negocio, el informe semanal, los comprobantes de
pago— acaba en un buzón ajeno.

Tabla propia y no una columna `proposito` en `password_reset_tokens`: son dos
ciclos de vida distintos (siete días contra una hora) con motivos de revocación
distintos, y mezclarlos convierte cada consulta en un filtro que alguien
olvidará.
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e4b7d2f91a56"
down_revision: str | None = "d3a8c1e5b704"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "email_verification_tokens",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            comment="Identificador del token emitido.",
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            nullable=False,
            comment="Usuario que tiene que verificar su correo.",
        ),
        sa.Column(
            "token_hash",
            sa.String(length=64),
            nullable=False,
            comment="SHA-256 del token. El valor en claro sólo existe en el correo.",
        ),
        sa.Column(
            "expira_en",
            sa.DateTime(timezone=True),
            nullable=False,
            comment="Cuándo deja de servir. Días, no minutos: llega en la bienvenida.",
        ),
        sa.Column(
            "usado_en",
            sa.DateTime(timezone=True),
            nullable=True,
            comment=(
                "Cuándo se canjeó. Sin esta marca, quien tenga el correo puede "
                "reverificar cuantas veces quiera mientras no caduque."
            ),
        ),
        sa.Column(
            "creado_en",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="Cuándo se emitió.",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        # La unicidad va como restricción y no como índice único: la convención
        # de `app/db/__init__.py` la nombra sola, y una restricción UNIQUE ya
        # trae su propio índice (CLAUDE.md).
        sa.UniqueConstraint("token_hash", name="uq_email_verification_tokens_token_hash"),
        comment="Tokens de un solo uso para verificar el correo de una cuenta.",
    )
    op.create_index(
        "ix_email_verification_tokens_user_id",
        "email_verification_tokens",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_email_verification_tokens_user_id", table_name="email_verification_tokens")
    op.drop_table("email_verification_tokens")
