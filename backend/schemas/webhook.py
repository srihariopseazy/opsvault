from pydantic import BaseModel, Field, HttpUrl
from typing import List, Optional
from datetime import datetime


class WebhookCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    url: str = Field(..., min_length=1, max_length=500)
    events: List[str] = Field(..., min_length=1)


class WebhookUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    url: Optional[str] = Field(None, min_length=1, max_length=500)
    events: Optional[List[str]] = None
    is_active: Optional[bool] = None


class WebhookResponse(BaseModel):
    uuid: str
    name: str
    url: str
    events: List[str]
    is_active: bool
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class WebhookWithSecretResponse(WebhookResponse):
    secret: str


class WebhookDeliveryResponse(BaseModel):
    uuid: str
    event_type: str
    response_status: Optional[int]
    response_body: Optional[str]
    attempt_count: int
    success: bool
    delivered_at: Optional[datetime]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class WebhookDetailResponse(WebhookWithSecretResponse):
    recent_deliveries: List[WebhookDeliveryResponse] = []
