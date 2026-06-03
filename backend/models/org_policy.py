import enum
from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, JSON, func
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.orm import relationship
from database import Base


class OrgPolicyType(str, enum.Enum):
    two_factor_authentication = "two_factor_authentication"
    master_password_strength  = "master_password_strength"
    single_org                = "single_org"
    personal_vault_disabled   = "personal_vault_disabled"
    send_disabled             = "send_disabled"
    max_vault_timeout         = "max_vault_timeout"


class OrgPolicy(Base):
    __tablename__ = "org_policies"

    uuid = Column(String(36), primary_key=True, nullable=False)
    org_uuid = Column(
        String(36),
        ForeignKey("organizations.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    policy_type = Column(
        Enum(OrgPolicyType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    enabled = Column(TINYINT(1), default=0, nullable=False)
    # Extra config: { "min_strength": 3 } or { "timeout_minutes": 30 }
    policy_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    organization = relationship("Organization")
