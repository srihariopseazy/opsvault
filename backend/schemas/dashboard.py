from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class RecentItemSummary(BaseModel):
    uuid: str
    type: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class DashboardStats(BaseModel):
    total_items: int
    logins: int
    notes: int
    cards: int
    identities: int
    favorites: int
    trash: int
    # Phase 2 additions
    weak_passwords_count: int = 0      # computed client-side (server returns 0)
    reused_passwords_count: int = 0    # computed client-side (server returns 0)
    recent_items: List[RecentItemSummary] = []
    recent_modified: List[RecentItemSummary] = []
