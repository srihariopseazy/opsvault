"""Phase 19: Refresh token rotation - track current/previous refresh jti per session

Revision ID: 018
Revises: 017
Create Date: 2026-09-23 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing sessions never persisted a refresh token jti (it was minted and
    # discarded), so they cannot be validated under the new rotation scheme -
    # clear them out before adding the NOT NULL column. This forces one global
    # re-login, which is expected/flagged as part of this change.
    op.execute("DELETE FROM sessions")

    op.add_column("sessions", sa.Column("refresh_jti", sa.String(255), nullable=False))
    op.add_column("sessions", sa.Column("previous_refresh_jti", sa.String(255), nullable=True))
    op.create_unique_constraint("uq_sessions_refresh_jti", "sessions", ["refresh_jti"])
    op.create_unique_constraint("uq_sessions_previous_refresh_jti", "sessions", ["previous_refresh_jti"])


def downgrade() -> None:
    op.drop_constraint("uq_sessions_previous_refresh_jti", "sessions", type_="unique")
    op.drop_constraint("uq_sessions_refresh_jti", "sessions", type_="unique")
    op.drop_column("sessions", "previous_refresh_jti")
    op.drop_column("sessions", "refresh_jti")
