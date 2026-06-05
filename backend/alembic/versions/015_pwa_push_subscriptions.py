"""Phase 15: PWA push subscriptions table

Revision ID: 015
Revises: 014
Create Date: 2024-01-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column("id",      mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid",    sa.String(36), nullable=False),
        sa.Column(
            "user_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("endpoint",   sa.String(2048), nullable=False),
        sa.Column("p256dh",     sa.String(512),  nullable=False),
        sa.Column("auth",       sa.String(256),  nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_push_subscriptions_uuid",    "push_subscriptions", ["uuid"],    unique=True)
    op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_push_subscriptions_user_id", "push_subscriptions")
    op.drop_index("ix_push_subscriptions_uuid",    "push_subscriptions")
    op.drop_table("push_subscriptions")
