from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from database import get_db
from dependencies import get_current_active_user
from models.user import User
from schemas.notifications import NotificationResponse, UnreadCountResponse
from schemas.common import MessageResponse
from services.notification_service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=List[NotificationResponse])
async def list_notifications(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await NotificationService.list_recent(current_user.id, db)


@router.get("/unread-count", response_model=UnreadCountResponse)
async def unread_count(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    count = await NotificationService.unread_count(current_user.id, db)
    return UnreadCountResponse(unread_count=count)


@router.post("/read-all", response_model=MessageResponse)
async def mark_all_read(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    count = await NotificationService.mark_all_read(current_user.id, db)
    return MessageResponse(message=f"Marked {count} notification(s) as read")


@router.post("/{notif_uuid}/read", response_model=MessageResponse)
async def mark_one_read(
    notif_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await NotificationService.mark_read(current_user.id, notif_uuid, db)
    return MessageResponse(message="Notification marked as read")
