"""Phase 13: SSO/SAML 2.0 + OIDC and Directory Sync

Revision ID: 013
Revises: 012
Create Date: 2024-01-13 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── sso_configs ───────────────────────────────────────────────────────────
    op.create_table(
        "sso_configs",
        sa.Column("id",    mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid",  sa.String(36), nullable=False),
        sa.Column(
            "org_id",
            sa.String(36),
            sa.ForeignKey("organizations.uuid", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "provider_type",
            sa.Enum("saml", "oidc", name="ssoprovidertype"),
            nullable=False,
        ),
        sa.Column("is_active",      mysql.TINYINT(1), nullable=False, server_default="0"),
        sa.Column("saml_entity_id",    sa.String(500), nullable=True),
        sa.Column("saml_sso_url",      sa.String(500), nullable=True),
        sa.Column("saml_slo_url",      sa.String(500), nullable=True),
        sa.Column("saml_certificate",  sa.Text,        nullable=True),
        sa.Column("saml_sp_entity_id", sa.String(500), nullable=True),
        sa.Column("saml_sp_acs_url",   sa.String(500), nullable=True),
        sa.Column("oidc_client_id",     sa.String(255), nullable=True),
        sa.Column("oidc_client_secret", sa.Text,        nullable=True),
        sa.Column("oidc_discovery_url", sa.String(500), nullable=True),
        sa.Column("oidc_scopes",        sa.String(255), nullable=True, server_default="openid email profile"),
        sa.Column("oidc_redirect_uri",  sa.String(500), nullable=True),
        sa.Column("attribute_mapping",  sa.JSON,        nullable=True),
        sa.Column("auto_provision",  mysql.TINYINT(1), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_sso_configs_uuid",   "sso_configs", ["uuid"],   unique=True)
    op.create_index("ix_sso_configs_org_id", "sso_configs", ["org_id"], unique=True)

    # ── sso_sessions ──────────────────────────────────────────────────────────
    op.create_table(
        "sso_sessions",
        sa.Column("id",    mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid",  sa.String(36), nullable=False),
        sa.Column(
            "org_id",
            sa.String(36),
            sa.ForeignKey("organizations.uuid", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("state",         sa.String(255), nullable=False),
        sa.Column("relay_state",   sa.String(500), nullable=True),
        sa.Column(
            "provider_type",
            sa.Enum("saml", "oidc", name="ssoprovidertype"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_sso_sessions_uuid",   "sso_sessions", ["uuid"],  unique=True)
    op.create_index("ix_sso_sessions_state",  "sso_sessions", ["state"], unique=True)
    op.create_index("ix_sso_sessions_org_id", "sso_sessions", ["org_id"])

    # ── directory_configs ─────────────────────────────────────────────────────
    op.create_table(
        "directory_configs",
        sa.Column("id",    mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid",  sa.String(36), nullable=False),
        sa.Column(
            "org_id",
            sa.String(36),
            sa.ForeignKey("organizations.uuid", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "sync_type",
            sa.Enum("ldap", "azure_ad", "google_workspace", "csv", name="directorysynctype"),
            nullable=False,
        ),
        sa.Column("is_active",    mysql.TINYINT(1), nullable=False, server_default="0"),
        sa.Column("ldap_host",         sa.String(255), nullable=True),
        sa.Column("ldap_port",         sa.Integer,     nullable=True),
        sa.Column("ldap_bind_dn",      sa.String(500), nullable=True),
        sa.Column("ldap_bind_password",sa.Text,        nullable=True),
        sa.Column("ldap_base_dn",      sa.String(500), nullable=True),
        sa.Column("ldap_user_filter",  sa.String(255), nullable=True),
        sa.Column("ldap_use_ssl",      mysql.TINYINT(1), nullable=False, server_default="0"),
        sa.Column("azure_tenant_id",     sa.String(255), nullable=True),
        sa.Column("azure_client_id",     sa.String(255), nullable=True),
        sa.Column("azure_client_secret", sa.Text,        nullable=True),
        sa.Column("azure_group_filter",  sa.String(255), nullable=True),
        sa.Column("google_domain",               sa.String(255), nullable=True),
        sa.Column("google_admin_email",          sa.String(255), nullable=True),
        sa.Column("google_service_account_key",  sa.Text,        nullable=True),
        sa.Column("sync_interval_hours", sa.Integer, nullable=False, server_default="24"),
        sa.Column("last_synced_at",      sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_directory_configs_uuid",   "directory_configs", ["uuid"],   unique=True)
    op.create_index("ix_directory_configs_org_id", "directory_configs", ["org_id"], unique=True)

    # ── directory_sync_logs ───────────────────────────────────────────────────
    op.create_table(
        "directory_sync_logs",
        sa.Column("id",    mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid",  sa.String(36), nullable=False),
        sa.Column(
            "config_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("directory_configs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("success", "partial", "failed", name="directorysyncstatus"),
            nullable=False,
        ),
        sa.Column("users_added",       sa.Integer, nullable=False, server_default="0"),
        sa.Column("users_updated",     sa.Integer, nullable=False, server_default="0"),
        sa.Column("users_deactivated", sa.Integer, nullable=False, server_default="0"),
        sa.Column("errors",       sa.JSON,     nullable=True),
        sa.Column("started_at",   sa.DateTime, nullable=False),
        sa.Column("completed_at", sa.DateTime, nullable=True),
        sa.Column("created_at",   sa.DateTime, server_default=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_directory_sync_logs_uuid",      "directory_sync_logs", ["uuid"],      unique=True)
    op.create_index("ix_directory_sync_logs_config_id", "directory_sync_logs", ["config_id"])
    op.create_index("ix_directory_sync_logs_created_at","directory_sync_logs", ["created_at"])

    # ── directory_sync_users ──────────────────────────────────────────────────
    op.create_table(
        "directory_sync_users",
        sa.Column("id",    mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("uuid",  sa.String(36), nullable=False),
        sa.Column(
            "config_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("directory_configs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("external_id",  sa.String(255), nullable=False),
        sa.Column("email",        sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=True),
        sa.Column(
            "user_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.Enum("active", "deactivated", name="directoryuserstatus"),
            nullable=False,
            server_default="active",
        ),
        sa.Column("last_seen_at", sa.DateTime, nullable=True),
        sa.Column("created_at",   sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at",   sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now()),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
    )
    op.create_index("ix_directory_sync_users_uuid",      "directory_sync_users", ["uuid"],      unique=True)
    op.create_index("ix_directory_sync_users_config_id", "directory_sync_users", ["config_id"])
    op.create_index("ix_directory_sync_users_email",     "directory_sync_users", ["email"])
    op.create_index("ix_directory_sync_users_user_id",   "directory_sync_users", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_directory_sync_users_user_id",   "directory_sync_users")
    op.drop_index("ix_directory_sync_users_email",     "directory_sync_users")
    op.drop_index("ix_directory_sync_users_config_id", "directory_sync_users")
    op.drop_index("ix_directory_sync_users_uuid",      "directory_sync_users")
    op.drop_table("directory_sync_users")

    op.drop_index("ix_directory_sync_logs_created_at", "directory_sync_logs")
    op.drop_index("ix_directory_sync_logs_config_id",  "directory_sync_logs")
    op.drop_index("ix_directory_sync_logs_uuid",       "directory_sync_logs")
    op.drop_table("directory_sync_logs")

    op.drop_index("ix_directory_configs_org_id", "directory_configs")
    op.drop_index("ix_directory_configs_uuid",   "directory_configs")
    op.drop_table("directory_configs")

    op.drop_index("ix_sso_sessions_org_id", "sso_sessions")
    op.drop_index("ix_sso_sessions_state",  "sso_sessions")
    op.drop_index("ix_sso_sessions_uuid",   "sso_sessions")
    op.drop_table("sso_sessions")

    op.drop_index("ix_sso_configs_org_id", "sso_configs")
    op.drop_index("ix_sso_configs_uuid",   "sso_configs")
    op.drop_table("sso_configs")
