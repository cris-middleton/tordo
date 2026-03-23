"""Add billing, OAuth and WhatsApp fields to users.

Revision ID: 006
Revises: 005
Create Date: 2026-03-22
"""
from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade():
    # ── Users: billing ────────────────────────────────────────────────────────
    op.add_column(
        "users",
        sa.Column(
            "subscription_status",
            sa.String(20),
            nullable=False,
            server_default="inactive",
        ),
    )
    op.add_column("users", sa.Column("stripe_customer_id", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("stripe_subscription_id", sa.String(255), nullable=True))

    # ── Users: Google OAuth ───────────────────────────────────────────────────
    op.add_column("users", sa.Column("google_id", sa.String(100), nullable=True))
    op.create_index("ix_users_google_id", "users", ["google_id"], unique=True)

    # ── Users: WhatsApp ───────────────────────────────────────────────────────
    op.add_column("users", sa.Column("whatsapp_number", sa.String(20), nullable=True))


def downgrade():
    op.drop_column("users", "whatsapp_number")
    op.drop_index("ix_users_google_id", table_name="users")
    op.drop_column("users", "google_id")
    op.drop_column("users", "stripe_subscription_id")
    op.drop_column("users", "stripe_customer_id")
    op.drop_column("users", "subscription_status")
