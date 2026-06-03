from pydantic import BaseModel
from typing import Optional


class NotificationPreferenceUpdate(BaseModel):
    new_device_login: Optional[bool] = None
    master_password_changed: Optional[bool] = None
    send_item_viewed: Optional[bool] = None
    org_invites: Optional[bool] = None
    emergency_access: Optional[bool] = None


class NotificationPreferenceResponse(BaseModel):
    new_device_login: bool
    master_password_changed: bool
    send_item_viewed: bool
    org_invites: bool
    emergency_access: bool
