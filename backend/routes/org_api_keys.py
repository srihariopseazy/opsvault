from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Any

from database import get_db
from dependencies import get_current_active_user, get_current_superuser
from models.user import User
from schemas.api_key import OrgApiKeyCreate, OrgApiKeyResponse, OrgApiKeyCreatedResponse
from services import api_key_service

router = APIRouter(prefix="/org-api-keys", tags=["org-api-keys"])


def _ip(request: Request) -> str:
    return request.client.host if request.client else ""


@router.get("/{org_uuid}", response_model=List[OrgApiKeyResponse])
async def list_org_api_keys(
    org_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    keys = await api_key_service.list_org_keys(org_uuid, current_user, db)
    return [
        OrgApiKeyResponse(
            uuid=k.uuid,
            org_id=k.org_id,
            name=k.name,
            key_prefix=k.key_prefix,
            scopes=k.scopes,
            expires_at=k.expires_at,
            last_used_at=k.last_used_at,
            last_used_ip=k.last_used_ip,
            is_active=bool(k.is_active),
            created_at=k.created_at,
        )
        for k in keys
    ]


@router.post("/{org_uuid}", response_model=OrgApiKeyCreatedResponse, status_code=201)
async def create_org_api_key(
    org_uuid: str,
    data: OrgApiKeyCreate,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    key_obj, raw_key = await api_key_service.create_org_key(
        org_uuid, current_user, data, db, ip_address=_ip(request)
    )
    await db.commit()
    await db.refresh(key_obj)
    return OrgApiKeyCreatedResponse(
        uuid=key_obj.uuid,
        org_id=key_obj.org_id,
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


@router.delete("/{org_uuid}/{key_uuid}", status_code=204)
async def revoke_org_api_key(
    org_uuid: str,
    key_uuid: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await api_key_service.revoke_org_key(
        org_uuid, key_uuid, current_user, db, ip_address=_ip(request)
    )
    await db.commit()


@router.post("/{org_uuid}/{key_uuid}/rotate", response_model=OrgApiKeyCreatedResponse)
async def rotate_org_api_key(
    org_uuid: str,
    key_uuid: str,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    key_obj, raw_key = await api_key_service.rotate_org_key(
        org_uuid, key_uuid, current_user, db, ip_address=_ip(request)
    )
    await db.commit()
    await db.refresh(key_obj)
    return OrgApiKeyCreatedResponse(
        uuid=key_obj.uuid,
        org_id=key_obj.org_id,
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


@router.get("/admin/all", response_model=List[Any])
async def admin_list_all_org_api_keys(
    _: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    return await api_key_service.admin_list_all_org_keys(db)
