from sqlalchemy import Column, String, DateTime, ForeignKey, func
from sqlalchemy.dialects.mysql import BIGINT
from database import Base


class AutofillLog(Base):
    __tablename__ = "autofill_logs"

    id         = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid       = Column(String(36), unique=True, nullable=False, index=True)
    user_id    = Column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_uuid  = Column(String(36), nullable=False)
    url        = Column(String(2048), nullable=True)
    created_at = Column(DateTime, default=func.now())
