import asyncio
import json
import uuid as uuid_lib
import logging
from datetime import datetime, timezone

import httpx

from celery_app import celery_app

logger = logging.getLogger("opsvault.webhooks")


class _DeliveryError(Exception):
    pass


async def _async_deliver(
    webhook_uuid: str,
    event_type: str,
    payload_dict: dict,
    attempt: int,
) -> None:
    from database import AsyncSessionLocal
    from models.webhook import Webhook, WebhookDelivery
    from services.webhook_service import sign_payload
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Webhook).where(Webhook.uuid == webhook_uuid))
        webhook = result.scalar_one_or_none()

        if not webhook or not webhook.is_active:
            return

        payload_str = json.dumps(payload_dict, default=str)
        sig = sign_payload(webhook.secret, payload_str)

        response_status = None
        response_body = None
        success = False

        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(
                    webhook.url,
                    content=payload_str.encode("utf-8"),
                    headers={
                        "Content-Type": "application/json",
                        "X-OPSVAULT-Signature": sig,
                        "User-Agent": "OPSVAULT-Webhooks/1.0",
                    },
                )
            response_status = resp.status_code
            response_body = resp.text[:4000]
            success = 200 <= resp.status_code < 300
        except Exception as e:
            response_body = str(e)[:4000]
            success = False

        delivery = WebhookDelivery(
            uuid=str(uuid_lib.uuid4()),
            webhook_id=webhook.id,
            event_type=event_type,
            payload=payload_dict,
            response_status=response_status,
            response_body=response_body,
            attempt_count=attempt,
            success=1 if success else 0,
            delivered_at=datetime.now(timezone.utc) if success else None,
            created_at=datetime.now(timezone.utc),
        )
        db.add(delivery)
        await db.commit()

        if not success:
            raise _DeliveryError(
                f"Webhook delivery failed (HTTP {response_status}): {response_body}"
            )


@celery_app.task(
    bind=True,
    max_retries=3,
    name="tasks.deliver_webhook",
    ignore_result=True,
)
def deliver_webhook(self, webhook_uuid: str, event_type: str, payload_dict: dict):
    attempt = self.request.retries + 1
    try:
        asyncio.run(_async_deliver(webhook_uuid, event_type, payload_dict, attempt))
    except _DeliveryError as exc:
        logger.warning(
            "Webhook %s delivery attempt %d failed: %s",
            webhook_uuid, attempt, exc,
        )
        countdown = 60 * (2 ** self.request.retries)
        raise self.retry(exc=exc, countdown=countdown)
    except Exception as exc:
        logger.error(
            "Webhook %s unexpected error on attempt %d: %s",
            webhook_uuid, attempt, exc,
        )
        countdown = 60 * (2 ** self.request.retries)
        raise self.retry(exc=exc, countdown=countdown)
