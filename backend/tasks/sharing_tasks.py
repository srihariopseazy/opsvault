"""Celery task: expire vault shares that have passed their expiry time."""
import asyncio
import logging

from celery_app import celery_app

logger = logging.getLogger("opsvault.tasks.sharing")


@celery_app.task(name="tasks.expire_vault_shares")
def expire_vault_shares():
    try:
        asyncio.run(_async_expire())
    except Exception as exc:
        logger.exception("expire_vault_shares failed: %s", exc)


async def _async_expire():
    from datetime import datetime
    from sqlalchemy import select, and_
    from database import AsyncSessionLocal
    from models.sharing import VaultShare, ShareStatus
    from models.user import User
    from services.notification_service import NotificationService

    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(VaultShare).where(
                    and_(
                        VaultShare.expires_at < datetime.utcnow(),
                        VaultShare.status.in_([ShareStatus.pending.value, ShareStatus.accepted.value]),
                    )
                )
            )
            shares = result.scalars().all()

            for share in shares:
                share.status = ShareStatus.expired

                result_s = await db.execute(select(User).where(User.id == share.sharer_id))
                sharer = result_s.scalar_one_or_none()
                if sharer:
                    await NotificationService.create(
                        sharer.id, "share.expired",
                        "A shared vault item has expired",
                        f"Your share with {share.recipient_email} has expired.",
                        db,
                    )

                if share.recipient_id:
                    result_r = await db.execute(select(User).where(User.id == share.recipient_id))
                    recipient = result_r.scalar_one_or_none()
                    if recipient:
                        sharer_email = sharer.email if sharer else "someone"
                        await NotificationService.create(
                            recipient.id, "share.expired",
                            "A shared vault item has expired",
                            f"Shared access from {sharer_email} has expired.",
                            db,
                        )

            await db.commit()
            logger.info("Expired %d vault shares", len(shares))
        except Exception:
            await db.rollback()
            raise
