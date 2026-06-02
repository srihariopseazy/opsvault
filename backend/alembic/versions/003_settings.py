"""Phase 3 settings — no schema changes required

Revision ID: 003
Revises: 002
Create Date: 2024-01-03 00:00:00.000000
"""
from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Phase 3 introduces settings/logout-all and settings/account-delete.
    # Both operate on existing tables; no schema changes are needed.
    op.execute("SELECT 1")


def downgrade() -> None:
    op.execute("SELECT 1")
