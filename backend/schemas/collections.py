from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class CollectionCreate(BaseModel):
    org_id: str
    name: str


class CollectionRename(BaseModel):
    name: str


class AddCollectionMemberRequest(BaseModel):
    user_uuid: str
    access: str = "read"  # "read" | "write"


class AddCollectionItemRequest(BaseModel):
    item_uuid: str


# ── Response schemas ──────────────────────────────────────────────────────────

class CollectionMemberResponse(BaseModel):
    uuid: str
    user_uuid: str
    user_name: str
    user_email: str
    access: str
    created_at: Optional[datetime] = None


class CollectionItemResponse(BaseModel):
    uuid: str          # collection_item.uuid
    item_uuid: str     # vault_item.uuid
    item_name: str     # encrypted — rendered as-is by the client
    item_type: str
    added_at: Optional[datetime] = None


class CollectionResponse(BaseModel):
    uuid: str
    org_id: str
    name: str
    item_count: int
    member_count: int
    my_access: str     # "read" | "write" | "admin"
    created_at: Optional[datetime] = None


class CollectionDetail(BaseModel):
    uuid: str
    org_id: str
    name: str
    my_access: str
    members: List[CollectionMemberResponse]
    items: List[CollectionItemResponse]
    created_at: Optional[datetime] = None
