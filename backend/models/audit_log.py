from sqlalchemy import Column, String, Text, JSON, DateTime, ForeignKey, func
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid = Column(String(36), unique=True, nullable=False)
    user_id = Column(BIGINT(unsigned=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False)
    target_type = Column(String(100), nullable=True)
    target_id = Column(String(36), nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    extra_details = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=func.now())

    user = relationship("User", back_populates="audit_logs")
