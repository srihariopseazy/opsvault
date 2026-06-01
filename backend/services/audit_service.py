import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from models.audit_log import AuditLog


class AuditService:
    @staticmethod
    async def log(
        db: AsyncSession,
        action: str,
        user_id: Optional[int] = None,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        extra_details: Optional[dict] = None,
    ) -> None:
        log = AuditLog(
            uuid=str(uuid.uuid4()),
            user_id=user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            ip_address=ip_address,
            user_agent=user_agent,
            extra_details=extra_details,
            created_at=datetime.now(timezone.utc),
        )
        db.add(log)
