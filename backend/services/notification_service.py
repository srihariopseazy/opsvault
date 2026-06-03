import uuid as _uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from models.notification import Notification
from schemas.notifications import NotificationResponse


class NotificationService:

    @staticmethod
    async def create(
        user_id: int,
        notif_type: str,
        title: str,
        body: str,
        db: AsyncSession,
    ) -> Notification:
        notif = Notification(
            uuid=str(_uuid.uuid4()),
            user_id=user_id,
            type=notif_type,
            title=title,
            body=body,
        )
        db.add(notif)
        await db.flush()
        return notif

    @staticmethod
    def _to_response(n: Notification) -> NotificationResponse:
        return NotificationResponse(
            uuid=n.uuid,
            type=n.type,
            title=n.title,
            body=n.body,
            read=bool(n.read),
            created_at=n.created_at,
        )

    @staticmethod
    async def list_recent(user_id: int, db: AsyncSession) -> list[NotificationResponse]:
        result = await db.execute(
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc())
            .limit(20)
        )
        notifications = result.scalars().all()
        return [NotificationService._to_response(n) for n in notifications]

    @staticmethod
    async def unread_count(user_id: int, db: AsyncSession) -> int:
        from sqlalchemy import func
        result = await db.execute(
            select(func.count(Notification.id)).where(
                and_(Notification.user_id == user_id, Notification.read == 0)
            )
        )
        return result.scalar() or 0

    @staticmethod
    async def mark_read(user_id: int, notif_uuid: str, db: AsyncSession) -> None:
        result = await db.execute(
            select(Notification).where(
                and_(Notification.uuid == notif_uuid, Notification.user_id == user_id)
            )
        )
        notif = result.scalar_one_or_none()
        if notif:
            notif.read = 1
            await db.flush()

    @staticmethod
    async def mark_all_read(user_id: int, db: AsyncSession) -> int:
        result = await db.execute(
            select(Notification).where(
                and_(Notification.user_id == user_id, Notification.read == 0)
            )
        )
        unread = result.scalars().all()
        for n in unread:
            n.read = 1
        await db.flush()
        return len(unread)
