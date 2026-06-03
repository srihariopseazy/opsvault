from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class PlatformStatsResponse(BaseModel):
    total_users: int
    active_users: int
    disabled_users: int
    total_orgs: int
    total_vault_items: int
    active_sessions: int
    total_collections: int
    total_sends: int


class AdminUserOrgInfo(BaseModel):
    org_uuid: str
    org_name: str
    role: str


class AdminUserResponse(BaseModel):
    uuid: str
    email: str
    name: str
    is_active: bool
    is_superuser: bool
    totp_enabled: bool
    email_verified: bool
    created_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    session_count: int = 0
    org_memberships: List[AdminUserOrgInfo] = []


class AdminOrgResponse(BaseModel):
    uuid: str
    name: str
    owner_email: str
    member_count: int
    collection_count: int
    is_suspended: bool
    created_at: Optional[datetime] = None


class ImpersonateResponse(BaseModel):
    temp_token: str
    expires_in: int   # seconds
    target_email: str
