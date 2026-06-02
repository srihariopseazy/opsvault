from sqlalchemy import Column, String, DateTime, ForeignKey, func
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from database import Base


class Collection(Base):
    __tablename__ = "collections"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid = Column(String(36), unique=True, nullable=False, index=True)
    org_id = Column(
        String(36),
        ForeignKey("organizations.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=func.now())

    organization = relationship("Organization", back_populates="collections")
    members = relationship(
        "CollectionMember",
        back_populates="collection",
        cascade="all, delete-orphan",
    )
    items = relationship(
        "CollectionItem",
        back_populates="collection",
        cascade="all, delete-orphan",
    )
