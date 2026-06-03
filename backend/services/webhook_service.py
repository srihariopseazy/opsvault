import uuid
import secrets
import json
import hmac as hmac_mod
import hashlib
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, desc

from models.webhook import Webhook, WebhookDelivery
from models.org_member import OrgMember, OrgMemberRole, OrgMemberStatus
from models.user import User
from schemas.webhook import WebhookCreate, WebhookUpdate
from services.audit_service import AuditService

VALID_EVENTS = {
    "vault_item_created", "vault_item_updated", "vault_item_deleted",
    "login_success", "login_failed", "new_device_login",
    "org_member_invited", "org_member_accepted", "org_member_removed",
    "emergency_access_invited", "emergency_access_granted",
    "api_key_created", "api_key_revoked",
    "breach_detected", "send_item_viewed",
    "test_ping",
}


def _generate_secret() -> str:
    return secrets.token_hex(32)


def sign_payload(secret: str, payload_str: str) -> str:
    sig = hmac_mod.new(
        secret.encode("utf-8"),
        payload_str.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"sha256={sig}"


def build_payload(webhook_uuid: str, event_type: str, data: dict) -> dict:
    return {
        "event": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "opsvault_uuid": webhook_uuid,
        "data": data,
    }


async def _require_org_admin(org_uuid: str, user: User, db: AsyncSession) -> None:
    result = await db.execute(
        select(OrgMember).where(
            and_(
                OrgMember.org_id == org_uuid,
                OrgMember.user_id == user.id,
                OrgMember.status == OrgMemberStatus.accepted,
                OrgMember.role.in_([OrgMemberRole.owner, OrgMemberRole.admin]),
            )
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only org owners and admins can manage org webhooks",
        )


# ── Personal webhooks ─────────────────────────────────────────────────────────

async def list_user_webhooks(user_id: int, db: AsyncSession) -> List[Webhook]:
    result = await db.execute(
        select(Webhook)
        .where(Webhook.user_id == user_id)
        .order_by(desc(Webhook.created_at))
    )
    return list(result.scalars().all())


async def create_user_webhook(
    user: User,
    data: WebhookCreate,
    db: AsyncSession,
    ip_address: Optional[str] = None,
) -> Webhook:
    events = [e for e in data.events if e in VALID_EVENTS]
    if not events:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid event types provided")

    wh = Webhook(
        uuid=str(uuid.uuid4()),
        user_id=user.id,
        org_id=None,
        name=data.name,
        url=data.url,
        secret=_generate_secret(),
        events=events,
        is_active=1,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(wh)
    await db.flush()

    await AuditService.log(
        db,
        action="webhook.created",
        user_id=user.id,
        target_type="webhook",
        target_id=wh.uuid,
        ip_address=ip_address,
    )
    return wh


async def get_user_webhook(
    webhook_uuid: str,
    user: User,
    db: AsyncSession,
) -> Webhook:
    result = await db.execute(
        select(Webhook).where(
            and_(Webhook.uuid == webhook_uuid, Webhook.user_id == user.id)
        )
    )
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")
    return wh


async def get_webhook_deliveries(
    webhook_id: int,
    db: AsyncSession,
    skip: int = 0,
    limit: int = 20,
) -> List[WebhookDelivery]:
    result = await db.execute(
        select(WebhookDelivery)
        .where(WebhookDelivery.webhook_id == webhook_id)
        .order_by(desc(WebhookDelivery.created_at))
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all())


async def update_user_webhook(
    webhook_uuid: str,
    user: User,
    data: WebhookUpdate,
    db: AsyncSession,
) -> Webhook:
    wh = await get_user_webhook(webhook_uuid, user, db)

    if data.name is not None:
        wh.name = data.name
    if data.url is not None:
        wh.url = data.url
    if data.events is not None:
        events = [e for e in data.events if e in VALID_EVENTS]
        if not events:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid event types provided")
        wh.events = events
    if data.is_active is not None:
        wh.is_active = 1 if data.is_active else 0
    wh.updated_at = datetime.now(timezone.utc)
    return wh


async def delete_user_webhook(
    webhook_uuid: str,
    user: User,
    db: AsyncSession,
    ip_address: Optional[str] = None,
) -> None:
    wh = await get_user_webhook(webhook_uuid, user, db)
    await db.delete(wh)
    await AuditService.log(
        db,
        action="webhook.deleted",
        user_id=user.id,
        target_type="webhook",
        target_id=webhook_uuid,
        ip_address=ip_address,
    )


async def test_user_webhook(
    webhook_uuid: str,
    user: User,
    db: AsyncSession,
    ip_address: Optional[str] = None,
) -> None:
    wh = await get_user_webhook(webhook_uuid, user, db)
    payload = build_payload(wh.uuid, "test_ping", {"message": "This is a test ping from OPSVAULT"})

    from tasks.webhook_tasks import deliver_webhook
    deliver_webhook.delay(wh.uuid, "test_ping", payload)

    await AuditService.log(
        db,
        action="webhook.tested",
        user_id=user.id,
        target_type="webhook",
        target_id=webhook_uuid,
        ip_address=ip_address,
    )


# ── Org webhooks ──────────────────────────────────────────────────────────────

async def list_org_webhooks(
    org_uuid: str,
    user: User,
    db: AsyncSession,
) -> List[Webhook]:
    await _require_org_admin(org_uuid, user, db)
    result = await db.execute(
        select(Webhook)
        .where(Webhook.org_id == org_uuid)
        .order_by(desc(Webhook.created_at))
    )
    return list(result.scalars().all())


async def create_org_webhook(
    org_uuid: str,
    user: User,
    data: WebhookCreate,
    db: AsyncSession,
    ip_address: Optional[str] = None,
) -> Webhook:
    await _require_org_admin(org_uuid, user, db)

    events = [e for e in data.events if e in VALID_EVENTS]
    if not events:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid event types provided")

    wh = Webhook(
        uuid=str(uuid.uuid4()),
        user_id=None,
        org_id=org_uuid,
        name=data.name,
        url=data.url,
        secret=_generate_secret(),
        events=events,
        is_active=1,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(wh)
    await db.flush()

    await AuditService.log(
        db,
        action="org_webhook.created",
        user_id=user.id,
        target_type="webhook",
        target_id=wh.uuid,
        ip_address=ip_address,
        extra_details={"org_uuid": org_uuid},
    )
    return wh


async def delete_org_webhook(
    org_uuid: str,
    webhook_uuid: str,
    user: User,
    db: AsyncSession,
    ip_address: Optional[str] = None,
) -> None:
    await _require_org_admin(org_uuid, user, db)

    result = await db.execute(
        select(Webhook).where(
            and_(Webhook.uuid == webhook_uuid, Webhook.org_id == org_uuid)
        )
    )
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")

    await db.delete(wh)
    await AuditService.log(
        db,
        action="org_webhook.deleted",
        user_id=user.id,
        target_type="webhook",
        target_id=webhook_uuid,
        ip_address=ip_address,
        extra_details={"org_uuid": org_uuid},
    )


async def test_org_webhook(
    org_uuid: str,
    webhook_uuid: str,
    user: User,
    db: AsyncSession,
    ip_address: Optional[str] = None,
) -> None:
    await _require_org_admin(org_uuid, user, db)

    result = await db.execute(
        select(Webhook).where(
            and_(Webhook.uuid == webhook_uuid, Webhook.org_id == org_uuid)
        )
    )
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found")

    payload = build_payload(wh.uuid, "test_ping", {"message": "This is a test ping from OPSVAULT"})

    from tasks.webhook_tasks import deliver_webhook
    deliver_webhook.delay(wh.uuid, "test_ping", payload)

    await AuditService.log(
        db,
        action="org_webhook.tested",
        user_id=user.id,
        target_type="webhook",
        target_id=webhook_uuid,
        ip_address=ip_address,
        extra_details={"org_uuid": org_uuid},
    )


# ── Event trigger ─────────────────────────────────────────────────────────────

async def trigger_event(
    db: AsyncSession,
    user_id: Optional[int],
    org_id: Optional[str],
    event_type: str,
    data: dict,
) -> None:
    """Find all matching active webhooks and enqueue delivery tasks."""
    if not user_id and not org_id:
        return

    conditions = [Webhook.is_active == 1]
    scope_conds = []
    if user_id:
        scope_conds.append(Webhook.user_id == user_id)
    if org_id:
        scope_conds.append(Webhook.org_id == org_id)
    conditions.append(or_(*scope_conds))

    result = await db.execute(select(Webhook).where(and_(*conditions)))
    webhooks = result.scalars().all()

    from tasks.webhook_tasks import deliver_webhook

    for wh in webhooks:
        if event_type not in (wh.events or []):
            continue
        payload = build_payload(wh.uuid, event_type, data)
        try:
            deliver_webhook.delay(wh.uuid, event_type, payload)
        except Exception:
            pass
