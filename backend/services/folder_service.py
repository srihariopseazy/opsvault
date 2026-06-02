import uuid as uuid_module
from typing import List
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from models.folder import Folder
from models.user import User
from schemas.folder import FolderCreate, FolderUpdate, FolderResponse


def _to_response(folder: Folder) -> FolderResponse:
    return FolderResponse(
        uuid=folder.uuid,
        name=folder.name,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
    )


class FolderService:
    @staticmethod
    async def list_folders(user: User, db: AsyncSession) -> List[FolderResponse]:
        result = await db.execute(
            select(Folder)
            .where(Folder.user_id == user.id)
            .order_by(Folder.name)
        )
        return [_to_response(f) for f in result.scalars().all()]

    @staticmethod
    async def create_folder(user: User, data: FolderCreate, db: AsyncSession) -> FolderResponse:
        folder = Folder(
            uuid=str(uuid_module.uuid4()),
            user_id=user.id,
            name=data.name.strip(),
        )
        db.add(folder)
        await db.flush()
        return _to_response(folder)

    @staticmethod
    async def update_folder(
        user: User, folder_uuid: str, data: FolderUpdate, db: AsyncSession
    ) -> FolderResponse:
        result = await db.execute(
            select(Folder).where(
                and_(Folder.uuid == folder_uuid, Folder.user_id == user.id)
            )
        )
        folder = result.scalar_one_or_none()
        if not folder:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
        folder.name = data.name.strip()
        await db.flush()
        return _to_response(folder)

    @staticmethod
    async def delete_folder(user: User, folder_uuid: str, db: AsyncSession) -> None:
        result = await db.execute(
            select(Folder).where(
                and_(Folder.uuid == folder_uuid, Folder.user_id == user.id)
            )
        )
        folder = result.scalar_one_or_none()
        if not folder:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
        await db.delete(folder)
        await db.flush()
