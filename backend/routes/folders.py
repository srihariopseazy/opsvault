from fastapi import APIRouter, Depends
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from dependencies import get_current_active_user
from models.user import User
from schemas.folder import FolderCreate, FolderUpdate, FolderResponse
from schemas.common import MessageResponse
from services.folder_service import FolderService

router = APIRouter(prefix="/folders", tags=["folders"])


@router.get("", response_model=List[FolderResponse])
async def list_folders(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await FolderService.list_folders(current_user, db)


@router.post("", response_model=FolderResponse, status_code=201)
async def create_folder(
    data: FolderCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await FolderService.create_folder(current_user, data, db)


@router.put("/{folder_uuid}", response_model=FolderResponse)
async def update_folder(
    folder_uuid: str,
    data: FolderUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await FolderService.update_folder(current_user, folder_uuid, data, db)


@router.delete("/{folder_uuid}", response_model=MessageResponse)
async def delete_folder(
    folder_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await FolderService.delete_folder(current_user, folder_uuid, db)
    return MessageResponse(message="Folder deleted")
