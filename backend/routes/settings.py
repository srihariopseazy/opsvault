from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from dependencies import get_current_active_user
from models.user import User
from models.session import Session
from schemas.common import MessageResponse

router = APIRouter(prefix="/settings", tags=["settings"])


@router.post("/logout-all", response_model=MessageResponse)
async def logout_all_devices(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Invalidate every active session for the current user."""
    result = await db.execute(
        select(Session).where(Session.user_id == current_user.id)
    )
    sessions = result.scalars().all()
    for sess in sessions:
        await db.delete(sess)
    await db.flush()
    return MessageResponse(message=f"Logged out {len(sessions)} session(s) across all devices")


@router.delete("/account", status_code=status.HTTP_200_OK, response_model=MessageResponse)
async def delete_account(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete the account and all associated vault data."""
    await db.delete(current_user)
    await db.flush()
    return MessageResponse(message="Account permanently deleted")
