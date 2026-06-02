"""Add folders table and folder_uuid to vault_items

Revision ID: 002
Revises: 001
Create Date: 2024-01-02 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "folders",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("uuid", sa.String(36), nullable=False),
        sa.Column("user_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("uuid"),
    )
    op.create_index("ix_folders_user_id", "folders", ["user_id"])

    op.add_column(
        "vault_items",
        sa.Column("folder_uuid", sa.String(36), nullable=True),
    )
    op.create_index("ix_vault_items_folder_uuid", "vault_items", ["folder_uuid"])
    op.create_foreign_key(
        "fk_vault_items_folder_uuid",
        "vault_items",
        "folders",
        ["folder_uuid"],
        ["uuid"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_vault_items_folder_uuid", "vault_items", type_="foreignkey")
    op.drop_index("ix_vault_items_folder_uuid", table_name="vault_items")
    op.drop_column("vault_items", "folder_uuid")
    op.drop_index("ix_folders_user_id", table_name="folders")
    op.drop_table("folders")
