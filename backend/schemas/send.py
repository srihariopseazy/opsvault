from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class SendCreate(BaseModel):
    type: str = "text"
    name: str                        # encrypted with user's symmetricKey
    content: str                     # encrypted with per-send key
    max_access_count: Optional[int] = None
    expiration_at: Optional[datetime] = None
    deletion_at: datetime
    password: Optional[str] = None   # plaintext — server hashes it
    hide_content: bool = False


class SendUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None
    max_access_count: Optional[int] = None
    expiration_at: Optional[datetime] = None
    deletion_at: Optional[datetime] = None
    password: Optional[str] = None
    hide_content: Optional[bool] = None
    disabled: Optional[bool] = None


class SendResponse(BaseModel):
    uuid: str
    access_id: str
    type: str
    name: str                        # encrypted
    access_count: int
    max_access_count: Optional[int] = None
    expiration_at: Optional[datetime] = None
    deletion_at: datetime
    hide_content: bool
    disabled: bool
    password_protected: bool
    created_at: Optional[datetime] = None


class PublicSendResponse(BaseModel):
    """Returned by the public access endpoint — content is still encrypted."""
    access_id: str
    type: str
    content: str                     # encrypted with per-send key
    hide_content: bool
    password_required: bool = False
