from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import Optional, List
from datetime import datetime

from database import get_db
from dependencies import get_current_active_user
from models.user import User
from models.org_member import OrgMember, OrgMemberRole, OrgMemberStatus
from schemas.org_event import OrgEventResponse
from services.org_event_service import OrgEventService

router = APIRouter(tags=["org-events"])


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
            detail="Only org owners and admins can view the event log",
        )


@router.get("/organizations/{org_uuid}/events", response_model=List[OrgEventResponse])
async def list_org_events(
    org_uuid: str,
    event_type: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(org_uuid, current_user, db)
    return await OrgEventService.list_events(
        org_uuid=org_uuid,
        db=db,
        event_type=event_type,
        date_from=date_from,
        date_to=date_to,
        skip=skip,
        limit=limit,
    )
