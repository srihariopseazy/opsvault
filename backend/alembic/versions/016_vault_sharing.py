"""Phase 16: Vault sharing — vault_shares + user_public_keys tables

Revision ID: 016
Revises: 015
Create Date: 2024-01-16 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_public_keys",
        sa.Column("id",         mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("user_id",    mysql.BIGINT(unsigned=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("public_key", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_unique_index("ix_user_public_keys_user_id", "user_public_keys", ["user_id"])

    op.create_table(
        "vault_shares",
        sa.Column("id",   mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid", sa.String(36), nullable=False),
        sa.Column("sharer_id",       mysql.BIGINT(unsigned=True),
                  sa.ForeignKey("users.id",       ondelete="CASCADE"), nullable=False),
        sa.Column("recipient_id",    mysql.BIGINT(unsigned=True),
                  sa.ForeignKey("users.id",       ondelete="CASCADE"), nullable=True),
        sa.Column("recipient_email", sa.String(255), nullable=False),
        sa.Column("vault_item_id",   mysql.BIGINT(unsigned=True),
                  sa.ForeignKey("vault_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("encrypted_item_data", sa.Text, nullable=False),
        sa.Column("encrypted_item_key",  sa.Text, nullable=False),
        sa.Column(
            "permissions",
            sa.Enum("view", "edit", name="sharepermission"),
            nullable=False,
            server_default="view",
        ),
        sa.Column(
            "status",
            sa.Enum("pending", "accepted", "declined", "expired", "revoked", name="sharestatus"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("message",     sa.Text,     nullable=True),
        sa.Column("expires_at",  sa.DateTime, nullable=True),
        sa.Column("accepted_at", sa.DateTime, nullable=True),
        sa.Column("created_at",  sa.DateTime, server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_unique_index("ix_vault_shares_uuid",           "vault_shares", ["uuid"])
    op.create_index("ix_vault_shares_sharer_id",             "vault_shares", ["sharer_id"])
    op.create_index("ix_vault_shares_recipient_id",          "vault_shares", ["recipient_id"])
    op.create_index("ix_vault_shares_recipient_email",       "vault_shares", ["recipient_email"])
    op.create_index("ix_vault_shares_status",                "vault_shares", ["status"])


def downgrade() -> None:
    op.drop_index("ix_vault_shares_status",          "vault_shares")
    op.drop_index("ix_vault_shares_recipient_email", "vault_shares")
    op.drop_index("ix_vault_shares_recipient_id",    "vault_shares")
    op.drop_index("ix_vault_shares_sharer_id",       "vault_shares")
    op.drop_index("ix_vault_shares_uuid",            "vault_shares")
    op.drop_table("vault_shares")
    op.drop_index("ix_user_public_keys_user_id",     "user_public_keys")
    op.drop_table("user_public_keys")
