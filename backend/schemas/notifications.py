from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class NotificationResponse(BaseModel):
    uuid: str
    type: str
    title: str
    body: str
    read: bool
    created_at: Optional[datetime] = None


class UnreadCountResponse(BaseModel):
    unread_count: int
