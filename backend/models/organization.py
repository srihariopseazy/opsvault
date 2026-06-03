from sqlalchemy import Column, String, DateTime, ForeignKey, func
from sqlalchemy.dialects.mysql import BIGINT, TINYINT
from sqlalchemy.orm import relationship
from database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid = Column(String(36), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    owner_id = Column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Phase 7: admin can suspend an org
    is_suspended = Column(TINYINT(1), default=0, nullable=False)
    created_at = Column(DateTime, default=func.now())

    # Relationships
    owner = relationship("User", foreign_keys=[owner_id])
    members = relationship(
        "OrgMember",
        back_populates="organization",
        cascade="all, delete-orphan",
    )
    collections = relationship(
        "Collection",
        back_populates="organization",
        cascade="all, delete-orphan",
    )
