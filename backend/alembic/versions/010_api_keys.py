"""Phase 10: API keys for personal and org access

Revision ID: 010
Revises: 009
Create Date: 2024-01-10 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── api_keys (personal) ───────────────────────────────────────────────────
    op.create_table(
        "api_keys",
        sa.Column("id",           mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid",         sa.String(36),  nullable=False),
        sa.Column(
            "user_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name",         sa.String(255), nullable=False),
        sa.Column("key_prefix",   sa.String(16),  nullable=False),
        sa.Column("key_hash",     sa.String(255), nullable=False),
        sa.Column("scopes",       sa.JSON,        nullable=False),
        sa.Column("expires_at",   sa.DateTime,    nullable=True),
        sa.Column("last_used_at", sa.DateTime,    nullable=True),
        sa.Column("last_used_ip", sa.String(45),  nullable=True),
        sa.Column("is_active",    mysql.TINYINT(1), nullable=False, server_default="1"),
        sa.Column("created_at",   sa.DateTime,    server_default=sa.func.now()),
        sa.Column("updated_at",   sa.DateTime,    server_default=sa.func.now(), onupdate=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_api_keys_uuid",       "api_keys", ["uuid"],       unique=True)
    op.create_index("ix_api_keys_user_id",    "api_keys", ["user_id"])
    op.create_index("ix_api_keys_key_prefix", "api_keys", ["key_prefix"])

    # ── org_api_keys ──────────────────────────────────────────────────────────
    op.create_table(
        "org_api_keys",
        sa.Column("id",           mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid",         sa.String(36),  nullable=False),
        sa.Column(
            "org_id",
            sa.String(36),
            sa.ForeignKey("organizations.uuid", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name",         sa.String(255), nullable=False),
        sa.Column("key_prefix",   sa.String(16),  nullable=False),
        sa.Column("key_hash",     sa.String(255), nullable=False),
        sa.Column("scopes",       sa.JSON,        nullable=False),
        sa.Column("expires_at",   sa.DateTime,    nullable=True),
        sa.Column("last_used_at", sa.DateTime,    nullable=True),
        sa.Column("last_used_ip", sa.String(45),  nullable=True),
        sa.Column("is_active",    mysql.TINYINT(1), nullable=False, server_default="1"),
        sa.Column("created_at",   sa.DateTime,    server_default=sa.func.now()),
        sa.Column("updated_at",   sa.DateTime,    server_default=sa.func.now(), onupdate=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_org_api_keys_uuid",       "org_api_keys", ["uuid"],       unique=True)
    op.create_index("ix_org_api_keys_org_id",     "org_api_keys", ["org_id"])
    op.create_index("ix_org_api_keys_created_by", "org_api_keys", ["created_by"])
    op.create_index("ix_org_api_keys_key_prefix", "org_api_keys", ["key_prefix"])


def downgrade() -> None:
    op.drop_index("ix_org_api_keys_key_prefix", "org_api_keys")
    op.drop_index("ix_org_api_keys_created_by", "org_api_keys")
    op.drop_index("ix_org_api_keys_org_id",     "org_api_keys")
    op.drop_index("ix_org_api_keys_uuid",        "org_api_keys")
    op.drop_table("org_api_keys")

    op.drop_index("ix_api_keys_key_prefix", "api_keys")
    op.drop_index("ix_api_keys_user_id",    "api_keys")
    op.drop_index("ix_api_keys_uuid",       "api_keys")
    op.drop_table("api_keys")
