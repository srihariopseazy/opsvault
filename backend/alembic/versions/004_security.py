"""Phase 4 security — TOTP 2FA, trusted devices, login events

Revision ID: 004
Revises: 003
Create Date: 2024-01-04 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users: add TOTP columns ──────────────────────────────────────────────
    op.add_column("users", sa.Column("totp_secret", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("totp_enabled", mysql.TINYINT(1), nullable=False, server_default="0"))

    # ── trusted_devices ──────────────────────────────────────────────────────
    op.create_table(
        "trusted_devices",
        sa.Column("id", mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid", sa.String(36), unique=True, nullable=False),
        sa.Column(
            "user_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("device_fingerprint", sa.String(255), nullable=False),
        sa.Column("device_name", sa.String(255), nullable=True),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_trusted_devices_device_fingerprint", "trusted_devices", ["device_fingerprint"])

    # ── login_events ─────────────────────────────────────────────────────────
    op.create_table(
        "login_events",
        sa.Column("id", mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid", sa.String(36), unique=True, nullable=False),
        sa.Column(
            "user_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text, nullable=True),
        sa.Column("device_name", sa.String(255), nullable=True),
        sa.Column(
            "status",
            sa.Enum("success", "failed", name="loginstatus"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_login_events_user_id", "login_events", ["user_id"])


def downgrade() -> None:
    op.drop_table("login_events")
    op.drop_table("trusted_devices")
    op.drop_column("users", "totp_enabled")
    op.drop_column("users", "totp_secret")
