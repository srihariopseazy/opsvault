from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class OrgEventResponse(BaseModel):
    uuid: str
    event_type: str
    actor_uuid: Optional[str] = None
    actor_email: Optional[str] = None
    target_uuid: Optional[str] = None
    ip_address: Optional[str] = None
    event_data: Optional[dict] = None
    created_at: Optional[datetime] = None
