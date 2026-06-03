from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from database import get_db
from dependencies import get_current_active_user
from models.user import User
from schemas.common import MessageResponse
from schemas.emergency_access import EmergencyAccessInviteRequest, EmergencyAccessResponse
from services.emergency_access_service import EmergencyAccessService

router = APIRouter(prefix="/emergency-access", tags=["emergency-access"])


@router.post("/invite", response_model=EmergencyAccessResponse, status_code=201)
async def invite_grantee(
    data: EmergencyAccessInviteRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await EmergencyAccessService.invite(
        current_user, data.email, data.type, data.wait_time_days, db
    )


@router.get("", response_model=List[EmergencyAccessResponse])
async def list_emergency_access(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await EmergencyAccessService.list_for_user(current_user, db)


@router.post("/{ea_uuid}/accept", response_model=EmergencyAccessResponse)
async def accept_emergency_access(
    ea_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await EmergencyAccessService.accept(current_user, ea_uuid, db)


@router.post("/{ea_uuid}/reject", response_model=EmergencyAccessResponse)
async def reject_emergency_access(
    ea_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await EmergencyAccessService.reject(current_user, ea_uuid, db)


@router.post("/{ea_uuid}/initiate", response_model=EmergencyAccessResponse)
async def initiate_recovery(
    ea_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await EmergencyAccessService.initiate_recovery(current_user, ea_uuid, db)


@router.post("/{ea_uuid}/approve", response_model=EmergencyAccessResponse)
async def approve_recovery(
    ea_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await EmergencyAccessService.approve_recovery(current_user, ea_uuid, db)


@router.post("/{ea_uuid}/reject-recovery", response_model=EmergencyAccessResponse)
async def reject_recovery(
    ea_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await EmergencyAccessService.reject_recovery(current_user, ea_uuid, db)


@router.delete("/{ea_uuid}", response_model=MessageResponse)
async def delete_emergency_access(
    ea_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await EmergencyAccessService.delete(current_user, ea_uuid, db)
    return MessageResponse(message="Emergency access removed")
