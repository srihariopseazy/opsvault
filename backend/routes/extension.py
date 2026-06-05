import uuid as _uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from database import get_db
from dependencies import get_current_active_user
from models.user import User
from models.vault_item import VaultItem, VaultItemType
from models.autofill_log import AutofillLog
from schemas.extension import (
    MatchedItemResponse,
    AutofillLogRequest,
    ExtensionSettingsResponse,
)

router = APIRouter(prefix="/extension", tags=["extension"])


@router.get("/match", response_model=List[MatchedItemResponse])
async def match_items(
    url: str = "",
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all non-deleted login items for the current user.
    URI-based filtering is done client-side after decryption."""
    result = await db.execute(
        select(VaultItem).where(
            VaultItem.user_id == current_user.id,
            VaultItem.type == VaultItemType.login,
            VaultItem.deleted_at.is_(None),
        )
    )
    items = result.scalars().all()
    return [
        MatchedItemResponse(
            uuid=item.uuid,
            name=item.name,
            item_data=item.item_data,
            favorite=bool(item.favorite),
        )
        for item in items
    ]


@router.post("/autofill-log", status_code=201)
async def log_autofill(
    body: AutofillLogRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    log = AutofillLog(
        uuid=str(_uuid.uuid4()),
        user_id=current_user.id,
        item_uuid=body.item_uuid,
        url=body.url,
    )
    db.add(log)
    await db.commit()
    return {"message": "Logged"}


@router.get("/settings", response_model=ExtensionSettingsResponse)
async def extension_settings(
    current_user: User = Depends(get_current_active_user),
):
    return ExtensionSettingsResponse(
        email=current_user.email,
        name=current_user.name,
        totp_enabled=bool(current_user.totp_enabled),
    )
