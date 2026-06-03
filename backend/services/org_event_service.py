import uuid as _uuid
from typing import Optional, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from models.org_event import OrgEvent, OrgEventType
from models.user import User
from schemas.org_event import OrgEventResponse


def _to_response(e: OrgEvent) -> OrgEventResponse:
    actor_email = e.actor.email if e.actor else None
    return OrgEventResponse(
        uuid=e.uuid,
        event_type=e.event_type.value,
        actor_uuid=e.actor_uuid,
        actor_email=actor_email,
        target_uuid=e.target_uuid,
        ip_address=e.ip_address,
        event_data=e.event_data,
        created_at=e.created_at,
    )


class OrgEventService:

    @staticmethod
    async def log_event(
        org_uuid: str,
        event_type: OrgEventType,
        db: AsyncSession,
        actor_uuid: Optional[str] = None,
        target_uuid: Optional[str] = None,
        user_uuid: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        event_data: Optional[dict] = None,
    ) -> OrgEvent:
        event = OrgEvent(
            uuid=str(_uuid.uuid4()),
            org_uuid=org_uuid,
            user_uuid=user_uuid,
            event_type=event_type,
            actor_uuid=actor_uuid,
            target_uuid=target_uuid,
            ip_address=ip_address,
            user_agent=user_agent,
            event_data=event_data,
        )
        db.add(event)
        await db.flush()
        return event

    @staticmethod
    async def list_events(
        org_uuid: str,
        db: AsyncSession,
        event_type: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[OrgEventResponse]:
        conditions = [OrgEvent.org_uuid == org_uuid]

        if event_type:
            try:
                conditions.append(OrgEvent.event_type == OrgEventType(event_type))
            except ValueError:
                pass
        if date_from:
            conditions.append(OrgEvent.created_at >= date_from)
        if date_to:
            conditions.append(OrgEvent.created_at <= date_to)

        query = (
            select(OrgEvent)
            .where(and_(*conditions))
            .order_by(OrgEvent.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(query)
        events = result.scalars().all()

        responses = []
        for e in events:
            if e.actor_uuid:
                r = await db.execute(select(User).where(User.uuid == e.actor_uuid))
                e.actor = r.scalar_one_or_none()
            else:
                e.actor = None
            responses.append(_to_response(e))
        return responses
