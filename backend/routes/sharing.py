import uuid as _uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from database import get_db
from dependencies import get_current_active_user
from models.user import User
from models.vault_item import VaultItem
from models.sharing import VaultShare, UserPublicKey, ShareStatus, SharePermission
from schemas.sharing import (
    ShareCreateRequest,
    VaultShareResponse,
    SharedItemResponse,
    PublicKeyUploadRequest,
    PublicKeyResponse,
)
from services.notification_service import NotificationService

router = APIRouter(tags=["sharing"])


# ─── Key management ────────────────────────────────────────────────────────────

@router.post("/keys/public", status_code=201)
async def upload_public_key(
    body: PublicKeyUploadRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserPublicKey).where(UserPublicKey.user_id == current_user.id)
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.public_key = body.public_key
        existing.updated_at = datetime.utcnow()
    else:
        db.add(UserPublicKey(user_id=current_user.id, public_key=body.public_key))
    await db.commit()
    return {"message": "Public key saved"}


@router.get("/keys/public/{user_email}", response_model=PublicKeyResponse)
async def get_public_key(
    user_email: str,
    _: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == user_email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result2 = await db.execute(
        select(UserPublicKey).where(UserPublicKey.user_id == user.id)
    )
    pk = result2.scalar_one_or_none()
    if not pk:
        raise HTTPException(status_code=404, detail="Recipient has not set up sharing keys")

    return PublicKeyResponse(user_email=user.email, public_key=pk.public_key)


# ─── Sharing ───────────────────────────────────────────────────────────────────

@router.post("/sharing/share", response_model=VaultShareResponse, status_code=201)
async def create_share(
    body: ShareCreateRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VaultItem).where(
            VaultItem.uuid == body.vault_item_uuid,
            VaultItem.user_id == current_user.id,
            VaultItem.deleted_at.is_(None),
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Vault item not found")

    result2 = await db.execute(select(User).where(User.email == body.recipient_email))
    recipient = result2.scalar_one_or_none()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    if recipient.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot share with yourself")

    perm = body.permissions if body.permissions in ("view", "edit") else "view"

    expires_at = None
    if body.expires_in_days:
        expires_at = datetime.utcnow() + timedelta(days=body.expires_in_days)

    share = VaultShare(
        uuid=str(_uuid.uuid4()),
        sharer_id=current_user.id,
        recipient_id=recipient.id,
        recipient_email=body.recipient_email,
        vault_item_id=item.id,
        encrypted_item_data=body.encrypted_item_data,
        encrypted_item_key=body.encrypted_item_key,
        permissions=perm,
        message=body.message,
        expires_at=expires_at,
    )
    db.add(share)
    await db.flush()

    await NotificationService.create(
        recipient.id,
        "share.created",
        f"{current_user.email} shared a vault item with you",
        body.message or "You have a new shared vault item — visit Shared to accept.",
        db,
    )

    await db.commit()
    await db.refresh(share)
    return _to_response(share, sharer_email=current_user.email)


@router.get("/sharing/shared-by-me", response_model=List[VaultShareResponse])
async def shared_by_me(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VaultShare)
        .where(VaultShare.sharer_id == current_user.id)
        .order_by(VaultShare.created_at.desc())
    )
    return [_to_response(s, sharer_email=current_user.email) for s in result.scalars().all()]


@router.get("/sharing/shared-with-me", response_model=List[VaultShareResponse])
async def shared_with_me(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VaultShare)
        .where(VaultShare.recipient_id == current_user.id)
        .order_by(VaultShare.created_at.desc())
    )
    return [_to_response(s) for s in result.scalars().all()]


