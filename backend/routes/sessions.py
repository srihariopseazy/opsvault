from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

from database import get_db
from dependencies import get_current_active_user
from models.user import User
from models.session import Session
from models.login_event import LoginEvent
from schemas.common import MessageResponse
from services.token_service import TokenService

router = APIRouter(prefix="/sessions", tags=["sessions"])


# ── Response schemas ──────────────────────────────────────────────────────────

class SessionResponse(BaseModel):
    uuid: str
    device_name: Optional[str] = None
    device_type: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    is_current: bool = False

    class Config:
        from_attributes = True


class LoginEventResponse(BaseModel):
    uuid: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    device_name: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Helpers ───────────────────────────────────────────────────────────────────

def _current_jti(request: Request) -> Optional[str]:
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        return None
    payload = TokenService.decode_access_token(token)
    return payload.get("jti") if payload else None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[SessionResponse])
async def list_sessions(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all active sessions for the current user, marking the caller's
    own session with is_current=True."""
    current_jti = _current_jti(request)

    result = await db.execute(
        select(Session)
        .where(Session.user_id == current_user.id)
        .order_by(Session.created_at.desc())
    )
    sessions = result.scalars().all()

    return [
        SessionResponse(
            uuid=s.uuid,
            device_name=s.device_name,
            device_type=s.device_type,
            ip_address=s.ip_address,
            created_at=s.created_at,
            last_used_at=s.last_used_at,
            is_current=(s.jti == current_jti),
        )
        for s in sessions
    ]


@router.delete("/revoke-all", response_model=MessageResponse)
async def revoke_all_sessions(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete every session for the current user except the one making this
    request, forcing all other devices to re-authenticate."""
    current_jti = _current_jti(request)

    result = await db.execute(
        select(Session).where(
            and_(
                Session.user_id == current_user.id,
                Session.jti != current_jti,
            )
        )
    )
    sessions = result.scalars().all()
    count = len(sessions)
    for s in sessions:
        await db.delete(s)
    await db.flush()

    return MessageResponse(message=f"Revoked {count} other session(s)")


@router.delete("/{session_uuid}", response_model=MessageResponse)
async def revoke_session(
    session_uuid: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a specific session by its UUID."""
    current_jti = _current_jti(request)

    result = await db.execute(
        select(Session).where(
            and_(
                Session.uuid == session_uuid,
                Session.user_id == current_user.id,
            )
        )
    )
    session = result.scalar_one_or_none()

    if not session:
        from fastapi import HTTPException, status as http_status
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    is_self = session.jti == current_jti
    await db.delete(session)
    await db.flush()

    if is_self:
        return MessageResponse(message="Current session revoked — you have been logged out")
    return MessageResponse(message="Session revoked")


@router.get("/login-events", response_model=List[LoginEventResponse])
async def list_login_events(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the last 20 login events for the current user."""
    result = await db.execute(
        select(LoginEvent)
        .where(LoginEvent.user_id == current_user.id)
        .order_by(LoginEvent.created_at.desc())
        .limit(20)
    )
    events = result.scalars().all()
    return [
        LoginEventResponse(
            uuid=e.uuid,
            ip_address=e.ip_address,
            user_agent=e.user_agent,
            device_name=e.device_name,
            status=e.status.value,
            created_at=e.created_at,
        )
        for e in events
    ]
