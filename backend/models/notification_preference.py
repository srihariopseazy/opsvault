from sqlalchemy import Column, String, DateTime, ForeignKey, func
from sqlalchemy.dialects.mysql import TINYINT
from database import Base


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    uuid      = Column(String(36), primary_key=True, nullable=False)
    user_uuid = Column(
        String(36),
        ForeignKey("users.uuid", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    new_device_login       = Column(TINYINT(1), nullable=False, default=1)
    master_password_changed = Column(TINYINT(1), nullable=False, default=1)
    send_item_viewed       = Column(TINYINT(1), nullable=False, default=1)
    org_invites            = Column(TINYINT(1), nullable=False, default=1)
    emergency_access       = Column(TINYINT(1), nullable=False, default=1)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
