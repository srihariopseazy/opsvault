import enum
from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, Integer, func
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from database import Base


class EmergencyAccessType(str, enum.Enum):
    view = "view"
    takeover = "takeover"


class EmergencyAccessStatus(str, enum.Enum):
    invited = "invited"
    accepted = "accepted"
    rejected = "rejected"
    recovery_initiated = "recovery_initiated"
    recovery_approved = "recovery_approved"


class EmergencyAccess(Base):
    __tablename__ = "emergency_access"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid = Column(String(36), unique=True, nullable=False, index=True)
    grantor_id = Column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    grantee_id = Column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type = Column(
        Enum(EmergencyAccessType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    status = Column(
        Enum(EmergencyAccessStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=EmergencyAccessStatus.invited,
    )
    wait_time_days = Column(Integer, default=7, nullable=False)
    recovery_initiated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())

    grantor = relationship("User", foreign_keys=[grantor_id])
    grantee = relationship("User", foreign_keys=[grantee_id])
