from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, JSON, func
from sqlalchemy.dialects.mysql import BIGINT, TINYINT
from database import Base


class Webhook(Base):
    __tablename__ = "webhooks"

    id         = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid       = Column(String(36), unique=True, nullable=False, index=True)
    user_id    = Column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    org_id     = Column(
        String(36),
        ForeignKey("organizations.uuid", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name       = Column(String(255), nullable=False)
    url        = Column(String(500), nullable=False)
    secret     = Column(String(255), nullable=False)
    events     = Column(JSON, nullable=False)
    is_active  = Column(TINYINT(1), nullable=False, default=1)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"

    id              = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid            = Column(String(36), unique=True, nullable=False, index=True)
    webhook_id      = Column(
        BIGINT(unsigned=True),
        ForeignKey("webhooks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type      = Column(String(100), nullable=False)
    payload         = Column(JSON, nullable=False)
    response_status = Column(Integer, nullable=True)
    response_body   = Column(Text, nullable=True)
    attempt_count   = Column(TINYINT(1), nullable=False, default=1)
    success         = Column(TINYINT(1), nullable=False, default=0)
    delivered_at    = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, default=func.now(), index=True)
