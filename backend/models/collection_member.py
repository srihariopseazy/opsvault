import enum
from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, func
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from database import Base


class CollectionAccess(str, enum.Enum):
    read = "read"
    write = "write"


class CollectionMember(Base):
    __tablename__ = "collection_members"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid = Column(String(36), unique=True, nullable=False, index=True)
    collection_id = Column(
        String(36),
        ForeignKey("collections.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    access = Column(
        Enum(CollectionAccess, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=CollectionAccess.read,
    )
    created_at = Column(DateTime, default=func.now())

    collection = relationship("Collection", back_populates="members")
    user = relationship("User")
