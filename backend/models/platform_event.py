import enum
from sqlalchemy import Column, String, Text, DateTime, Enum, ForeignKey, JSON, func
from sqlalchemy.orm import relationship
from database import Base


class PlatformEventType(str, enum.Enum):
    user_login          = "user_login"
    user_logout         = "user_logout"
    user_created        = "user_created"
    user_deleted        = "user_deleted"
    user_disabled       = "user_disabled"
    user_enabled        = "user_enabled"
    org_created         = "org_created"
    org_suspended       = "org_suspended"
    org_reactivated     = "org_reactivated"
    vault_item_created  = "vault_item_created"
    vault_item_deleted  = "vault_item_deleted"
    policy_changed      = "policy_changed"
    admin_impersonate   = "admin_impersonate"
    admin_login         = "admin_login"


class PlatformEvent(Base):
    __tablename__ = "platform_events"

    uuid = Column(String(36), primary_key=True, nullable=False)
    event_type = Column(
        Enum(PlatformEventType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        index=True,
    )
    actor_uuid = Column(
        String(36),
        ForeignKey("users.uuid", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    target_user_uuid = Column(
        String(36),
        ForeignKey("users.uuid", ondelete="SET NULL"),
        nullable=True,
    )
    target_org_uuid = Column(
        String(36),
        ForeignKey("organizations.uuid", ondelete="SET NULL"),
        nullable=True,
    )
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    event_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=func.now(), index=True)

    actor       = relationship("User", foreign_keys=[actor_uuid])
    target_user = relationship("User", foreign_keys=[target_user_uuid])
    target_org  = relationship("Organization", foreign_keys=[target_org_uuid])
