"""Phase 12: Custom fields as encrypted TEXT and per-item TOTP secret column

Revision ID: 012
Revises: 011
Create Date: 2024-01-12 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Change custom_fields from JSON to TEXT (stores encrypted JSON string)
    op.alter_column(
        "vault_items",
        "custom_fields",
        existing_type=sa.JSON(),
        type_=sa.Text(),
        existing_nullable=True,
        nullable=True,
    )

    # Add dedicated encrypted TOTP seed column
    op.add_column(
        "vault_items",
        sa.Column("totp_secret", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("vault_items", "totp_secret")
    op.alter_column(
        "vault_items",
        "custom_fields",
        existing_type=sa.Text(),
        type_=sa.JSON(),
        existing_nullable=True,
        nullable=True,
    )
