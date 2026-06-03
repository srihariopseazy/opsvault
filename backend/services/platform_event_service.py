import uuid as _uuid
from typing import Optional, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from models.platform_event import PlatformEvent, PlatformEventType
from models.user import User
from models.organization import Organization
from schemas.platform_event import PlatformEventResponse


def _to_response(e: PlatformEvent) -> PlatformEventResponse:
    actor_email = e.actor.email if e.actor else None
    target_user_email = e.target_user.email if e.target_user else None
    target_org_name = e.target_org.name if e.target_org else None
    return PlatformEventResponse(
        uuid=e.uuid,
        event_type=e.event_type.value,
        actor_uuid=e.actor_uuid,
        actor_email=actor_email,
        target_user_uuid=e.target_user_uuid,
        target_user_email=target_user_email,
        target_org_uuid=e.target_org_uuid,
        target_org_name=target_org_name,
        ip_address=e.ip_address,
        event_data=e.event_data,
        created_at=e.created_at,
    )


class PlatformEventService:

    @staticmethod
    async def log_event(
        event_type: PlatformEventType,
        db: AsyncSession,
        actor_uuid: Optional[str] = None,
        target_user_uuid: Optional[str] = None,
        target_org_uuid: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        event_data: Optional[dict] = None,
    ) -> PlatformEvent:
        event = PlatformEvent(
            uuid=str(_uuid.uuid4()),
            event_type=event_type,
            actor_uuid=actor_uuid,
            target_user_uuid=target_user_uuid,
            target_org_uuid=target_org_uuid,
            ip_address=ip_address,
            user_agent=user_agent,
            event_data=event_data,
        )
        db.add(event)
        await db.flush()
        return event

    @staticmethod
    async def list_events(
        db: AsyncSession,
        event_type: Optional[str] = None,
        actor_uuid: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[PlatformEventResponse]:
        query = select(PlatformEvent)
        conditions = []

        if event_type:
            try:
                conditions.append(
                    PlatformEvent.event_type == PlatformEventType(event_type)
                )
            except ValueError:
                pass
        if actor_uuid:
            conditions.append(PlatformEvent.actor_uuid == actor_uuid)
        if date_from:
            conditions.append(PlatformEvent.created_at >= date_from)
        if date_to:
            conditions.append(PlatformEvent.created_at <= date_to)

        if conditions:
            query = query.where(and_(*conditions))

        query = query.order_by(PlatformEvent.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(query)
        events = result.scalars().all()

        # Load relations
        responses = []
        for e in events:
            if e.actor_uuid:
                r = await db.execute(select(User).where(User.uuid == e.actor_uuid))
                e.actor = r.scalar_one_or_none()
            else:
                e.actor = None
            if e.target_user_uuid:
                r = await db.execute(select(User).where(User.uuid == e.target_user_uuid))
                e.target_user = r.scalar_one_or_none()
            else:
                e.target_user = None
            if e.target_org_uuid:
                r = await db.execute(
                    select(Organization).where(Organization.uuid == e.target_org_uuid)
                )
                e.target_org = r.scalar_one_or_none()
            else:
                e.target_org = None
            responses.append(_to_response(e))
        return responses
