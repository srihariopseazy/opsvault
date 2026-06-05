from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class PushSubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class PushSubscriptionResponse(BaseModel):
    uuid: str
    endpoint: str
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}
