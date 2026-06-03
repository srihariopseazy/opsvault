from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class OrgPolicySet(BaseModel):
    enabled: bool
    policy_data: Optional[dict] = None


class OrgPolicyResponse(BaseModel):
    policy_type: str
    enabled: bool
    policy_data: Optional[dict] = None
    updated_at: Optional[datetime] = None


class OrgPoliciesResponse(BaseModel):
    org_uuid: str
    policies: List[OrgPolicyResponse]
