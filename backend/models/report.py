import enum
from sqlalchemy import Column, String, Integer, Text, DateTime, Enum, ForeignKey, func
from sqlalchemy.dialects.mysql import TINYINT
from database import Base


class ReportType(str, enum.Enum):
    vault_health   = "vault_health"
    breach_check   = "breach_check"
    inactive_users = "inactive_users"
    full_audit     = "full_audit"


class ReportFrequency(str, enum.Enum):
    daily   = "daily"
    weekly  = "weekly"
    monthly = "monthly"


class ReportStatus(str, enum.Enum):
    generated = "generated"
    sent      = "sent"
    failed    = "failed"


class ScheduledReport(Base):
    __tablename__ = "scheduled_reports"

    uuid            = Column(String(36), primary_key=True, nullable=False)
    user_uuid       = Column(
        String(36),
        ForeignKey("users.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    report_type     = Column(
        Enum(ReportType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    frequency       = Column(
        Enum(ReportFrequency, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    enabled         = Column(TINYINT(1), nullable=False, default=1)
    last_sent_at    = Column(DateTime, nullable=True)
    next_send_at    = Column(DateTime, nullable=False)
    recipient_email = Column(String(255), nullable=False)
    created_at      = Column(DateTime, default=func.now())
    updated_at      = Column(DateTime, default=func.now(), onupdate=func.now())


class ReportLog(Base):
    __tablename__ = "report_logs"

    uuid          = Column(String(36), primary_key=True, nullable=False)
    user_uuid     = Column(
        String(36),
        ForeignKey("users.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    report_type   = Column(
        Enum(ReportType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    status        = Column(
        Enum(ReportStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    file_size     = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at    = Column(DateTime, default=func.now(), index=True)
