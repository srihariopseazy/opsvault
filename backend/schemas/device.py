from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class DeviceResponse(BaseModel):
    uuid:               str
    device_name:        Optional[str]
    device_type:        Optional[str]
    browser:            Optional[str]
    os:                 Optional[str]
    ip_address:         Optional[str]
    last_seen_ip:       Optional[str]
    is_trusted:         bool
    last_used_at:       Optional[datetime]
    created_at:         Optional[datetime]
    status:             str
    wiped_at:           Optional[datetime]
    device_fingerprint: str

    model_config = {"from_attributes": True}


class AdminDeviceResponse(DeviceResponse):
    user_id:    int
    user_email: Optional[str] = None
    user_name:  Optional[str] = None


class DeviceWipeRequest(BaseModel):
    reason: Optional[str] = None
