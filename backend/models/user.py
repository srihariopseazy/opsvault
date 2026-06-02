from sqlalchemy import Column, String, Text, Integer, DateTime, func
from sqlalchemy.dialects.mysql import BIGINT, TINYINT
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid = Column(String(36), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    master_password_hash = Column(String(255), nullable=False)
    protected_symmetric_key = Column(Text, nullable=False)
    kdf_iterations = Column(Integer, default=600000)
    master_password_hint = Column(String(255), nullable=True)
    email_verified = Column(TINYINT(1), default=0)
    is_active = Column(TINYINT(1), default=1)
    is_superuser = Column(TINYINT(1), default=0)

    # Phase 4: TOTP 2FA
    totp_secret = Column(String(255), nullable=True)
    totp_enabled = Column(TINYINT(1), default=0)

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    last_login_at = Column(DateTime, nullable=True)

    vault_items = relationship("VaultItem", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="user")
    trusted_devices = relationship("TrustedDevice", back_populates="user", cascade="all, delete-orphan")
