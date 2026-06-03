from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from database import get_db
from dependencies import get_current_active_user
from models.user import User
from schemas.api_key import ApiKeyCreate, ApiKeyResponse, ApiKeyCreatedResponse
from services import api_key_service

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


@router.get("", response_model=List[ApiKeyResponse])
async def list_api_keys(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await api_key_service.list_user_keys(current_user.id, db)


@router.post("", response_model=ApiKeyCreatedResponse, status_code=201)
async def create_api_key(
    data: ApiKeyCreate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    key_obj, raw_key = await api_key_service.create_user_key(
        current_user, data, db, ip_address=_ip(request)
    )
    await db.commit()
    await db.refresh(key_obj)
    return ApiKeyCreatedResponse(
        uuid=key_obj.uuid,
        name=key_obj.name,
        key_prefix=key_obj.key_prefix,
        scopes=key_obj.scopes,
        expires_at=key_obj.expires_at,
        last_used_at=key_obj.last_used_at,
        last_used_ip=key_obj.last_used_ip,
        is_active=bool(key_obj.is_active),
        created_at=key_obj.created_at,
        full_key=raw_key,
    )


@router.delete("/{key_uuid}", status_code=204)
async def revoke_api_key(
    key_uuid: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await api_key_service.revoke_user_key(
        key_uuid, current_user, db, ip_address=_ip(request)
    )
    await db.commit()


@router.post("/{key_uuid}/rotate", response_model=ApiKeyCreatedResponse)
async def rotate_api_key(
    key_uuid: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    key_obj, raw_key = await api_key_service.rotate_user_key(
        key_uuid, current_user, db, ip_address=_ip(request)
    )
    await db.commit()
    await db.refresh(key_obj)
    return ApiKeyCreatedResponse(
        uuid=key_obj.uuid,
        name=key_obj.name,
        key_prefix=key_obj.key_prefix,
        scopes=key_obj.scopes,
        expires_at=key_obj.expires_at,
        last_used_at=key_obj.last_used_at,
        last_used_ip=key_obj.last_used_ip,
        is_active=bool(key_obj.is_active),
        created_at=key_obj.created_at,
        full_key=raw_key,
    )
