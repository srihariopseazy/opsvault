"""Phase 8: SMTP config, email log, notification preferences

Revision ID: 008
Revises: 007
Create Date: 2024-01-08 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── smtp_configs ──────────────────────────────────────────────────────────
    op.create_table(
        "smtp_configs",
        sa.Column("uuid",       sa.String(36), primary_key=True, nullable=False),
        sa.Column("host",       sa.String(255), nullable=False, server_default=""),
        sa.Column("port",       sa.Integer,    nullable=False, server_default="587"),
        sa.Column("username",   sa.String(255), nullable=False, server_default=""),
        sa.Column("password",   sa.String(255), nullable=False, server_default=""),
        sa.Column("from_email", sa.String(255), nullable=False, server_default=""),
        sa.Column("from_name",  sa.String(100), nullable=False, server_default="OPSVAULT"),
        sa.Column("use_tls",    mysql.TINYINT(1), nullable=False, server_default="1"),
        sa.Column("use_ssl",    mysql.TINYINT(1), nullable=False, server_default="0"),
        sa.Column("enabled",    mysql.TINYINT(1), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )

    # ── email_logs ────────────────────────────────────────────────────────────
    op.create_table(
        "email_logs",
        sa.Column("uuid",          sa.String(36),  primary_key=True, nullable=False),
        sa.Column("to_email",      sa.String(255), nullable=False),
        sa.Column("subject",       sa.String(500), nullable=False),
        sa.Column("template",      sa.String(100), nullable=False),
        sa.Column(
            "status",
            sa.Enum("sent", "failed", "skipped", name="emailstatus"),
            nullable=False,
        ),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column(
            "user_uuid",
            sa.String(36),
            sa.ForeignKey("users.uuid", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_email_logs_created_at", "email_logs", ["created_at"])
    op.create_index("ix_email_logs_status",     "email_logs", ["status"])
    op.create_index("ix_email_logs_user_uuid",  "email_logs", ["user_uuid"])

    # ── notification_preferences ──────────────────────────────────────────────
    op.create_table(
        "notification_preferences",
        sa.Column("uuid",      sa.String(36), primary_key=True, nullable=False),
        sa.Column(
            "user_uuid",
            sa.String(36),
            sa.ForeignKey("users.uuid", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("new_device_login",        mysql.TINYINT(1), nullable=False, server_default="1"),
        sa.Column("master_password_changed", mysql.TINYINT(1), nullable=False, server_default="1"),
        sa.Column("send_item_viewed",        mysql.TINYINT(1), nullable=False, server_default="1"),
        sa.Column("org_invites",             mysql.TINYINT(1), nullable=False, server_default="1"),
        sa.Column("emergency_access",        mysql.TINYINT(1), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_notif_prefs_user_uuid", "notification_preferences", ["user_uuid"])


def downgrade() -> None:
    op.drop_table("notification_preferences")
    op.drop_index("ix_email_logs_user_uuid",  "email_logs")
    op.drop_index("ix_email_logs_status",     "email_logs")
    op.drop_index("ix_email_logs_created_at", "email_logs")
    op.drop_table("email_logs")
    op.drop_table("smtp_configs")
