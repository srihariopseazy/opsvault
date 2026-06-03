import enum
from sqlalchemy import Column, String, Text, DateTime, Enum, ForeignKey, Integer, func
from sqlalchemy.dialects.mysql import BIGINT, TINYINT
from sqlalchemy.orm import relationship
from database import Base


class SendItemType(str, enum.Enum):
    text = "text"
    file = "file"


class SendItem(Base):
    __tablename__ = "send_items"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid = Column(String(36), unique=True, nullable=False, index=True)
    # Short public token embedded in the share URL
    access_id = Column(String(32), unique=True, nullable=False, index=True)
    user_id = Column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type = Column(
        Enum(SendItemType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    # Encrypted with user's symmetric key (only owner can read)
    name = Column(Text, nullable=False)
    # Encrypted with per-send key (key lives only in the share URL fragment)
    content = Column(Text(length=4294967295), nullable=False)  # LONGTEXT
    access_count = Column(Integer, default=0, nullable=False)
    max_access_count = Column(Integer, nullable=True)
    expiration_at = Column(DateTime, nullable=True)
    deletion_at = Column(DateTime, nullable=False)
    password_hash = Column(String(255), nullable=True)
    hide_content = Column(TINYINT(1), default=0, nullable=False)
    disabled = Column(TINYINT(1), default=0, nullable=False)
    created_at = Column(DateTime, default=func.now())

    user = relationship("User")
