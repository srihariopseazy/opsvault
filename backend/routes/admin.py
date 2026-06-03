from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from datetime import datetime

from database import get_db
from dependencies import get_current_superuser
from models.user import User
from schemas.admin import (
    PlatformStatsResponse,
    AdminUserResponse,
    AdminOrgResponse,
    ImpersonateResponse,
)
from schemas.platform_event import PlatformEventResponse
from schemas.common import MessageResponse
from services.admin_service import AdminService
from services.platform_event_service import PlatformEventService

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats", response_model=PlatformStatsResponse)
async def get_stats(
    _: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    return await AdminService.get_platform_stats(db)


@router.get("/users", response_model=List[AdminUserResponse])
async def list_users(
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    return await AdminService.list_users(db, search=search, skip=skip, limit=limit)


@router.get("/users/{user_uuid}", response_model=AdminUserResponse)
async def get_user_detail(
    user_uuid: str,
    _: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    return await AdminService.get_user_detail(user_uuid, db)


@router.post("/users/{user_uuid}/disable", response_model=MessageResponse)
async def disable_user(
    user_uuid: str,
    current_user: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    await AdminService.disable_user(user_uuid, db)
    from services.platform_event_service import PlatformEventService
    from models.platform_event import PlatformEventType
    await PlatformEventService.log_event(
        event_type=PlatformEventType.user_disabled,
        db=db,
        actor_uuid=current_user.uuid,
        target_user_uuid=user_uuid,
    )
    await db.commit()
    return MessageResponse(message="User disabled")


@router.post("/users/{user_uuid}/enable", response_model=MessageResponse)
async def enable_user(
    user_uuid: str,
    current_user: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    await AdminService.enable_user(user_uuid, db)
    from services.platform_event_service import PlatformEventService
    from models.platform_event import PlatformEventType
    await PlatformEventService.log_event(
        event_type=PlatformEventType.user_enabled,
        db=db,
        actor_uuid=current_user.uuid,
        target_user_uuid=user_uuid,
    )
    await db.commit()
    return MessageResponse(message="User enabled")


@router.post("/users/{user_uuid}/force-logout", response_model=MessageResponse)
async def force_logout_user(
    user_uuid: str,
    _: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    await AdminService.force_logout_user(user_uuid, db)
    await db.commit()
    return MessageResponse(message="All sessions terminated")


@router.delete("/users/{user_uuid}", response_model=MessageResponse)
async def delete_user(
    user_uuid: str,
    current_user: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    from services.platform_event_service import PlatformEventService
    from models.platform_event import PlatformEventType
    await PlatformEventService.log_event(
        event_type=PlatformEventType.user_deleted,
        db=db,
        actor_uuid=current_user.uuid,
        target_user_uuid=user_uuid,
    )
    await AdminService.delete_user(user_uuid, db)
    await db.commit()
    return MessageResponse(message="User deleted")


@router.post("/users/{user_uuid}/impersonate", response_model=ImpersonateResponse)
async def impersonate_user(
    user_uuid: str,
    current_user: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    result = await AdminService.impersonate_user(current_user.uuid, user_uuid, db)
    await db.commit()
    return result


@router.get("/orgs", response_model=List[AdminOrgResponse])
async def list_orgs(
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    return await AdminService.list_orgs(db, search=search, skip=skip, limit=limit)


@router.post("/orgs/{org_uuid}/suspend", response_model=MessageResponse)
async def suspend_org(
    org_uuid: str,
    current_user: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    await AdminService.suspend_org(org_uuid, current_user.uuid, db)
    await db.commit()
    return MessageResponse(message="Organization suspended")


@router.post("/orgs/{org_uuid}/reactivate", response_model=MessageResponse)
async def reactivate_org(
    org_uuid: str,
    current_user: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    await AdminService.reactivate_org(org_uuid, current_user.uuid, db)
    await db.commit()
    return MessageResponse(message="Organization reactivated")


@router.get("/events", response_model=List[PlatformEventResponse])
async def list_platform_events(
    event_type: Optional[str] = Query(None),
    actor_uuid: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    return await PlatformEventService.list_events(
        db=db,
        event_type=event_type,
        actor_uuid=actor_uuid,
        date_from=date_from,
        date_to=date_to,
        skip=skip,
        limit=limit,
    )
