from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.mysql import BIGINT, TINYINT
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship
from database import Base


class Session(Base):
    __tablename__ = "sessions"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid = Column(String(36), unique=True, nullable=False)
    user_id = Column(BIGINT(unsigned=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    jti = Column(String(255), unique=True, nullable=False)
    device_name = Column(String(255), nullable=True)
    device_type = Column(String(100), nullable=True)
    ip_address = Column(String(45), nullable=True)
    is_active = Column(TINYINT(1), default=1)
    created_at = Column(DateTime, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    last_used_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="sessions")
