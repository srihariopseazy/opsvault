"""Phase 14: Device management — create devices table

Revision ID: 014
Revises: 013
Create Date: 2024-01-14 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "devices",
        sa.Column("id",    mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid",  sa.String(36), nullable=False),
        sa.Column(
            "user_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("device_fingerprint", sa.String(255), nullable=False),
        sa.Column("device_name",        sa.String(255), nullable=True),
        sa.Column("device_type",        sa.String(100), nullable=True),
        sa.Column("browser",            sa.String(100), nullable=True),
        sa.Column("os",                 sa.String(100), nullable=True),
        sa.Column("ip_address",         sa.String(45),  nullable=True),
        sa.Column("is_trusted", mysql.TINYINT(1), nullable=False, server_default="0"),
        sa.Column("last_used_at", sa.DateTime, nullable=True),
        sa.Column("created_at",   sa.DateTime, server_default=sa.func.now()),
        # Phase 14 columns
        sa.Column(
            "status",
            sa.Enum("active", "wiped", "revoked", name="devicestatus"),
            nullable=False,
            server_default="active",
        ),
        sa.Column("wiped_at",     sa.DateTime,    nullable=True),
        sa.Column(
            "wiped_by",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("last_seen_ip", sa.String(45),  nullable=True),
        sa.Column("push_token",   sa.String(500), nullable=True),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_devices_uuid",               "devices", ["uuid"],               unique=True)
    op.create_index("ix_devices_user_id",            "devices", ["user_id"])
    op.create_index("ix_devices_device_fingerprint", "devices", ["device_fingerprint"])
    op.create_index("ix_devices_status",             "devices", ["status"])


def downgrade() -> None:
    op.drop_index("ix_devices_status",             "devices")
    op.drop_index("ix_devices_device_fingerprint", "devices")
    op.drop_index("ix_devices_user_id",            "devices")
    op.drop_index("ix_devices_uuid",               "devices")
    op.drop_table("devices")
