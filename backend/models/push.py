from sqlalchemy import Column, String, DateTime, ForeignKey, func
from sqlalchemy.dialects.mysql import BIGINT
from database import Base


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id         = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid       = Column(String(36), unique=True, nullable=False, index=True)
    user_id    = Column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    endpoint   = Column(String(2048), nullable=False)
    p256dh     = Column(String(512), nullable=False)
    auth       = Column(String(256), nullable=False)
    created_at = Column(DateTime, default=func.now())
