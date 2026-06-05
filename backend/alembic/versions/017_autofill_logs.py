"""Phase 18: Autofill logs for browser extension

Revision ID: 017
Revises: 016
Create Date: 2024-01-17 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "autofill_logs",
        sa.Column("id",      mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid",    sa.String(36), nullable=False),
        sa.Column(
            "user_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("item_uuid",  sa.String(36),   nullable=False),
        sa.Column("url",        sa.String(2048),  nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_unique_index("ix_autofill_logs_uuid",    "autofill_logs", ["uuid"])
    op.create_index("ix_autofill_logs_user_id",        "autofill_logs", ["user_id"])
    op.create_index("ix_autofill_logs_item_uuid",      "autofill_logs", ["item_uuid"])


def downgrade() -> None:
    op.drop_index("ix_autofill_logs_item_uuid", "autofill_logs")
    op.drop_index("ix_autofill_logs_user_id",   "autofill_logs")
    op.drop_index("ix_autofill_logs_uuid",      "autofill_logs")
    op.drop_table("autofill_logs")
