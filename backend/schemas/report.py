from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ── Scheduled reports ──────────────────────────────────────────────────────────

class ScheduledReportCreate(BaseModel):
    report_type: str
    frequency: str
    recipient_email: str


class ScheduledReportUpdate(BaseModel):
    frequency: Optional[str] = None
    enabled: Optional[bool] = None
    recipient_email: Optional[str] = None


class ScheduledReportResponse(BaseModel):
    uuid: str
    report_type: str
    frequency: str
    enabled: bool
    last_sent_at: Optional[datetime] = None
    next_send_at: datetime
    recipient_email: str
    created_at: Optional[datetime] = None


# ── Report logs ────────────────────────────────────────────────────────────────

class ReportLogResponse(BaseModel):
    uuid: str
    report_type: str
    status: str
    file_size: Optional[int] = None
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None


# ── Vault health ───────────────────────────────────────────────────────────────

class VaultItemStat(BaseModel):
    uuid: str
    name: str          # still encrypted — client decrypts
    updated_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    type: str


class VaultHealthReportResponse(BaseModel):
    total_items: int
    items_by_type: dict
    old_items: List[VaultItemStat]       # not updated in >180 days
    never_updated: List[VaultItemStat]   # created_at ≈ updated_at (same second)
    total_old: int
    total_never_updated: int


# ── Breach check ───────────────────────────────────────────────────────────────

class BreachCheckItem(BaseModel):
    uuid: str
    password_hash_prefix: str            # first 5 chars of SHA-1 (uppercase)


class BreachResult(BaseModel):
    uuid: str
    pwned_count: int


class BreachCheckResponse(BaseModel):
    results: List[BreachResult]
    checked: int
    breached: int


# ── Compliance ────────────────────────────────────────────────────────────────

class InactiveMember(BaseModel):
    user_uuid: str
    user_email: str
    user_name: str
    last_login_at: Optional[datetime] = None
    role: str


class ComplianceReportResponse(BaseModel):
    org_uuid: str
    org_name: str
    total_members: int
    members_with_2fa: int
    members_without_2fa: int
    two_fa_adoption_pct: float
    active_policies: List[str]
    policy_count: int
    inactive_members: List[InactiveMember]   # no login in >30 days
    total_collections: int
    compliance_score: float                   # 0-100
