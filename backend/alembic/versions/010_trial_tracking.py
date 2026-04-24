"""Add trial tracking columns to users.

Revision ID: 010
Revises: 009
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("trial_reminder_day7_sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("trial_reminder_day12_sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_users_trial_ends_at",
        "users",
        ["trial_ends_at"],
        unique=False,
    )


def downgrade():
    op.drop_index("ix_users_trial_ends_at", table_name="users")
    op.drop_column("users", "trial_reminder_day12_sent_at")
    op.drop_column("users", "trial_reminder_day7_sent_at")
    op.drop_column("users", "trial_ends_at")
