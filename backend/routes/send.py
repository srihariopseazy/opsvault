from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from database import get_db
from dependencies import get_current_active_user
from models.user import User
from schemas.common import MessageResponse
from schemas.send import SendCreate, SendUpdate, SendResponse, PublicSendResponse
from services.send_service import SendService

router = APIRouter(prefix="/send", tags=["send"])


# ── Authenticated endpoints ───────────────────────────────────────────────────

@router.get("", response_model=List[SendResponse])
async def list_sends(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await SendService.list_sends(current_user, db)


@router.post("", response_model=SendResponse, status_code=201)
async def create_send(
    data: SendCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await SendService.create_send(current_user, data, db)


# ── Public endpoint (no auth) — must be before /{uuid} ───────────────────────

@router.get("/access/{access_id}", response_model=PublicSendResponse)
async def public_access(
    access_id: str,
    password: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Publicly accessible endpoint for viewing a send by its access_id.
    No authentication required.  The encrypted content is returned as-is;
    the decryption key lives only in the URL fragment on the client side."""
    return await SendService.public_access(access_id, password, db)


# ── Authenticated single-send endpoints (after the literal /access route) ────

@router.get("/{send_uuid}", response_model=SendResponse)
async def get_send(
    send_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await SendService.get_send(current_user, send_uuid, db)


@router.put("/{send_uuid}", response_model=SendResponse)
async def update_send(
    send_uuid: str,
    data: SendUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await SendService.update_send(current_user, send_uuid, data, db)


@router.delete("/{send_uuid}", response_model=MessageResponse)
async def delete_send(
    send_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await SendService.delete_send(current_user, send_uuid, db)
    return MessageResponse(message="Send deleted")
