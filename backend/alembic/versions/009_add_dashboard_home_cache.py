"""Add dashboard_home_cache table.

Revision ID: 009
Revises: 008
Create Date: 2026-04-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dashboard_home_cache",
        sa.Column("empresa_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("matches", JSONB(), nullable=False, server_default="[]"),
        sa.Column("matches_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "cached_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_dashboard_home_cache_cached_at",
        "dashboard_home_cache",
        ["cached_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_dashboard_home_cache_cached_at", table_name="dashboard_home_cache")
    op.drop_table("dashboard_home_cache")
