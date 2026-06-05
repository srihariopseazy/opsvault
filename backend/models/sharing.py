import enum
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Enum, func
from sqlalchemy.dialects.mysql import BIGINT
from database import Base


class ShareStatus(str, enum.Enum):
    pending  = "pending"
    accepted = "accepted"
    declined = "declined"
    expired  = "expired"
    revoked  = "revoked"


class SharePermission(str, enum.Enum):
    view = "view"
    edit = "edit"


class VaultShare(Base):
    __tablename__ = "vault_shares"

    id                  = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    uuid                = Column(String(36), unique=True, nullable=False, index=True)
    sharer_id           = Column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    recipient_id        = Column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    recipient_email     = Column(String(255), nullable=False, index=True)
    vault_item_id       = Column(
        BIGINT(unsigned=True),
        ForeignKey("vault_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Item content encrypted with a per-share AES key
    encrypted_item_data = Column(Text, nullable=False)
    # The per-share AES key encrypted with the recipient's share public key
    encrypted_item_key  = Column(Text, nullable=False)
    permissions         = Column(
        Enum(SharePermission, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=SharePermission.view,
    )
    status              = Column(
        Enum(ShareStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=ShareStatus.pending,
    )
    message             = Column(Text, nullable=True)
    expires_at          = Column(DateTime, nullable=True)
    accepted_at         = Column(DateTime, nullable=True)
    created_at          = Column(DateTime, default=func.now())


class UserPublicKey(Base):
    __tablename__ = "user_public_keys"

    id         = Column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id    = Column(
        BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    public_key = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
