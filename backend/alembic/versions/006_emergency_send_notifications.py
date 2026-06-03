"""Phase 6 emergency access, send items, generator history, notifications

Revision ID: 006
Revises: 005
Create Date: 2024-01-06 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── emergency_access ─────────────────────────────────────────────────────
    op.create_table(
        "emergency_access",
        sa.Column("id", mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid", sa.String(36), unique=True, nullable=False),
        sa.Column(
            "grantor_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "grantee_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "type",
            sa.Enum("view", "takeover", name="emergencyaccesstype"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "invited", "accepted", "rejected",
                "recovery_initiated", "recovery_approved",
                name="emergencyaccessstatus",
            ),
            nullable=False,
            server_default="invited",
        ),
        sa.Column("wait_time_days", sa.Integer, nullable=False, server_default="7"),
        sa.Column("recovery_initiated_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_emergency_access_grantor_id", "emergency_access", ["grantor_id"])
    op.create_index("ix_emergency_access_grantee_id", "emergency_access", ["grantee_id"])

    # ── send_items ────────────────────────────────────────────────────────────
    op.create_table(
        "send_items",
        sa.Column("id", mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid", sa.String(36), unique=True, nullable=False),
        sa.Column("access_id", sa.String(32), unique=True, nullable=False),
        sa.Column(
            "user_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "type",
            sa.Enum("text", "file", name="senditemtype"),
            nullable=False,
        ),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("content", sa.Text(length=4294967295), nullable=False),
        sa.Column("access_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("max_access_count", sa.Integer, nullable=True),
        sa.Column("expiration_at", sa.DateTime, nullable=True),
        sa.Column("deletion_at", sa.DateTime, nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("hide_content", mysql.TINYINT(1), nullable=False, server_default="0"),
        sa.Column("disabled", mysql.TINYINT(1), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_send_items_access_id", "send_items", ["access_id"])
    op.create_index("ix_send_items_user_id", "send_items", ["user_id"])

    # ── generator_history ─────────────────────────────────────────────────────
    op.create_table(
        "generator_history",
        sa.Column("id", mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid", sa.String(36), unique=True, nullable=False),
        sa.Column(
            "user_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("password", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_generator_history_user_id", "generator_history", ["user_id"])

    # ── notifications ─────────────────────────────────────────────────────────
    op.create_table(
        "notifications",
        sa.Column("id", mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid", sa.String(36), unique=True, nullable=False),
        sa.Column(
            "user_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("read", mysql.TINYINT(1), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("generator_history")
    op.drop_table("send_items")
    op.drop_table("emergency_access")
