from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from database import get_db
from dependencies import get_current_active_user
from models.user import User
from schemas.common import MessageResponse
from schemas.organizations import (
    OrgCreate,
    OrgRename,
    InviteRequest,
    ChangeRoleRequest,
    OrgSummary,
    OrgDetail,
    OrgMemberResponse,
    PendingInviteResponse,
)
from services.org_service import OrgService

# Two routers — registered separately in main.py under the same API_PREFIX
orgs_router = APIRouter(prefix="/organizations", tags=["organizations"])
invites_router = APIRouter(prefix="/org-invites", tags=["org-invites"])


# ── Organizations ─────────────────────────────────────────────────────────────

@orgs_router.get("", response_model=List[OrgSummary])
async def list_orgs(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await OrgService.list_orgs(current_user, db)


@orgs_router.post("", response_model=OrgSummary, status_code=201)
async def create_org(
    data: OrgCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await OrgService.create_org(current_user, data.name, db)


@orgs_router.get("/{org_uuid}", response_model=OrgDetail)
async def get_org(
    org_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await OrgService.get_org(current_user, org_uuid, db)


@orgs_router.put("/{org_uuid}", response_model=MessageResponse)
async def rename_org(
    org_uuid: str,
    data: OrgRename,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await OrgService.rename_org(current_user, org_uuid, data.name, db)
    return MessageResponse(message="Organization renamed")


@orgs_router.delete("/{org_uuid}", response_model=MessageResponse)
async def delete_org(
    org_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await OrgService.delete_org(current_user, org_uuid, db)
    return MessageResponse(message="Organization deleted")


@orgs_router.post("/{org_uuid}/invite", response_model=OrgMemberResponse, status_code=201)
async def invite_member(
    org_uuid: str,
    data: InviteRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    member = await OrgService.invite_member(
        current_user, org_uuid, data.email, data.role, db
    )
    from services.org_service import _member_to_response
    return _member_to_response(member)


@orgs_router.post(
    "/{org_uuid}/members/{member_uuid}/role",
    response_model=MessageResponse,
)
async def change_member_role(
    org_uuid: str,
    member_uuid: str,
    data: ChangeRoleRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await OrgService.change_member_role(
        current_user, org_uuid, member_uuid, data.role, db
    )
    return MessageResponse(message="Member role updated")


@orgs_router.delete(
    "/{org_uuid}/members/{member_uuid}",
    response_model=MessageResponse,
)
async def remove_member(
    org_uuid: str,
    member_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await OrgService.remove_member(current_user, org_uuid, member_uuid, db)
    return MessageResponse(message="Member removed")


# ── Org invites ───────────────────────────────────────────────────────────────

@invites_router.get("/pending", response_model=List[PendingInviteResponse])
async def list_pending_invites(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await OrgService.list_pending_invites(current_user, db)


@invites_router.post("/{invite_uuid}/accept", response_model=MessageResponse)
async def accept_invite(
    invite_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await OrgService.accept_invite(current_user, invite_uuid, db)
    return MessageResponse(message="Invite accepted")


@invites_router.post("/{invite_uuid}/reject", response_model=MessageResponse)
async def reject_invite(
    invite_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await OrgService.reject_invite(current_user, invite_uuid, db)
    return MessageResponse(message="Invite rejected")
