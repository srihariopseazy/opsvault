import enum
from sqlalchemy import Column, String, Text, DateTime, Enum, ForeignKey, func
from database import Base


class EmailStatus(str, enum.Enum):
    sent    = "sent"
    failed  = "failed"
    skipped = "skipped"


class EmailLog(Base):
    __tablename__ = "email_logs"

    uuid          = Column(String(36), primary_key=True, nullable=False)
    to_email      = Column(String(255), nullable=False)
    subject       = Column(String(500), nullable=False)
    template      = Column(String(100), nullable=False)
    status        = Column(
        Enum(EmailStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    error_message = Column(Text, nullable=True)
    user_uuid     = Column(
        String(36),
        ForeignKey("users.uuid", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, default=func.now(), index=True)
