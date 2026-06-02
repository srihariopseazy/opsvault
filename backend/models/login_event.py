import enum
from sqlalchemy import Column, String, Text, DateTime, Enum, ForeignKey, func
from sqlalchemy.dialects.mysql import BIGINT
from database import Base


class LoginStatus(str, enum.Enum):
    success = "success"
    failed = "failed"


class LoginEvent(Base):
    """Records every login attempt — success and failure — for audit and display."""

    __tablename__ = "login_events"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid = Column(String(36), unique=True, nullable=False)
    # nullable: failed attempts for an unknown email have no user_id
    user_id = Column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    device_name = Column(String(255), nullable=True)
    status = Column(
        Enum(LoginStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    created_at = Column(DateTime, default=func.now())
