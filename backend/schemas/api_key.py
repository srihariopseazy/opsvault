from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    scopes: List[str] = Field(default=["read"])
    expires_at: Optional[datetime] = None


class ApiKeyResponse(BaseModel):
    uuid: str
    name: str
    key_prefix: str
    scopes: List[str]
    expires_at: Optional[datetime]
    last_used_at: Optional[datetime]
    last_used_ip: Optional[str]
    is_active: bool
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ApiKeyCreatedResponse(ApiKeyResponse):
    full_key: str


class OrgApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    scopes: List[str] = Field(default=["read"])
    expires_at: Optional[datetime] = None


class OrgApiKeyResponse(BaseModel):
    uuid: str
    org_id: str
    name: str
    key_prefix: str
    scopes: List[str]
    expires_at: Optional[datetime]
    last_used_at: Optional[datetime]
    last_used_ip: Optional[str]
    is_active: bool
    created_at: Optional[datetime]
    created_by_email: Optional[str] = None

    model_config = {"from_attributes": True}


class OrgApiKeyCreatedResponse(OrgApiKeyResponse):
    full_key: str
