from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class EmailLogResponse(BaseModel):
    uuid: str
    to_email: str
    subject: str
    template: str
    status: str
    error_message: Optional[str] = None
    user_uuid: Optional[str] = None
    created_at: Optional[datetime] = None


class EmailLogListResponse(BaseModel):
    items: List[EmailLogResponse]
    total: int
