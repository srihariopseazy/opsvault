"""Phase 11: Webhooks and event-driven delivery

Revision ID: 011
Revises: 010
Create Date: 2024-01-11 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── webhooks ──────────────────────────────────────────────────────────────
    op.create_table(
        "webhooks",
        sa.Column("id",        mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid",      sa.String(36),  nullable=False),
        sa.Column(
            "user_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "org_id",
            sa.String(36),
            sa.ForeignKey("organizations.uuid", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("name",      sa.String(255), nullable=False),
        sa.Column("url",       sa.String(500), nullable=False),
        sa.Column("secret",    sa.String(255), nullable=False),
        sa.Column("events",    sa.JSON,        nullable=False),
        sa.Column("is_active", mysql.TINYINT(1), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime,   server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime,   server_default=sa.func.now(), onupdate=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_webhooks_uuid",    "webhooks", ["uuid"],    unique=True)
    op.create_index("ix_webhooks_user_id", "webhooks", ["user_id"])
    op.create_index("ix_webhooks_org_id",  "webhooks", ["org_id"])

    # ── webhook_deliveries ────────────────────────────────────────────────────
    op.create_table(
        "webhook_deliveries",
        sa.Column("id",              mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid",            sa.String(36),  nullable=False),
        sa.Column(
            "webhook_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("webhooks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type",      sa.String(100), nullable=False),
        sa.Column("payload",         sa.JSON,        nullable=False),
        sa.Column("response_status", sa.Integer,     nullable=True),
        sa.Column("response_body",   sa.Text,        nullable=True),
        sa.Column("attempt_count",   mysql.TINYINT(1), nullable=False, server_default="1"),
        sa.Column("success",         mysql.TINYINT(1), nullable=False, server_default="0"),
        sa.Column("delivered_at",    sa.DateTime,    nullable=True),
        sa.Column("created_at",      sa.DateTime,    server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_webhook_deliveries_uuid",       "webhook_deliveries", ["uuid"],      unique=True)
    op.create_index("ix_webhook_deliveries_webhook_id", "webhook_deliveries", ["webhook_id"])
    op.create_index("ix_webhook_deliveries_created_at", "webhook_deliveries", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_webhook_deliveries_created_at", "webhook_deliveries")
    op.drop_index("ix_webhook_deliveries_webhook_id", "webhook_deliveries")
    op.drop_index("ix_webhook_deliveries_uuid",       "webhook_deliveries")
    op.drop_table("webhook_deliveries")

    op.drop_index("ix_webhooks_org_id",  "webhooks")
    op.drop_index("ix_webhooks_user_id", "webhooks")
    op.drop_index("ix_webhooks_uuid",    "webhooks")
    op.drop_table("webhooks")
