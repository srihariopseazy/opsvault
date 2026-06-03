import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from models.device import Device, DeviceStatus
from models.session import Session
from models.user import User
from services.audit_service import AuditService


async def _get_or_404(db: AsyncSession, device_uuid: str, user_id: int) -> Device:
    result = await db.execute(
        select(Device).where(
            and_(Device.uuid == device_uuid, Device.user_id == user_id)
        )
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    return device


async def _invalidate_user_sessions(db: AsyncSession, user_id: int) -> int:
    result = await db.execute(select(Session).where(Session.user_id == user_id))
    sessions = result.scalars().all()
    count = len(sessions)
    for s in sessions:
        await db.delete(s)
    await db.flush()
    return count


# ── User-facing operations ────────────────────────────────────────────────────

async def list_user_devices(db: AsyncSession, user_id: int) -> List[Device]:
    result = await db.execute(
        select(Device)
        .where(Device.user_id == user_id)
        .order_by(Device.last_used_at.desc().nullslast())
    )
    return list(result.scalars().all())


async def get_device(db: AsyncSession, device_uuid: str, user_id: int) -> Device:
    return await _get_or_404(db, device_uuid, user_id)


async def revoke_device(
    db: AsyncSession,
    device_uuid: str,
    user_id: int,
    ip_address: Optional[str] = None,
) -> Device:
    device = await _get_or_404(db, device_uuid, user_id)
    device.status = DeviceStatus.revoked
    await _invalidate_user_sessions(db, user_id)

    await AuditService.log(
        db,
        action="device.revoked",
        user_id=user_id,
        target_type="device",
        target_id=device_uuid,
        ip_address=ip_address,
    )
    return device


async def wipe_device(
    db: AsyncSession,
    device_uuid: str,
    user_id: int,
    admin_id: Optional[int] = None,
    ip_address: Optional[str] = None,
) -> Device:
    device = await _get_or_404(db, device_uuid, user_id)
    now = datetime.now(timezone.utc)
    device.status   = DeviceStatus.wiped
    device.wiped_at = now
    device.wiped_by = admin_id or user_id
    await _invalidate_user_sessions(db, user_id)

    await AuditService.log(
        db,
        action="device.wiped",
        user_id=admin_id or user_id,
        target_type="device",
        target_id=device_uuid,
        ip_address=ip_address,
        extra_details={"target_user_id": user_id, "by_admin": admin_id is not None},
    )
    return device


async def trust_device(
    db: AsyncSession,
    device_uuid: str,
    user_id: int,
    ip_address: Optional[str] = None,
) -> Device:
    device = await _get_or_404(db, device_uuid, user_id)
    device.is_trusted = 1
    await AuditService.log(
        db,
        action="device.trusted",
        user_id=user_id,
        target_type="device",
        target_id=device_uuid,
        ip_address=ip_address,
    )
    return device


async def untrust_device(
    db: AsyncSession,
    device_uuid: str,
    user_id: int,
    ip_address: Optional[str] = None,
) -> Device:
    device = await _get_or_404(db, device_uuid, user_id)
    device.is_trusted = 0
    await AuditService.log(
        db,
        action="device.untrusted",
        user_id=user_id,
        target_type="device",
        target_id=device_uuid,
        ip_address=ip_address,
    )
    return device


async def update_last_seen(
    db: AsyncSession,
    fingerprint: str,
    user_id: int,
    ip: Optional[str],
) -> None:
    result = await db.execute(
        select(Device).where(
            and_(
                Device.device_fingerprint == fingerprint,
                Device.user_id == user_id,
            )
        )
    )
    device = result.scalar_one_or_none()
    if device:
        device.last_used_at = datetime.now(timezone.utc)
        device.last_seen_ip = ip


# ── Admin operations ──────────────────────────────────────────────────────────

async def admin_list_all_devices(db: AsyncSession) -> List[dict]:
    result = await db.execute(
        select(Device, User)
        .join(User, User.id == Device.user_id)
        .order_by(Device.last_used_at.desc().nullslast())
    )
    rows = result.all()
    out = []
    for device, user in rows:
        out.append({
            "uuid":               device.uuid,
            "user_id":            device.user_id,
            "user_email":         user.email,
            "user_name":          user.name,
            "device_fingerprint": device.device_fingerprint,
            "device_name":        device.device_name,
            "device_type":        device.device_type,
            "browser":            device.browser,
            "os":                 device.os,
            "ip_address":         device.ip_address,
            "last_seen_ip":       device.last_seen_ip,
            "is_trusted":         bool(device.is_trusted),
            "last_used_at":       device.last_used_at,
            "created_at":         device.created_at,
            "status":             device.status.value if device.status else "active",
            "wiped_at":           device.wiped_at,
        })
    return out


async def admin_wipe_device(
    db: AsyncSession,
    device_uuid: str,
    admin_id: int,
    ip_address: Optional[str] = None,
) -> Device:
    result = await db.execute(select(Device).where(Device.uuid == device_uuid))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")

    now = datetime.now(timezone.utc)
    device.status   = DeviceStatus.wiped
    device.wiped_at = now
    device.wiped_by = admin_id
    await _invalidate_user_sessions(db, device.user_id)

    await AuditService.log(
        db,
        action="device.admin_wiped",
        user_id=admin_id,
        target_type="device",
        target_id=device_uuid,
        ip_address=ip_address,
        extra_details={"target_user_id": device.user_id},
    )
    return device


async def register_or_update_device(
    db: AsyncSession,
    user_id: int,
    fingerprint: str,
    device_name: Optional[str],
    device_type: Optional[str],
    ip_address: Optional[str],
    browser: Optional[str] = None,
    os: Optional[str] = None,
) -> Device:
    result = await db.execute(
        select(Device).where(
            and_(
                Device.device_fingerprint == fingerprint,
                Device.user_id == user_id,
            )
        )
    )
    device = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if device:
        device.last_used_at = now
        device.last_seen_ip = ip_address
        if device_name:
            device.device_name = device_name
    else:
        device = Device(
            uuid=str(uuid.uuid4()),
            user_id=user_id,
            device_fingerprint=fingerprint,
            device_name=device_name,
            device_type=device_type,
            browser=browser,
            os=os,
            ip_address=ip_address,
            last_seen_ip=ip_address,
            is_trusted=0,
            last_used_at=now,
            status=DeviceStatus.active,
        )
        db.add(device)
        await db.flush()
    return device
