import enum
from sqlalchemy import Column, String, Text, Integer, DateTime, Enum, ForeignKey, JSON, func
from sqlalchemy.dialects.mysql import BIGINT, TINYINT
from database import Base


class DirectorySyncType(str, enum.Enum):
    ldap             = "ldap"
    azure_ad         = "azure_ad"
    google_workspace = "google_workspace"
    csv              = "csv"


class DirectorySyncStatus(str, enum.Enum):
    success = "success"
    partial = "partial"
    failed  = "failed"


class DirectoryUserStatus(str, enum.Enum):
    active      = "active"
    deactivated = "deactivated"


class DirectoryConfig(Base):
    __tablename__ = "directory_configs"

    id         = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid       = Column(String(36), unique=True, nullable=False, index=True)
    org_id     = Column(
        String(36),
        ForeignKey("organizations.uuid", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    sync_type  = Column(
        Enum(DirectorySyncType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    is_active  = Column(TINYINT(1), nullable=False, default=0)

    # LDAP fields
    ldap_host        = Column(String(255), nullable=True)
    ldap_port        = Column(Integer, nullable=True, default=389)
    ldap_bind_dn     = Column(String(500), nullable=True)
    ldap_bind_password = Column(Text, nullable=True)
    ldap_base_dn     = Column(String(500), nullable=True)
    ldap_user_filter = Column(String(255), nullable=True, default="(objectClass=person)")
    ldap_use_ssl     = Column(TINYINT(1), nullable=False, default=0)

    # Azure AD fields
    azure_tenant_id      = Column(String(255), nullable=True)
    azure_client_id      = Column(String(255), nullable=True)
    azure_client_secret  = Column(Text, nullable=True)
    azure_group_filter   = Column(String(255), nullable=True)

    # Google Workspace fields
    google_domain              = Column(String(255), nullable=True)
    google_admin_email         = Column(String(255), nullable=True)
    google_service_account_key = Column(Text, nullable=True)

    # Common
    sync_interval_hours = Column(Integer, nullable=False, default=24)
    last_synced_at      = Column(DateTime, nullable=True)
    created_at          = Column(DateTime, default=func.now())
    updated_at          = Column(DateTime, default=func.now(), onupdate=func.now())


class DirectorySyncLog(Base):
    __tablename__ = "directory_sync_logs"

    id                = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid              = Column(String(36), unique=True, nullable=False, index=True)
    config_id         = Column(
        BIGINT(unsigned=True),
        ForeignKey("directory_configs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status            = Column(
        Enum(DirectorySyncStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    users_added       = Column(Integer, nullable=False, default=0)
    users_updated     = Column(Integer, nullable=False, default=0)
    users_deactivated = Column(Integer, nullable=False, default=0)
    errors            = Column(JSON, nullable=True)
    started_at        = Column(DateTime, nullable=False)
    completed_at      = Column(DateTime, nullable=True)
    created_at        = Column(DateTime, default=func.now(), index=True)


class DirectorySyncUser(Base):
    __tablename__ = "directory_sync_users"

    id           = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid         = Column(String(36), unique=True, nullable=False, index=True)
    config_id    = Column(
        BIGINT(unsigned=True),
        ForeignKey("directory_configs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    external_id  = Column(String(255), nullable=False)
    email        = Column(String(255), nullable=False, index=True)
    display_name = Column(String(255), nullable=True)
    user_id      = Column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status       = Column(
        Enum(DirectoryUserStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=DirectoryUserStatus.active,
    )
    last_seen_at = Column(DateTime, nullable=True)
    created_at   = Column(DateTime, default=func.now())
    updated_at   = Column(DateTime, default=func.now(), onupdate=func.now())
