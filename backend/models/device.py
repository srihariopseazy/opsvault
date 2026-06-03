import enum
from sqlalchemy import Column, String, DateTime, ForeignKey, Enum, func
from sqlalchemy.dialects.mysql import BIGINT, TINYINT
from database import Base


class DeviceStatus(str, enum.Enum):
    active  = "active"
    wiped   = "wiped"
    revoked = "revoked"


class Device(Base):
    __tablename__ = "devices"

    id                 = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid               = Column(String(36), unique=True, nullable=False, index=True)
    user_id            = Column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_fingerprint = Column(String(255), nullable=False, index=True)
    device_name        = Column(String(255), nullable=True)
    device_type        = Column(String(100), nullable=True)
    browser            = Column(String(100), nullable=True)
    os                 = Column(String(100), nullable=True)
    ip_address         = Column(String(45), nullable=True)
    is_trusted         = Column(TINYINT(1), nullable=False, default=0)
    last_used_at       = Column(DateTime, nullable=True)
    created_at         = Column(DateTime, default=func.now())

    # Phase 14: device management columns
    status       = Column(
        Enum(DeviceStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=DeviceStatus.active,
    )
    wiped_at     = Column(DateTime, nullable=True)
    wiped_by     = Column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    last_seen_ip = Column(String(45), nullable=True)
    push_token   = Column(String(500), nullable=True)
