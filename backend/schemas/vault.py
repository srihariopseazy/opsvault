from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from datetime import datetime


class VaultItemCreate(BaseModel):
    type: str
    name: str
    notes: Optional[str] = None
    favorite: bool = False
    item_data: Any
    custom_fields: Optional[Any] = None
    reprompt: bool = False


class VaultItemUpdate(BaseModel):
    name: Optional[str] = None
    notes: Optional[str] = None
    favorite: Optional[bool] = None
    item_data: Optional[Any] = None
    custom_fields: Optional[Any] = None
    reprompt: Optional[bool] = None


class VaultItemResponse(BaseModel):
    uuid: str
    type: str
    name: str
    notes: Optional[str] = None
    favorite: bool
    folder_id: Optional[str] = None
    item_data: Any
    custom_fields: Optional[Any] = None
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
