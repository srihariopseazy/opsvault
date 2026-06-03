from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from database import get_db
from dependencies import get_current_active_user
from models.user import User
from models.org_member import OrgMember, OrgMemberRole, OrgMemberStatus
from schemas.org_policy import OrgPolicySet, OrgPolicyResponse, OrgPoliciesResponse
from services.org_policy_service import OrgPolicyService
from services.org_event_service import OrgEventService
from models.org_event import OrgEventType

router = APIRouter(tags=["org-policies"])


async def _require_org_member(org_uuid: str, user: User, db: AsyncSession) -> None:
    result = await db.execute(
        select(OrgMember).where(
            and_(
                OrgMember.org_id == org_uuid,
                OrgMember.user_id == user.id,
                OrgMember.status == OrgMemberStatus.accepted,
            )
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this organization",
        )


async def _require_org_admin(org_uuid: str, user: User, db: AsyncSession) -> None:
    result = await db.execute(
        select(OrgMember).where(
            and_(
                OrgMember.org_id == org_uuid,
                OrgMember.user_id == user.id,
                OrgMember.status == OrgMemberStatus.accepted,
                OrgMember.role.in_([OrgMemberRole.owner, OrgMemberRole.admin]),
            )
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only org owners and admins can manage policies",
        )


@router.get("/organizations/{org_uuid}/policies", response_model=OrgPoliciesResponse)
async def get_policies(
    org_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_member(org_uuid, current_user, db)
    return await OrgPolicyService.get_policies(org_uuid, db)


@router.put("/organizations/{org_uuid}/policies/{policy_type}", response_model=OrgPolicyResponse)
async def set_policy(
    org_uuid: str,
    policy_type: str,
    data: OrgPolicySet,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(org_uuid, current_user, db)
    result = await OrgPolicyService.set_policy(
        org_uuid=org_uuid,
        policy_type_str=policy_type,
        enabled=data.enabled,
        policy_data=data.policy_data,
        db=db,
    )
    await OrgEventService.log_event(
        org_uuid=org_uuid,
        event_type=OrgEventType.policy_changed,
        db=db,
        actor_uuid=current_user.uuid,
        event_data={"policy_type": policy_type, "enabled": data.enabled},
    )
    await db.commit()
    return result
