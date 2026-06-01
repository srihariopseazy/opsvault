from sqlalchemy import Column, String, Integer, DateTime, Index
from sqlalchemy.dialects.mysql import BIGINT
from database import Base


class RateLimitAttempt(Base):
    __tablename__ = "rate_limit_attempts"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    key_hash = Column(String(255), nullable=False, index=True)
    attempts = Column(Integer, default=0)
    window_start = Column(DateTime, nullable=True)
    blocked_until = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_rate_limit_key_hash", "key_hash"),
    )
