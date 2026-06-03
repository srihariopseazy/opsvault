from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from datetime import datetime


class VaultItemCreate(BaseModel):
    type: str
    name: str
    notes: Optional[str] = None
    favorite: bool = False
    item_data: Any
    custom_fields: Optional[str] = None
    totp_secret: Optional[str] = None
    reprompt: bool = False
    folder_uuid: Optional[str] = None


class VaultItemUpdate(BaseModel):
    name: Optional[str] = None
    notes: Optional[str] = None
    favorite: Optional[bool] = None
    item_data: Optional[Any] = None
    custom_fields: Optional[str] = None
    totp_secret: Optional[str] = None
    reprompt: Optional[bool] = None
    folder_uuid: Optional[str] = None  # None = leave unchanged; use "" to clear


class VaultItemResponse(BaseModel):
    uuid: str
    type: str
    name: str
    notes: Optional[str] = None
    favorite: bool
    folder_id: Optional[str] = None   # Phase 1 field kept for compatibility
    folder_uuid: Optional[str] = None  # Phase 2 folder UUID
    item_data: Any
    custom_fields: Optional[str] = None
    totp_secret: Optional[str] = None
    password_history: Optional[Any] = None
    reprompt: bool
    deleted_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    revision_date: Optional[datetime] = None

    class Config:
        from_attributes = True


class VaultSyncResponse(BaseModel):
    items: List[VaultItemResponse]
    profile: Dict[str, Any]
