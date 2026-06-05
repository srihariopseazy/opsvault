import uuid as _uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from database import get_db
from dependencies import get_current_active_user
from models.user import User
from models.push import PushSubscription
from schemas.push import PushSubscribeRequest, PushSubscriptionResponse

router = APIRouter(prefix="/push", tags=["push"])


@router.post("/subscribe", response_model=PushSubscriptionResponse, status_code=201)
async def subscribe(
    body: PushSubscribeRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    # Avoid duplicate endpoint for this user
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == current_user.id,
            PushSubscription.endpoint == body.endpoint,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    sub = PushSubscription(
        uuid=str(_uuid.uuid4()),
        user_id=current_user.id,
        endpoint=body.endpoint,
        p256dh=body.p256dh,
        auth=body.auth,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


@router.get("/subscriptions", response_model=List[PushSubscriptionResponse])
async def list_subscriptions(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.user_id == current_user.id)
    )
    return result.scalars().all()


@router.delete("/subscribe/{subscription_uuid}", status_code=204)
async def unsubscribe(
    subscription_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.uuid == subscription_uuid,
            PushSubscription.user_id == current_user.id,
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    await db.delete(sub)
    await db.commit()
