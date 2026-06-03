"""Phase 9: Scheduled reports and report logs

Revision ID: 009
Revises: 008
Create Date: 2024-01-09 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── scheduled_reports ────────────────────────────────────────────────────
    op.create_table(
        "scheduled_reports",
        sa.Column("uuid",       sa.String(36), primary_key=True, nullable=False),
        sa.Column(
            "user_uuid",
            sa.String(36),
            sa.ForeignKey("users.uuid", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "report_type",
            sa.Enum(
                "vault_health", "breach_check", "inactive_users", "full_audit",
                name="reporttype",
            ),
            nullable=False,
        ),
        sa.Column(
            "frequency",
            sa.Enum("daily", "weekly", "monthly", name="reportfrequency"),
            nullable=False,
        ),
        sa.Column("enabled",         mysql.TINYINT(1), nullable=False, server_default="1"),
        sa.Column("last_sent_at",    sa.DateTime, nullable=True),
        sa.Column("next_send_at",    sa.DateTime, nullable=False),
        sa.Column("recipient_email", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_scheduled_reports_user_uuid",      "scheduled_reports", ["user_uuid"])
    op.create_index("ix_scheduled_reports_next_send_at",   "scheduled_reports", ["next_send_at"])

    # ── report_logs ───────────────────────────────────────────────────────────
    op.create_table(
        "report_logs",
        sa.Column("uuid",      sa.String(36), primary_key=True, nullable=False),
        sa.Column(
            "user_uuid",
            sa.String(36),
            sa.ForeignKey("users.uuid", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "report_type",
            sa.Enum(
                "vault_health", "breach_check", "inactive_users", "full_audit",
                name="reporttype",
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("generated", "sent", "failed", name="reportstatus"),
            nullable=False,
        ),
        sa.Column("file_size",     sa.Integer, nullable=True),
        sa.Column("error_message", sa.Text,    nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_report_logs_user_uuid",  "report_logs", ["user_uuid"])
    op.create_index("ix_report_logs_created_at", "report_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_report_logs_created_at", "report_logs")
    op.drop_index("ix_report_logs_user_uuid",  "report_logs")
    op.drop_table("report_logs")
    op.drop_index("ix_scheduled_reports_next_send_at", "scheduled_reports")
    op.drop_index("ix_scheduled_reports_user_uuid",    "scheduled_reports")
    op.drop_table("scheduled_reports")
