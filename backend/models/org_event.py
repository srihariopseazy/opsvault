import enum
from sqlalchemy import Column, String, Text, DateTime, Enum, ForeignKey, JSON, func
from sqlalchemy.orm import relationship
from database import Base


class OrgEventType(str, enum.Enum):
    member_invited            = "member_invited"
    member_joined             = "member_joined"
    member_removed            = "member_removed"
    member_role_changed       = "member_role_changed"
    collection_created        = "collection_created"
    collection_deleted        = "collection_deleted"
    policy_changed            = "policy_changed"
    item_shared_to_collection = "item_shared_to_collection"
    org_updated               = "org_updated"
    org_suspended             = "org_suspended"
    org_reactivated           = "org_reactivated"


class OrgEvent(Base):
    __tablename__ = "org_events"

    uuid = Column(String(36), primary_key=True, nullable=False)
    org_uuid = Column(
        String(36),
        ForeignKey("organizations.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # The user the event is about (nullable — some events are system-generated)
    user_uuid = Column(
        String(36),
        ForeignKey("users.uuid", ondelete="SET NULL"),
        nullable=True,
    )
    event_type = Column(
        Enum(OrgEventType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    # Who performed the action
    actor_uuid = Column(
        String(36),
        ForeignKey("users.uuid", ondelete="SET NULL"),
        nullable=True,
    )
    # UUID of the resource affected (member uuid, collection uuid, etc.)
    target_uuid = Column(String(36), nullable=True)
    ip_address  = Column(String(45), nullable=True)
    user_agent  = Column(Text, nullable=True)
    event_data  = Column(JSON, nullable=True)
    created_at  = Column(DateTime, default=func.now(), index=True)

    organization = relationship("Organization")
    actor        = relationship("User", foreign_keys=[actor_uuid])
