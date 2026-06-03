from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from fastapi import status as http_status

from database import get_db
from dependencies import get_current_active_user
from models.user import User
from models.org_member import OrgMember, OrgMemberRole, OrgMemberStatus
from schemas.directory import (
    DirectoryConfigCreate, DirectoryConfigUpdate, DirectoryConfigResponse,
    DirectorySyncLogResponse, DirectorySyncUserResponse, SyncPreviewResponse,
)
from schemas.common import MessageResponse
from services import directory_service
from sqlalchemy import select, and_

router = APIRouter(prefix="/directory", tags=["directory"])


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


@router.get("/config/{org_uuid}", response_model=DirectoryConfigResponse)
async def get_directory_config(
    org_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(org_uuid, current_user, db)
    cfg = await directory_service.get_directory_config(org_uuid, db)
    if not cfg:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Directory config not found")
    return cfg


@router.post("/config/{org_uuid}", response_model=DirectoryConfigResponse, status_code=200)
async def upsert_directory_config(
    org_uuid: str,
    data: DirectoryConfigCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(org_uuid, current_user, db)
    cfg = await directory_service.create_or_update_directory_config(org_uuid, data, db)
    await db.commit()
    await db.refresh(cfg)
    return cfg


@router.delete("/config/{org_uuid}", response_model=MessageResponse)
async def delete_directory_config(
    org_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(org_uuid, current_user, db)
    await directory_service.delete_directory_config(org_uuid, db)
    await db.commit()
    return MessageResponse(message="Directory configuration deleted")


@router.post("/sync/{org_uuid}", response_model=DirectorySyncLogResponse, status_code=200)
async def trigger_sync(
    org_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(org_uuid, current_user, db)
    log = await directory_service.sync_ldap(org_uuid, db)
    await db.commit()
    return log


@router.post("/sync/{org_uuid}/preview", response_model=SyncPreviewResponse)
async def preview_sync(
    org_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(org_uuid, current_user, db)
    return await directory_service.preview_sync(org_uuid, db)


@router.post("/sync/{org_uuid}/csv", response_model=DirectorySyncLogResponse)
async def sync_from_csv(
    org_uuid: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(org_uuid, current_user, db)
    content = (await file.read()).decode("utf-8-sig")
    log = await directory_service.sync_csv(org_uuid, content, db)
    await db.commit()
    return log


@router.get("/sync/{org_uuid}/logs", response_model=List[DirectorySyncLogResponse])
async def get_sync_logs(
    org_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(org_uuid, current_user, db)
    logs = await directory_service.get_sync_logs(org_uuid, db)
    return logs


@router.get("/users/{org_uuid}", response_model=List[DirectorySyncUserResponse])
async def list_directory_users(
    org_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_admin(org_uuid, current_user, db)
    return await directory_service.list_directory_users(org_uuid, db)
