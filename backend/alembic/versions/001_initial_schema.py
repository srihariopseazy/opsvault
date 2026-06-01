"""Initial schema

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("uuid", sa.String(36), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("master_password_hash", sa.String(255), nullable=False),
        sa.Column("protected_symmetric_key", sa.Text(), nullable=False),
        sa.Column("kdf_iterations", sa.Integer(), nullable=True, server_default="600000"),
        sa.Column("master_password_hint", sa.String(255), nullable=True),
        sa.Column("email_verified", mysql.TINYINT(1), nullable=True, server_default="0"),
        sa.Column("is_active", mysql.TINYINT(1), nullable=True, server_default="1"),
        sa.Column("is_superuser", mysql.TINYINT(1), nullable=True, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("uuid"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "vault_items",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("uuid", sa.String(36), nullable=False),
        sa.Column("user_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("type", sa.Enum("login", "note", "card", "identity"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("favorite", mysql.TINYINT(1), nullable=True, server_default="0"),
        sa.Column("folder_id", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column("item_data", sa.JSON(), nullable=False),
        sa.Column("custom_fields", sa.JSON(), nullable=True),
        sa.Column("password_history", sa.JSON(), nullable=True),
        sa.Column("reprompt", mysql.TINYINT(1), nullable=True, server_default="0"),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")),
        sa.Column("revision_date", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("uuid"),
    )
    op.create_index("ix_vault_items_user_id", "vault_items", ["user_id"])
    op.create_index("ix_vault_items_deleted_at", "vault_items", ["deleted_at"])

    op.create_table(
        "sessions",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("uuid", sa.String(36), nullable=False),
        sa.Column("user_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("jti", sa.String(255), nullable=False),
        sa.Column("device_name", sa.String(255), nullable=True),
        sa.Column("device_type", sa.String(100), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("is_active", mysql.TINYINT(1), nullable=True, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("uuid"),
        sa.UniqueConstraint("jti"),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("uuid", sa.String(36), nullable=False),
        sa.Column("user_id", mysql.BIGINT(unsigned=True), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("target_type", sa.String(100), nullable=True),
        sa.Column("target_id", sa.String(36), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("extra_details", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("uuid"),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])

    op.create_table(
        "rate_limit_attempts",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("key_hash", sa.String(255), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("window_start", sa.DateTime(), nullable=True),
        sa.Column("blocked_until", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_rate_limit_key_hash", "rate_limit_attempts", ["key_hash"])


def downgrade() -> None:
    op.drop_table("rate_limit_attempts")
    op.drop_table("audit_logs")
    op.drop_table("sessions")
    op.drop_table("vault_items")
    op.drop_table("users")
