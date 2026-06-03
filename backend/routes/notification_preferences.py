import uuid as _uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from dependencies import get_current_active_user
from models.user import User
from models.notification_preference import NotificationPreference
from schemas.notification_preference import (
    NotificationPreferenceUpdate,
    NotificationPreferenceResponse,
)

router = APIRouter(prefix="/users/me/notification-preferences", tags=["notification-preferences"])


async def _get_or_create(user: User, db: AsyncSession) -> NotificationPreference:
    result = await db.execute(
        select(NotificationPreference).where(
            NotificationPreference.user_uuid == user.uuid
        )
    )
    pref = result.scalar_one_or_none()
    if not pref:
        pref = NotificationPreference(uuid=str(_uuid.uuid4()), user_uuid=user.uuid)
        db.add(pref)
        await db.flush()
    return pref


def _to_response(pref: NotificationPreference) -> NotificationPreferenceResponse:
    return NotificationPreferenceResponse(
        new_device_login=bool(pref.new_device_login),
        master_password_changed=bool(pref.master_password_changed),
        send_item_viewed=bool(pref.send_item_viewed),
        org_invites=bool(pref.org_invites),
        emergency_access=bool(pref.emergency_access),
    )


@router.get("", response_model=NotificationPreferenceResponse)
async def get_preferences(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    pref = await _get_or_create(current_user, db)
    return _to_response(pref)


@router.put("", response_model=NotificationPreferenceResponse)
async def update_preferences(
    data: NotificationPreferenceUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    pref = await _get_or_create(current_user, db)
    if data.new_device_login       is not None: pref.new_device_login       = 1 if data.new_device_login       else 0
    if data.master_password_changed is not None: pref.master_password_changed = 1 if data.master_password_changed else 0
    if data.send_item_viewed        is not None: pref.send_item_viewed        = 1 if data.send_item_viewed        else 0
    if data.org_invites             is not None: pref.org_invites             = 1 if data.org_invites             else 0
    if data.emergency_access        is not None: pref.emergency_access        = 1 if data.emergency_access        else 0
    await db.flush()
    await db.commit()
    return _to_response(pref)
