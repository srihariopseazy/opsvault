from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class EmergencyAccessInviteRequest(BaseModel):
    email: EmailStr
    type: str = "view"           # "view" | "takeover"
    wait_time_days: int = 7      # 1–90


class EmergencyAccessResponse(BaseModel):
    uuid: str
    type: str
    status: str
    wait_time_days: int
    recovery_initiated_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    # Grantor info (shown to grantee)
    grantor_uuid: Optional[str] = None
    grantor_name: Optional[str] = None
    grantor_email: Optional[str] = None
    # Grantee info (shown to grantor)
    grantee_uuid: Optional[str] = None
    grantee_name: Optional[str] = None
    grantee_email: Optional[str] = None
