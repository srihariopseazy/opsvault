from sqlalchemy import Column, String, DateTime, ForeignKey, JSON, func
from sqlalchemy.dialects.mysql import BIGINT, TINYINT
from database import Base


class ApiKey(Base):
    __tablename__ = "api_keys"

    id            = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid          = Column(String(36), unique=True, nullable=False, index=True)
    user_id       = Column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name          = Column(String(255), nullable=False)
    key_prefix    = Column(String(16), nullable=False, index=True)
    key_hash      = Column(String(255), nullable=False)
    scopes        = Column(JSON, nullable=False)
    expires_at    = Column(DateTime, nullable=True)
    last_used_at  = Column(DateTime, nullable=True)
    last_used_ip  = Column(String(45), nullable=True)
    is_active     = Column(TINYINT(1), nullable=False, default=1)
    created_at    = Column(DateTime, default=func.now())
    updated_at    = Column(DateTime, default=func.now(), onupdate=func.now())


class OrgApiKey(Base):
    __tablename__ = "org_api_keys"

    id            = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid          = Column(String(36), unique=True, nullable=False, index=True)
    org_id        = Column(
        String(36),
        ForeignKey("organizations.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by    = Column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name          = Column(String(255), nullable=False)
    key_prefix    = Column(String(16), nullable=False, index=True)
    key_hash      = Column(String(255), nullable=False)
    scopes        = Column(JSON, nullable=False)
    expires_at    = Column(DateTime, nullable=True)
    last_used_at  = Column(DateTime, nullable=True)
    last_used_ip  = Column(String(45), nullable=True)
    is_active     = Column(TINYINT(1), nullable=False, default=1)
    created_at    = Column(DateTime, default=func.now())
    updated_at    = Column(DateTime, default=func.now(), onupdate=func.now())
