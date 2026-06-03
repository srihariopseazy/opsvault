from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from database import get_db
from dependencies import get_current_active_user
from models.user import User
from schemas.webhook import (
    WebhookCreate,
    WebhookUpdate,
    WebhookResponse,
    WebhookWithSecretResponse,
    WebhookDetailResponse,
    WebhookDeliveryResponse,
)
from schemas.common import MessageResponse
from services import webhook_service

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


def _to_response(wh) -> WebhookResponse:
    return WebhookResponse(
        uuid=wh.uuid,
        name=wh.name,
        url=wh.url,
        events=wh.events or [],
        is_active=bool(wh.is_active),
        created_at=wh.created_at,
        updated_at=wh.updated_at,
    )


def _to_with_secret(wh) -> WebhookWithSecretResponse:
    return WebhookWithSecretResponse(
        uuid=wh.uuid,
        name=wh.name,
        url=wh.url,
        secret=wh.secret,
        events=wh.events or [],
        is_active=bool(wh.is_active),
        created_at=wh.created_at,
        updated_at=wh.updated_at,
    )


def _to_delivery(d) -> WebhookDeliveryResponse:
    return WebhookDeliveryResponse(
        uuid=d.uuid,
        event_type=d.event_type,
        response_status=d.response_status,
        response_body=d.response_body,
        attempt_count=d.attempt_count,
        success=bool(d.success),
        delivered_at=d.delivered_at,
        created_at=d.created_at,
    )


# ── Org routes first (static prefix beats dynamic) ───────────────────────────

@router.get("/org/{org_uuid}", response_model=List[WebhookResponse])
async def list_org_webhooks(
    org_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    webhooks = await webhook_service.list_org_webhooks(org_uuid, current_user, db)
    return [_to_response(w) for w in webhooks]


@router.post("/org/{org_uuid}", response_model=WebhookWithSecretResponse, status_code=201)
async def create_org_webhook(
    org_uuid: str,
    data: WebhookCreate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    wh = await webhook_service.create_org_webhook(
        org_uuid, current_user, data, db, ip_address=_ip(request)
    )
    await db.commit()
    await db.refresh(wh)
    return _to_with_secret(wh)


@router.delete("/org/{org_uuid}/{webhook_uuid}", status_code=204)
async def delete_org_webhook(
    org_uuid: str,
    webhook_uuid: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await webhook_service.delete_org_webhook(
        org_uuid, webhook_uuid, current_user, db, ip_address=_ip(request)
    )
    await db.commit()


@router.post("/org/{org_uuid}/{webhook_uuid}/test", response_model=MessageResponse)
async def test_org_webhook(
    org_uuid: str,
    webhook_uuid: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await webhook_service.test_org_webhook(
        org_uuid, webhook_uuid, current_user, db, ip_address=_ip(request)
    )
    await db.commit()
    return MessageResponse(message="Test ping enqueued")


# ── Personal webhook routes ───────────────────────────────────────────────────

@router.get("", response_model=List[WebhookResponse])
async def list_webhooks(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    webhooks = await webhook_service.list_user_webhooks(current_user.id, db)
    return [_to_response(w) for w in webhooks]


@router.post("", response_model=WebhookWithSecretResponse, status_code=201)
async def create_webhook(
    data: WebhookCreate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    wh = await webhook_service.create_user_webhook(
        current_user, data, db, ip_address=_ip(request)
    )
    await db.commit()
    await db.refresh(wh)
    return _to_with_secret(wh)


@router.get("/{webhook_uuid}", response_model=WebhookDetailResponse)
async def get_webhook(
    webhook_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    wh = await webhook_service.get_user_webhook(webhook_uuid, current_user, db)
    deliveries = await webhook_service.get_webhook_deliveries(wh.id, db, limit=20)
    return WebhookDetailResponse(
        uuid=wh.uuid,
        name=wh.name,
        url=wh.url,
        secret=wh.secret,
        events=wh.events or [],
        is_active=bool(wh.is_active),
        created_at=wh.created_at,
        updated_at=wh.updated_at,
        recent_deliveries=[_to_delivery(d) for d in deliveries],
    )


@router.put("/{webhook_uuid}", response_model=WebhookResponse)
async def update_webhook(
    webhook_uuid: str,
    data: WebhookUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    wh = await webhook_service.update_user_webhook(webhook_uuid, current_user, data, db)
    await db.commit()
    await db.refresh(wh)
    return _to_response(wh)


@router.delete("/{webhook_uuid}", status_code=204)
async def delete_webhook(
    webhook_uuid: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await webhook_service.delete_user_webhook(
        webhook_uuid, current_user, db, ip_address=_ip(request)
    )
    await db.commit()


@router.post("/{webhook_uuid}/test", response_model=MessageResponse)
async def test_webhook(
    webhook_uuid: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await webhook_service.test_user_webhook(
        webhook_uuid, current_user, db, ip_address=_ip(request)
    )
    await db.commit()
    return MessageResponse(message="Test ping enqueued")


@router.get("/{webhook_uuid}/deliveries", response_model=List[WebhookDeliveryResponse])
async def get_deliveries(
    webhook_uuid: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    wh = await webhook_service.get_user_webhook(webhook_uuid, current_user, db)
    deliveries = await webhook_service.get_webhook_deliveries(wh.id, db, skip=skip, limit=limit)
    return [_to_delivery(d) for d in deliveries]
