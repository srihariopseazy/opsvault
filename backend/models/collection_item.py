from sqlalchemy import Column, String, DateTime, ForeignKey, func
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from database import Base


class CollectionItem(Base):
    __tablename__ = "collection_items"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid = Column(String(36), unique=True, nullable=False, index=True)
    collection_id = Column(
        String(36),
        ForeignKey("collections.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # UUID string FK → vault_items.uuid
    item_id = Column(
        String(36),
        ForeignKey("vault_items.uuid", ondelete="CASCADE"),
        nullable=False,
    )
    added_at = Column(DateTime, default=func.now())

    collection = relationship("Collection", back_populates="items")
    item = relationship("VaultItem")
