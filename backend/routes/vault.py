from fastapi import APIRouter, Depends
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from dependencies import get_current_active_user
from models.user import User
from schemas.vault import (
    VaultItemCreate,
    VaultItemUpdate,
    VaultItemResponse,
    VaultSyncResponse,
)
from schemas.common import MessageResponse
from services.vault_service import VaultService

router = APIRouter(prefix="/vault", tags=["vault"])


@router.get("/sync", response_model=VaultSyncResponse)
async def sync_vault(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await VaultService.sync(current_user, db)


@router.post("/items", response_model=VaultItemResponse, status_code=201)
async def create_item(
    data: VaultItemCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await VaultService.create_item(current_user, data, db)


@router.get("/items", response_model=List[VaultItemResponse])
async def list_items(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await VaultService.get_items(current_user, db)


@router.get("/items/{uuid}", response_model=VaultItemResponse)
async def get_item(
    uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await VaultService.get_item(current_user, uuid, db)


@router.put("/items/{uuid}", response_model=VaultItemResponse)
async def update_item(
    uuid: str,
    data: VaultItemUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await VaultService.update_item(current_user, uuid, data, db)


@router.delete("/items/{uuid}", response_model=MessageResponse)
async def soft_delete_item(
    uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await VaultService.soft_delete(current_user, uuid, db)
    return MessageResponse(message="Item moved to trash")


@router.delete("/items/{uuid}/permanent", response_model=MessageResponse)
async def permanent_delete_item(
    uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await VaultService.permanent_delete(current_user, uuid, db)
    return MessageResponse(message="Item permanently deleted")


@router.post("/items/{uuid}/restore", response_model=VaultItemResponse)
async def restore_item(
    uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await VaultService.restore(current_user, uuid, db)


@router.get("/trash", response_model=List[VaultItemResponse])
async def get_trash(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await VaultService.get_trash(current_user, db)


@router.post("/purge-trash", response_model=MessageResponse)
async def purge_trash(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    count = await VaultService.purge_trash(current_user, db)
    return MessageResponse(message=f"Permanently deleted {count} items from trash")
