import uuid as _uuid
import hashlib
import secrets
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from models.user import User
from models.send_item import SendItem, SendItemType
from schemas.send import SendCreate, SendUpdate, SendResponse, PublicSendResponse


def _to_response(s: SendItem) -> SendResponse:
    return SendResponse(
        uuid=s.uuid,
        access_id=s.access_id,
        type=s.type.value,
        name=s.name,
        access_count=s.access_count,
        max_access_count=s.max_access_count,
        expiration_at=s.expiration_at,
        deletion_at=s.deletion_at,
        hide_content=bool(s.hide_content),
        disabled=bool(s.disabled),
        password_protected=s.password_hash is not None,
        created_at=s.created_at,
    )


def _hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()


def _verify_password(pw: str, stored_hash: str) -> bool:
    import hmac as _hmac
    expected = _hash_password(pw)
    return _hmac.compare_digest(expected, stored_hash)


class SendService:

    @staticmethod
    async def list_sends(user: User, db: AsyncSession) -> List[SendResponse]:
        result = await db.execute(
            select(SendItem)
            .where(SendItem.user_id == user.id)
            .order_by(SendItem.created_at.desc())
        )
        return [_to_response(s) for s in result.scalars().all()]

    @staticmethod
    async def create_send(
        user: User, data: SendCreate, db: AsyncSession
    ) -> SendResponse:
        try:
            parsed_type = SendItemType(data.type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid send type: {data.type}",
            )

        send = SendItem(
            uuid=str(_uuid.uuid4()),
            access_id=secrets.token_urlsafe(24)[:32],
            user_id=user.id,
            type=parsed_type,
            name=data.name,
            content=data.content,
            max_access_count=data.max_access_count,
            expiration_at=data.expiration_at,
            deletion_at=data.deletion_at,
            password_hash=_hash_password(data.password) if data.password else None,
            hide_content=1 if data.hide_content else 0,
        )
        db.add(send)
        await db.flush()
        return _to_response(send)

    @staticmethod
    async def get_send(user: User, send_uuid: str, db: AsyncSession) -> SendResponse:
        result = await db.execute(
            select(SendItem).where(
                and_(SendItem.uuid == send_uuid, SendItem.user_id == user.id)
            )
        )
        send = result.scalar_one_or_none()
        if not send:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Send not found")
        return _to_response(send)

    @staticmethod
    async def update_send(
        user: User, send_uuid: str, data: SendUpdate, db: AsyncSession
    ) -> SendResponse:
        result = await db.execute(
            select(SendItem).where(
                and_(SendItem.uuid == send_uuid, SendItem.user_id == user.id)
            )
        )
        send = result.scalar_one_or_none()
        if not send:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Send not found")

        if data.name is not None:
            send.name = data.name
        if data.content is not None:
            send.content = data.content
        if data.max_access_count is not None:
            send.max_access_count = data.max_access_count
        if data.expiration_at is not None:
            send.expiration_at = data.expiration_at
        if data.deletion_at is not None:
            send.deletion_at = data.deletion_at
        if data.password is not None:
            send.password_hash = _hash_password(data.password) if data.password else None
        if data.hide_content is not None:
            send.hide_content = 1 if data.hide_content else 0
        if data.disabled is not None:
            send.disabled = 1 if data.disabled else 0

        await db.flush()
        return _to_response(send)

    @staticmethod
    async def delete_send(user: User, send_uuid: str, db: AsyncSession) -> None:
        result = await db.execute(
            select(SendItem).where(
                and_(SendItem.uuid == send_uuid, SendItem.user_id == user.id)
            )
        )
        send = result.scalar_one_or_none()
        if not send:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Send not found")
        await db.delete(send)
        await db.flush()

    @staticmethod
    async def public_access(
        access_id: str,
        password: Optional[str],
        db: AsyncSession,
    ) -> PublicSendResponse:
        result = await db.execute(
            select(SendItem).where(SendItem.access_id == access_id)
        )
        send = result.scalar_one_or_none()
        if not send:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Send not found")

        now = datetime.now(timezone.utc)

        # Hard-deleted by expiry
        deletion_at = send.deletion_at
        if deletion_at.tzinfo is None:
            deletion_at = deletion_at.replace(tzinfo=timezone.utc)
        if now > deletion_at:
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="This send has expired and been deleted")

        if send.disabled:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Send not found")

        expiration_at = send.expiration_at
        if expiration_at:
            if expiration_at.tzinfo is None:
                expiration_at = expiration_at.replace(tzinfo=timezone.utc)
            if now > expiration_at:
                raise HTTPException(status_code=status.HTTP_410_GONE, detail="This send has expired")

        if send.max_access_count is not None and send.access_count >= send.max_access_count:
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="Maximum access limit reached")

        # Password gate
        if send.password_hash:
            if not password:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Password required",
                    headers={"X-Password-Required": "true"},
                )
            if not _verify_password(password, send.password_hash):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Incorrect password",
                )

        # Increment access count
        send.access_count += 1
        await db.flush()

        return PublicSendResponse(
            access_id=send.access_id,
            type=send.type.value,
            content=send.content,
            hide_content=bool(send.hide_content),
            password_required=False,
        )
