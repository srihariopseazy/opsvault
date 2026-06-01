import enum
from sqlalchemy import Column, String, Text, JSON, DateTime, Enum, ForeignKey, func
from sqlalchemy.dialects.mysql import BIGINT, TINYINT
from sqlalchemy.orm import relationship
from database import Base


class VaultItemType(str, enum.Enum):
    login = "login"
    note = "note"
    card = "card"
    identity = "identity"


class VaultItem(Base):
    __tablename__ = "vault_items"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid = Column(String(36), unique=True, nullable=False)
    user_id = Column(BIGINT(unsigned=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(
        Enum(VaultItemType, values_callable=lambda x: [e.value for e in x]),
        nullable=False
    )
    name = Column(Text, nullable=False)
    notes = Column(Text, nullable=True)
    favorite = Column(TINYINT(1), default=0)
    folder_id = Column(BIGINT(unsigned=True), nullable=True)
    item_data = Column(JSON, nullable=False)
    custom_fields = Column(JSON, nullable=True)
    password_history = Column(JSON, nullable=True)
    reprompt = Column(TINYINT(1), default=0)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    revision_date = Column(DateTime, default=func.now())

    user = relationship("User", back_populates="vault_items")
