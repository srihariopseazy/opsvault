from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ShareCreateRequest(BaseModel):
    vault_item_uuid: str
    recipient_email: str
    encrypted_item_data: str
    encrypted_item_key: str
    permissions: str = "view"
    expires_in_days: Optional[int] = None
    message: Optional[str] = None


class VaultShareResponse(BaseModel):
    uuid: str
    recipient_email: str
    permissions: str
    status: str
    message: Optional[str] = None
    expires_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    created_at: datetime
    sharer_email: Optional[str] = None

    model_config = {"from_attributes": True}


class SharedItemResponse(BaseModel):
    share_uuid: str
    encrypted_item_data: str
    encrypted_item_key: str
    permissions: str
    sharer_email: str


class PublicKeyUploadRequest(BaseModel):
    public_key: str


class PublicKeyResponse(BaseModel):
    user_email: str
    public_key: str
