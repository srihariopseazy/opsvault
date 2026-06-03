"""Phase 7 admin console, org policies, org events, platform events

Revision ID: 007
Revises: 006
Create Date: 2024-01-07 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── organizations: add is_suspended ──────────────────────────────────────
    op.add_column(
        "organizations",
        sa.Column("is_suspended", mysql.TINYINT(1), nullable=False, server_default="0"),
    )

    # ── org_policies ─────────────────────────────────────────────────────────
    op.create_table(
        "org_policies",
        sa.Column("uuid", sa.String(36), primary_key=True, nullable=False),
        sa.Column(
            "org_uuid",
            sa.String(36),
            sa.ForeignKey("organizations.uuid", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "policy_type",
            sa.Enum(
                "two_factor_authentication",
                "master_password_strength",
                "single_org",
                "personal_vault_disabled",
                "send_disabled",
                "max_vault_timeout",
                name="orgpolicytype",
            ),
            nullable=False,
        ),
        sa.Column("enabled", mysql.TINYINT(1), nullable=False, server_default="0"),
        sa.Column("policy_data", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
        sa.UniqueConstraint("org_uuid", "policy_type", name="uq_org_policy"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_org_policies_org_uuid", "org_policies", ["org_uuid"])

    # ── org_events ────────────────────────────────────────────────────────────
    op.create_table(
        "org_events",
        sa.Column("uuid", sa.String(36), primary_key=True, nullable=False),
        sa.Column(
            "org_uuid",
            sa.String(36),
            sa.ForeignKey("organizations.uuid", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_uuid",
            sa.String(36),
            sa.ForeignKey("users.uuid", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "event_type",
            sa.Enum(
                "member_invited", "member_joined", "member_removed",
                "member_role_changed", "collection_created", "collection_deleted",
                "policy_changed", "item_shared_to_collection", "org_updated",
                "org_suspended", "org_reactivated",
                name="orgeventtype",
            ),
            nullable=False,
        ),
        sa.Column(
            "actor_uuid",
            sa.String(36),
            sa.ForeignKey("users.uuid", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("target_uuid", sa.String(36), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text, nullable=True),
        sa.Column("event_data", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_org_events_org_uuid_created",
                    "org_events", ["org_uuid", "created_at"])

    # ── platform_events ───────────────────────────────────────────────────────
    op.create_table(
        "platform_events",
        sa.Column("uuid", sa.String(36), primary_key=True, nullable=False),
        sa.Column(
            "event_type",
            sa.Enum(
                "user_login", "user_logout", "user_created", "user_deleted",
                "user_disabled", "user_enabled", "org_created", "org_suspended",
                "org_reactivated", "vault_item_created", "vault_item_deleted",
                "policy_changed", "admin_impersonate", "admin_login",
                name="platformeventtype",
            ),
            nullable=False,
        ),
        sa.Column(
            "actor_uuid",
            sa.String(36),
            sa.ForeignKey("users.uuid", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "target_user_uuid",
            sa.String(36),
            sa.ForeignKey("users.uuid", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "target_org_uuid",
            sa.String(36),
            sa.ForeignKey("organizations.uuid", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text, nullable=True),
        sa.Column("event_data", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_platform_events_created_at",
                    "platform_events", ["created_at"])
    op.create_index("ix_platform_events_actor_uuid",
                    "platform_events", ["actor_uuid"])
    op.create_index("ix_platform_events_event_type",
                    "platform_events", ["event_type"])


def downgrade() -> None:
    op.drop_table("platform_events")
    op.drop_table("org_events")
    op.drop_table("org_policies")
    op.drop_column("organizations", "is_suspended")
