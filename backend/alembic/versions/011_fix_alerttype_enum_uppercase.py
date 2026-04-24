"""Add uppercase AlertType enum names to Postgres so SQLAlchemy default lookups work.

Block 2 compliance alert values (estado_habil_cambio, plazo_48h, etc.) were added
in migration 005 using their Python VALUES (lowercase). But SQLAlchemy's default
Enum column binding uses the Python NAME (uppercase), which Postgres doesn't
recognize — causing:

    invalid input value for enum alerttype: "NUEVA_LICITACION_MATCH"

This migration adds the uppercase NAMES so both queries and existing rows work.
No data migration needed (both representations are now accepted).

Revision ID: 011_fix_alerttype_enum_uppercase
Revises: 010_trial_tracking
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa


revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


# Uppercase Python NAMES to add to the Postgres alerttype enum.
# These mirror the lowercase VALUES added in migration 005.
UPPERCASE_VALUES = [
    "ESTADO_HABIL_CAMBIO",
    "DOCUMENTO_VENCIDO",
    "PLAZO_48H",
    "PLAZO_24H",
    "NUEVA_LICITACION_MATCH",
]


def upgrade() -> None:
    conn = op.get_bind()
    for value in UPPERCASE_VALUES:
        conn.execute(sa.text(f"ALTER TYPE alerttype ADD VALUE IF NOT EXISTS '{value}'"))


def downgrade() -> None:
    # PostgreSQL does not support removing enum values without recreating the type.
    # Leaving the uppercase values in place is harmless.
    pass
