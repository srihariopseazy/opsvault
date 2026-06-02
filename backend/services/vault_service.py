import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from models.vault_item import VaultItem, VaultItemType
from models.user import User
from schemas.vault import (
    VaultItemCreate,
    VaultItemUpdate,
    VaultItemResponse,
    VaultSyncResponse,
)


def _to_response(item: VaultItem) -> VaultItemResponse:
    return VaultItemResponse(
        uuid=item.uuid,
        type=item.type.value,
        name=item.name,
        notes=item.notes,
        favorite=bool(item.favorite),
        folder_id=str(item.folder_id) if item.folder_id else None,
        folder_uuid=item.folder_uuid,
        item_data=item.item_data,
        custom_fields=item.custom_fields,
        password_history=item.password_history,
        reprompt=bool(item.reprompt),
        deleted_at=item.deleted_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
        revision_date=item.revision_date,
    )


class VaultService:
    @staticmethod
    async def sync(user: User, db: AsyncSession) -> VaultSyncResponse:
        result = await db.execute(
            select(VaultItem).where(
                and_(VaultItem.user_id == user.id, VaultItem.deleted_at.is_(None))
            )
        )
        items = result.scalars().all()
        return VaultSyncResponse(
            items=[_to_response(i) for i in items],
            profile={"uuid": user.uuid, "email": user.email, "name": user.name},
        )

    @staticmethod
    async def create_item(
        user: User,
        data: VaultItemCreate,
        db: AsyncSession,
    ) -> VaultItemResponse:
        item = VaultItem(
            uuid=str(uuid.uuid4()),
            user_id=user.id,
            type=data.type,
            name=data.name,
            notes=data.notes,
            favorite=1 if data.favorite else 0,
            folder_uuid=data.folder_uuid or None,
            item_data=data.item_data,
            custom_fields=data.custom_fields,
            reprompt=1 if data.reprompt else 0,
        )
        db.add(item)
        await db.flush()
        return _to_response(item)

    @staticmethod
    async def get_items(user: User, db: AsyncSession) -> List[VaultItemResponse]:
        result = await db.execute(
            select(VaultItem).where(
                and_(VaultItem.user_id == user.id, VaultItem.deleted_at.is_(None))
            )
        )
        items = result.scalars().all()
        return [_to_response(i) for i in items]

    @staticmethod
    async def get_item(user: User, item_uuid: str, db: AsyncSession) -> VaultItemResponse:
        result = await db.execute(
            select(VaultItem).where(
                and_(VaultItem.uuid == item_uuid, VaultItem.user_id == user.id)
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
        return _to_response(item)

    @staticmethod
    async def update_item(
        user: User,
        item_uuid: str,
        data: VaultItemUpdate,
        db: AsyncSession,
    ) -> VaultItemResponse:
        result = await db.execute(
            select(VaultItem).where(
                and_(
                    VaultItem.uuid == item_uuid,
                    VaultItem.user_id == user.id,
                    VaultItem.deleted_at.is_(None),
                )
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

        if data.name is not None:
            item.name = data.name
        if data.notes is not None:
            item.notes = data.notes
        if data.favorite is not None:
            item.favorite = 1 if data.favorite else 0
        if data.item_data is not None:
            # For login items, snapshot the old encrypted item_data in password_history
            # before overwriting so the frontend can decrypt and display prior passwords.
            if item.type == VaultItemType.login and item.item_data != data.item_data:
                history: list = list(item.password_history or [])
                history.insert(0, {
                    "encryptedItemData": item.item_data,
                    "changedAt": datetime.now(timezone.utc).isoformat(),
                })
                item.password_history = history[:5]
            item.item_data = data.item_data
        if data.custom_fields is not None:
            item.custom_fields = data.custom_fields
        if data.reprompt is not None:
            item.reprompt = 1 if data.reprompt else 0
        # folder_uuid: None means leave unchanged; empty string means clear
        if data.folder_uuid is not None:
            item.folder_uuid = data.folder_uuid if data.folder_uuid != "" else None

        item.revision_date = datetime.now(timezone.utc)
        await db.flush()
        return _to_response(item)

    @staticmethod
    async def soft_delete(user: User, item_uuid: str, db: AsyncSession) -> None:
        result = await db.execute(
            select(VaultItem).where(
                and_(
                    VaultItem.uuid == item_uuid,
                    VaultItem.user_id == user.id,
                    VaultItem.deleted_at.is_(None),
                )
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
        item.deleted_at = datetime.now(timezone.utc)
        await db.flush()

    @staticmethod
    async def permanent_delete(user: User, item_uuid: str, db: AsyncSession) -> None:
        result = await db.execute(
            select(VaultItem).where(
                and_(VaultItem.uuid == item_uuid, VaultItem.user_id == user.id)
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
        await db.delete(item)
        await db.flush()

    @staticmethod
    async def restore(user: User, item_uuid: str, db: AsyncSession) -> VaultItemResponse:
        result = await db.execute(
            select(VaultItem).where(
                and_(
                    VaultItem.uuid == item_uuid,
                    VaultItem.user_id == user.id,
                    VaultItem.deleted_at.isnot(None),
                )
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found in trash")
        item.deleted_at = None
        await db.flush()
        return _to_response(item)

    @staticmethod
    async def get_trash(user: User, db: AsyncSession) -> List[VaultItemResponse]:
        result = await db.execute(
            select(VaultItem).where(
                and_(VaultItem.user_id == user.id, VaultItem.deleted_at.isnot(None))
            )
        )
        items = result.scalars().all()
        return [_to_response(i) for i in items]

    @staticmethod
    async def purge_trash(user: User, db: AsyncSession) -> int:
        result = await db.execute(
            select(VaultItem).where(
                and_(VaultItem.user_id == user.id, VaultItem.deleted_at.isnot(None))
            )
        )
        items = result.scalars().all()
        count = len(items)
        for item in items:
            await db.delete(item)
        await db.flush()
        return count

    @staticmethod
    async def toggle_favorite(user: User, item_uuid: str, db: AsyncSession) -> VaultItemResponse:
        result = await db.execute(
            select(VaultItem).where(
                and_(
                    VaultItem.uuid == item_uuid,
                    VaultItem.user_id == user.id,
                    VaultItem.deleted_at.is_(None),
                )
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
        item.favorite = 0 if item.favorite else 1
        await db.flush()
        return _to_response(item)
