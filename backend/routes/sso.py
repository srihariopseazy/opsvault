from fastapi import APIRouter, Depends, Form, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from database import get_db
from dependencies import get_current_active_user
from models.user import User
from models.org_member import OrgMember, OrgMemberRole, OrgMemberStatus
from schemas.sso import SsoConfigCreate, SsoConfigUpdate, SsoConfigResponse, SsoLoginResponse, SsoCallbackResponse
from schemas.common import MessageResponse
from services import sso_service
from sqlalchemy import select, and_
from fastapi import status as http_status, HTTPException

router = APIRouter(prefix="/sso", tags=["sso"])


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
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Admin access required")


@router.get("/config/{org_uuid}", response_model=SsoConfigResponse)
async def get_sso_config(
    org_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(org_uuid, current_user, db)
    cfg = await sso_service.get_sso_config(org_uuid, db)
    if not cfg:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="SSO config not found")
    return cfg


@router.post("/config/{org_uuid}", response_model=SsoConfigResponse, status_code=200)
async def upsert_sso_config(
    org_uuid: str,
    data: SsoConfigCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(org_uuid, current_user, db)
    cfg = await sso_service.create_or_update_sso_config(org_uuid, data, db)
    await db.commit()
    await db.refresh(cfg)
    return cfg


@router.delete("/config/{org_uuid}", response_model=MessageResponse)
async def delete_sso_config(
    org_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(org_uuid, current_user, db)
    await sso_service.delete_sso_config(org_uuid, db)
    await db.commit()
    return MessageResponse(message="SSO configuration deleted")


@router.post("/login/{org_uuid}", response_model=SsoLoginResponse)
async def initiate_sso_login(
    org_uuid: str,
    db: AsyncSession = Depends(get_db),
):
    result = await sso_service.initiate_sso_login(org_uuid, db)
    await db.commit()
    return result


@router.post("/saml/callback", response_model=SsoCallbackResponse)
async def saml_callback(
    SAMLResponse: str = Form(...),
    RelayState: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    result = await sso_service.process_saml_response(SAMLResponse, RelayState, db)
    await db.commit()
    return result


@router.get("/oidc/callback", response_model=SsoCallbackResponse)
async def oidc_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await sso_service.process_oidc_callback(code, state, db)
    await db.commit()
    return result
