from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


class OrgCreate(BaseModel):
    name: str


class OrgRename(BaseModel):
    name: str


class InviteRequest(BaseModel):
    email: EmailStr
    role: str = "member"  # "admin" | "member"


class ChangeRoleRequest(BaseModel):
    role: str


# ── Response schemas ──────────────────────────────────────────────────────────

class OrgMemberResponse(BaseModel):
    uuid: str
    user_uuid: str
    user_name: str
    user_email: str
    role: str
    status: str
    invited_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None


class CollectionSummary(BaseModel):
    uuid: str
    name: str
    item_count: int
    member_count: int


class OrgSummary(BaseModel):
    uuid: str
    name: str
    member_count: int
    my_role: str
    created_at: Optional[datetime] = None


class OrgDetail(BaseModel):
    uuid: str
    name: str
    my_role: str
    members: List[OrgMemberResponse]
    collections: List[CollectionSummary]
    created_at: Optional[datetime] = None


class PendingInviteResponse(BaseModel):
    uuid: str
    org_uuid: str
    org_name: str
    role: str
    invited_at: Optional[datetime] = None
