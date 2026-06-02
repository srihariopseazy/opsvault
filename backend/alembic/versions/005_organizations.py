"""Phase 5 organizations, collections and sharing

Revision ID: 005
Revises: 004
Create Date: 2024-01-05 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── organizations ────────────────────────────────────────────────────────
    op.create_table(
        "organizations",
        sa.Column("id", mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid", sa.String(36), unique=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "owner_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_organizations_uuid", "organizations", ["uuid"])

    # ── org_members ──────────────────────────────────────────────────────────
    op.create_table(
        "org_members",
        sa.Column("id", mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid", sa.String(36), unique=True, nullable=False),
        sa.Column(
            "org_id",
            sa.String(36),
            sa.ForeignKey("organizations.uuid", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role",
            sa.Enum("owner", "admin", "member", name="orgmemberrole"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("invited", "accepted", "rejected", name="orgmemberstatus"),
            nullable=False,
            server_default="invited",
        ),
        sa.Column("invited_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("accepted_at", sa.DateTime, nullable=True),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_org_members_org_id", "org_members", ["org_id"])
    op.create_index("ix_org_members_user_id", "org_members", ["user_id"])

    # ── collections ──────────────────────────────────────────────────────────
    op.create_table(
        "collections",
        sa.Column("id", mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid", sa.String(36), unique=True, nullable=False),
        sa.Column(
            "org_id",
            sa.String(36),
            sa.ForeignKey("organizations.uuid", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_collections_org_id", "collections", ["org_id"])

    # ── collection_members ────────────────────────────────────────────────────
    op.create_table(
        "collection_members",
        sa.Column("id", mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid", sa.String(36), unique=True, nullable=False),
        sa.Column(
            "collection_id",
            sa.String(36),
            sa.ForeignKey("collections.uuid", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "access",
            sa.Enum("read", "write", name="collectionaccess"),
            nullable=False,
            server_default="read",
        ),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_collection_members_collection_id", "collection_members", ["collection_id"])

    # ── collection_items ──────────────────────────────────────────────────────
    op.create_table(
        "collection_items",
        sa.Column("id", mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid", sa.String(36), unique=True, nullable=False),
        sa.Column(
            "collection_id",
            sa.String(36),
            sa.ForeignKey("collections.uuid", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "item_id",
            sa.String(36),
            sa.ForeignKey("vault_items.uuid", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("added_at", sa.DateTime, server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_collection_items_collection_id", "collection_items", ["collection_id"])


def downgrade() -> None:
    op.drop_table("collection_items")
    op.drop_table("collection_members")
    op.drop_table("collections")
    op.drop_table("org_members")
    op.drop_table("organizations")
