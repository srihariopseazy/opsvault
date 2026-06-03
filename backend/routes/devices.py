from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Any

from database import get_db
from dependencies import get_current_active_user, get_current_superuser
from models.user import User
from schemas.device import DeviceResponse, AdminDeviceResponse, DeviceWipeRequest
from schemas.common import MessageResponse
from services import device_service

router = APIRouter(prefix="/devices", tags=["devices"])


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


def _to_response(d) -> DeviceResponse:
    return DeviceResponse(
        uuid=d.uuid,
        device_name=d.device_name,
        device_type=d.device_type,
        browser=d.browser,
        os=d.os,
        ip_address=d.ip_address,
        last_seen_ip=d.last_seen_ip,
        is_trusted=bool(d.is_trusted),
        last_used_at=d.last_used_at,
        created_at=d.created_at,
        status=d.status.value if d.status else "active",
        wiped_at=d.wiped_at,
        device_fingerprint=d.device_fingerprint,
    )


# ── Admin routes first (static prefix beats dynamic) ─────────────────────────

@router.get("/admin/all", response_model=List[Any])
async def admin_list_all_devices(
    _: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    return await device_service.admin_list_all_devices(db)


@router.post("/admin/{device_uuid}/wipe", response_model=DeviceResponse)
async def admin_wipe_device(
    device_uuid: str,
    request: Request,
    _: User = Depends(get_current_superuser),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    device = await device_service.admin_wipe_device(
        db, device_uuid, current_user.id, ip_address=_ip(request)
    )
    await db.commit()
    await db.refresh(device)
    return _to_response(device)


# ── User device routes ────────────────────────────────────────────────────────

@router.get("", response_model=List[DeviceResponse])
async def list_devices(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    devices = await device_service.list_user_devices(db, current_user.id)
    return [_to_response(d) for d in devices]


@router.get("/{device_uuid}", response_model=DeviceResponse)
async def get_device(
    device_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    device = await device_service.get_device(db, device_uuid, current_user.id)
    return _to_response(device)


@router.post("/{device_uuid}/revoke", response_model=DeviceResponse)
async def revoke_device(
    device_uuid: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    device = await device_service.revoke_device(
        db, device_uuid, current_user.id, ip_address=_ip(request)
    )
    await db.commit()
    await db.refresh(device)
    return _to_response(device)


@router.post("/{device_uuid}/wipe", response_model=DeviceResponse)
async def wipe_device(
    device_uuid: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    device = await device_service.wipe_device(
        db, device_uuid, current_user.id, ip_address=_ip(request)
    )
    await db.commit()
    await db.refresh(device)
    return _to_response(device)


@router.post("/{device_uuid}/trust", response_model=DeviceResponse)
async def trust_device(
    device_uuid: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    device = await device_service.trust_device(
        db, device_uuid, current_user.id, ip_address=_ip(request)
    )
    await db.commit()
    await db.refresh(device)
    return _to_response(device)


@router.post("/{device_uuid}/untrust", response_model=DeviceResponse)
async def untrust_device(
    device_uuid: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    device = await device_service.untrust_device(
        db, device_uuid, current_user.id, ip_address=_ip(request)
    )
    await db.commit()
    await db.refresh(device)
    return _to_response(device)
