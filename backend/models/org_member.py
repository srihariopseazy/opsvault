import enum
from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, func
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import relationship
from database import Base


class OrgMemberRole(str, enum.Enum):
    owner = "owner"
    admin = "admin"
    member = "member"


class OrgMemberStatus(str, enum.Enum):
    invited = "invited"
    accepted = "accepted"
    rejected = "rejected"


class OrgMember(Base):
    __tablename__ = "org_members"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid = Column(String(36), unique=True, nullable=False, index=True)
    org_id = Column(
        String(36),
        ForeignKey("organizations.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(
        Enum(OrgMemberRole, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    status = Column(
        Enum(OrgMemberStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=OrgMemberStatus.invited,
    )
    invited_at = Column(DateTime, default=func.now())
    accepted_at = Column(DateTime, nullable=True)

    organization = relationship("Organization", back_populates="members")
    user = relationship("User")
