from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from database import get_db
from dependencies import get_current_active_user
from models.user import User
from schemas.common import MessageResponse
from schemas.collections import (
    CollectionCreate,
    CollectionRename,
    AddCollectionMemberRequest,
    AddCollectionItemRequest,
    CollectionResponse,
    CollectionDetail,
    CollectionMemberResponse,
    CollectionItemResponse,
)
from services.collection_service import CollectionService

router = APIRouter(prefix="/collections", tags=["collections"])


@router.get("", response_model=List[CollectionResponse])
async def list_collections(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await CollectionService.list_accessible(current_user, db)


@router.post("", response_model=CollectionResponse, status_code=201)
async def create_collection(
    data: CollectionCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await CollectionService.create_collection(
        current_user, data.org_id, data.name, db
    )


@router.get("/{collection_uuid}", response_model=CollectionDetail)
async def get_collection(
    collection_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await CollectionService.get_collection_detail(current_user, collection_uuid, db)


@router.put("/{collection_uuid}", response_model=MessageResponse)
async def rename_collection(
    collection_uuid: str,
    data: CollectionRename,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await CollectionService.rename_collection(current_user, collection_uuid, data.name, db)
    return MessageResponse(message="Collection renamed")


@router.delete("/{collection_uuid}", response_model=MessageResponse)
async def delete_collection(
    collection_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await CollectionService.delete_collection(current_user, collection_uuid, db)
    return MessageResponse(message="Collection deleted")


@router.post("/{collection_uuid}/members", response_model=CollectionMemberResponse, status_code=201)
async def add_collection_member(
    collection_uuid: str,
    data: AddCollectionMemberRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    cm = await CollectionService.add_member(
        current_user, collection_uuid, data.user_uuid, data.access, db
    )
    return CollectionMemberResponse(
        uuid=cm.uuid,
        user_uuid=cm.user.uuid,
        user_name=cm.user.name,
        user_email=cm.user.email,
        access=cm.access.value,
        created_at=cm.created_at,
    )


@router.delete("/{collection_uuid}/members/{member_uuid}", response_model=MessageResponse)
async def remove_collection_member(
    collection_uuid: str,
    member_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await CollectionService.remove_member(current_user, collection_uuid, member_uuid, db)
    return MessageResponse(message="Member removed from collection")


@router.post("/{collection_uuid}/items", response_model=CollectionItemResponse, status_code=201)
async def add_collection_item(
    collection_uuid: str,
    data: AddCollectionItemRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    ci = await CollectionService.add_item(current_user, collection_uuid, data.item_uuid, db)
    vi = ci.item
    return CollectionItemResponse(
        uuid=ci.uuid,
        item_uuid=vi.uuid,
        item_name=vi.name,
        item_type=vi.type.value,
        added_at=ci.added_at,
    )


@router.delete("/{collection_uuid}/items/{item_uuid}", response_model=MessageResponse)
async def remove_collection_item(
    collection_uuid: str,
    item_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await CollectionService.remove_item(current_user, collection_uuid, item_uuid, db)
    return MessageResponse(message="Item removed from collection")