@router.post("/sharing/share/{share_uuid}/accept", response_model=VaultShareResponse)
async def accept_share(
    share_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    share = await _get_recipient_share(share_uuid, current_user.id, db)
    if share.status != ShareStatus.pending:
        raise HTTPException(status_code=400, detail=f"Share is already {share.status.value}")

    if share.expires_at and share.expires_at < datetime.utcnow():
        share.status = ShareStatus.expired
        await db.commit()
        raise HTTPException(status_code=410, detail="Share has expired")

    share.status = ShareStatus.accepted
    share.accepted_at = datetime.utcnow()

    result = await db.execute(select(User).where(User.id == share.sharer_id))
    sharer = result.scalar_one_or_none()
    if sharer:
        await NotificationService.create(
            sharer.id, "share.accepted",
            f"{current_user.email} accepted your shared item",
            "Your shared vault item was accepted.",
            db,
        )

    await db.commit()
    await db.refresh(share)
    return _to_response(share)


@router.post("/sharing/share/{share_uuid}/decline", response_model=VaultShareResponse)
async def decline_share(
    share_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    share = await _get_recipient_share(share_uuid, current_user.id, db)
    if share.status not in (ShareStatus.pending, ShareStatus.accepted):
        raise HTTPException(status_code=400, detail=f"Share is {share.status.value}")

    share.status = ShareStatus.declined

    result = await db.execute(select(User).where(User.id == share.sharer_id))
    sharer = result.scalar_one_or_none()
    if sharer:
        await NotificationService.create(
            sharer.id, "share.declined",
            f"{current_user.email} declined your shared item",
            "Your shared vault item was declined.",
            db,
        )

    await db.commit()
    await db.refresh(share)
    return _to_response(share)


@router.post("/sharing/share/{share_uuid}/revoke", response_model=VaultShareResponse)
async def revoke_share(
    share_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VaultShare).where(
            VaultShare.uuid == share_uuid,
            VaultShare.sharer_id == current_user.id,
        )
    )
    share = result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    if share.status in (ShareStatus.revoked, ShareStatus.expired):
        raise HTTPException(status_code=400, detail=f"Share is already {share.status.value}")

    share.status = ShareStatus.revoked

    if share.recipient_id:
        result2 = await db.execute(select(User).where(User.id == share.recipient_id))
        recipient = result2.scalar_one_or_none()
        if recipient:
            await NotificationService.create(
                recipient.id, "share.revoked",
                "A shared vault item was revoked",
                f"{current_user.email} revoked access to a shared item.",
                db,
            )

    await db.commit()
    await db.refresh(share)
    return _to_response(share, sharer_email=current_user.email)


@router.get("/sharing/share/{share_uuid}/item", response_model=SharedItemResponse)
async def get_shared_item(
    share_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VaultShare).where(
            VaultShare.uuid == share_uuid,
            VaultShare.recipient_id == current_user.id,
            VaultShare.status == ShareStatus.accepted,
        )
    )
    share = result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found or not accepted")

    if share.expires_at and share.expires_at < datetime.utcnow():
        share.status = ShareStatus.expired
        await db.commit()
        raise HTTPException(status_code=410, detail="Share has expired")

    result2 = await db.execute(select(User).where(User.id == share.sharer_id))
    sharer = result2.scalar_one_or_none()

    perm = share.permissions.value if hasattr(share.permissions, "value") else share.permissions
    return SharedItemResponse(
        share_uuid=share.uuid,
        encrypted_item_data=share.encrypted_item_data,
        encrypted_item_key=share.encrypted_item_key,
        permissions=perm,
        sharer_email=sharer.email if sharer else "",
    )


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _get_recipient_share(share_uuid: str, user_id: int, db: AsyncSession) -> VaultShare:
    result = await db.execute(
        select(VaultShare).where(
            VaultShare.uuid == share_uuid,
            VaultShare.recipient_id == user_id,
        )
    )
    share = result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    return share


def _to_response(share: VaultShare, sharer_email: str = None) -> VaultShareResponse:
    status = share.status.value if hasattr(share.status, "value") else share.status
    perm   = share.permissions.value if hasattr(share.permissions, "value") else share.permissions
    return VaultShareResponse(
        uuid=share.uuid,
        recipient_email=share.recipient_email,
        permissions=perm,
        status=status,
        message=share.message,
        expires_at=share.expires_at,
        accepted_at=share.accepted_at,
        created_at=share.created_at,
        sharer_email=sharer_email,
    )
