import enum
from sqlalchemy import Column, String, Text, DateTime, Enum, ForeignKey, JSON, func
from sqlalchemy.dialects.mysql import BIGINT, TINYINT
from database import Base


class SsoProviderType(str, enum.Enum):
    saml = "saml"
    oidc = "oidc"


class SsoConfig(Base):
    __tablename__ = "sso_configs"

    id             = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid           = Column(String(36), unique=True, nullable=False, index=True)
    org_id         = Column(
        String(36),
        ForeignKey("organizations.uuid", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    provider_type  = Column(
        Enum(SsoProviderType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    is_active      = Column(TINYINT(1), nullable=False, default=0)

    # SAML fields
    saml_entity_id    = Column(String(500), nullable=True)
    saml_sso_url      = Column(String(500), nullable=True)
    saml_slo_url      = Column(String(500), nullable=True)
    saml_certificate  = Column(Text, nullable=True)
    saml_sp_entity_id = Column(String(500), nullable=True)
    saml_sp_acs_url   = Column(String(500), nullable=True)

    # OIDC fields
    oidc_client_id      = Column(String(255), nullable=True)
    oidc_client_secret  = Column(Text, nullable=True)
    oidc_discovery_url  = Column(String(500), nullable=True)
    oidc_scopes         = Column(String(255), nullable=True, default="openid email profile")
    oidc_redirect_uri   = Column(String(500), nullable=True)

    # Common
    attribute_mapping = Column(JSON, nullable=True)
    auto_provision    = Column(TINYINT(1), nullable=False, default=1)
    created_at        = Column(DateTime, default=func.now())
    updated_at        = Column(DateTime, default=func.now(), onupdate=func.now())


class SsoSession(Base):
    __tablename__ = "sso_sessions"

    id            = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid          = Column(String(36), unique=True, nullable=False, index=True)
    org_id        = Column(
        String(36),
        ForeignKey("organizations.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    state         = Column(String(255), nullable=False, unique=True, index=True)
    relay_state   = Column(String(500), nullable=True)
    provider_type = Column(
        Enum(SsoProviderType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    expires_at    = Column(DateTime, nullable=False)
    created_at    = Column(DateTime, default=func.now())
