import uuid
import secrets
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from models.api_key import ApiKey, OrgApiKey
from models.user import User
from models.org_member import OrgMember, OrgMemberRole, OrgMemberStatus
from schemas.api_key import ApiKeyCreate, OrgApiKeyCreate
from services.audit_service import AuditService

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

PERSONAL_PREFIX = "ovk_"
ORG_PREFIX = "ovok_"
KEY_RANDOM_LENGTH = 40


def _generate_raw_key(prefix: str) -> str:
    return prefix + secrets.token_urlsafe(KEY_RANDOM_LENGTH)[:KEY_RANDOM_LENGTH]


def _hash_key(raw_key: str) -> str:
    return pwd_context.hash(raw_key)


def _verify_key(raw_key: str, hashed: str) -> bool:
    return pwd_context.verify(raw_key, hashed)


async def _require_org_admin(org_uuid: str, user: User, db: AsyncSession) -> None:
    result = await db.execute(
        select(OrgMember).where(
            and_(
                OrgMember.org_id == org_uuid,
                OrgMember.user_id == user.id,
                OrgMember.status == OrgMemberStatus.accepted,
                OrgMember.role.in_([OrgMemberRole.owner, OrgMemberRole.admin]),
            )
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only org owners and admins can manage org API keys",
        )


# ── Personal API keys ─────────────────────────────────────────────────────────

async def list_user_keys(user_id: int, db: AsyncSession) -> List[ApiKey]:
    result = await db.execute(
        select(ApiKey).where(ApiKey.user_id == user_id).order_by(ApiKey.created_at.desc())
    )
    return list(result.scalars().all())


async def create_user_key(
    user: User,
    data: ApiKeyCreate,
    db: AsyncSession,
    ip_address: Optional[str] = None,
) -> tuple[ApiKey, str]:
    valid_scopes = {"read", "write"}
    scopes = [s for s in data.scopes if s in valid_scopes]
    if not scopes:
        scopes = ["read"]

    raw_key = _generate_raw_key(PERSONAL_PREFIX)
    key_obj = ApiKey(
        uuid=str(uuid.uuid4()),
        user_id=user.id,
        name=data.name,
        key_prefix=raw_key[:8],
        key_hash=_hash_key(raw_key),
        scopes=scopes,
        expires_at=data.expires_at,
        is_active=1,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(key_obj)
    await db.flush()

    await AuditService.log(
        db,
        action="api_key.created",
        user_id=user.id,
        target_type="api_key",
        target_id=key_obj.uuid,
        ip_address=ip_address,
    )
    return key_obj, raw_key


async def revoke_user_key(
    key_uuid: str,
    user: User,
    db: AsyncSession,
    ip_address: Optional[str] = None,
) -> None:
    result = await db.execute(
        select(ApiKey).where(
            and_(ApiKey.uuid == key_uuid, ApiKey.user_id == user.id)
        )
    )
    key_obj = result.scalar_one_or_none()
    if not key_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")

    key_obj.is_active = 0
    key_obj.updated_at = datetime.now(timezone.utc)

    await AuditService.log(
        db,
        action="api_key.revoked",
        user_id=user.id,
        target_type="api_key",
        target_id=key_uuid,
        ip_address=ip_address,
    )


async def rotate_user_key(
    key_uuid: str,
    user: User,
    db: AsyncSession,
    ip_address: Optional[str] = None,
) -> tuple[ApiKey, str]:
    result = await db.execute(
        select(ApiKey).where(
            and_(ApiKey.uuid == key_uuid, ApiKey.user_id == user.id)
        )
    )
    key_obj = result.scalar_one_or_none()
    if not key_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")

    raw_key = _generate_raw_key(PERSONAL_PREFIX)
    key_obj.key_prefix = raw_key[:8]
    key_obj.key_hash = _hash_key(raw_key)
    key_obj.is_active = 1
    key_obj.updated_at = datetime.now(timezone.utc)

    await AuditService.log(
        db,
        action="api_key.rotated",
        user_id=user.id,
        target_type="api_key",
        target_id=key_uuid,
        ip_address=ip_address,
    )
    return key_obj, raw_key


# ── Org API keys ──────────────────────────────────────────────────────────────

async def list_org_keys(
    org_uuid: str,
    user: User,
    db: AsyncSession,
) -> List[OrgApiKey]:
    await _require_org_admin(org_uuid, user, db)
    result = await db.execute(
        select(OrgApiKey)
        .where(OrgApiKey.org_id == org_uuid)
        .order_by(OrgApiKey.created_at.desc())
    )
    return list(result.scalars().all())


async def create_org_key(
    org_uuid: str,
    user: User,
    data: OrgApiKeyCreate,
    db: AsyncSession,
    ip_address: Optional[str] = None,
) -> tuple[OrgApiKey, str]:
    await _require_org_admin(org_uuid, user, db)

    valid_scopes = {"read", "write"}
    scopes = [s for s in data.scopes if s in valid_scopes]
    if not scopes:
        scopes = ["read"]

    raw_key = _generate_raw_key(ORG_PREFIX)
    key_obj = OrgApiKey(
        uuid=str(uuid.uuid4()),
        org_id=org_uuid,
        created_by=user.id,
        name=data.name,
        key_prefix=raw_key[:8],
        key_hash=_hash_key(raw_key),
        scopes=scopes,
        expires_at=data.expires_at,
        is_active=1,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(key_obj)
    await db.flush()

    await AuditService.log(
        db,
        action="org_api_key.created",
        user_id=user.id,
        target_type="org_api_key",
        target_id=key_obj.uuid,
        ip_address=ip_address,
        extra_details={"org_uuid": org_uuid},
    )
    return key_obj, raw_key


async def revoke_org_key(
    org_uuid: str,
    key_uuid: str,
    user: User,
    db: AsyncSession,
    ip_address: Optional[str] = None,
) -> None:
    await _require_org_admin(org_uuid, user, db)

    result = await db.execute(
        select(OrgApiKey).where(
            and_(OrgApiKey.uuid == key_uuid, OrgApiKey.org_id == org_uuid)
        )
    )
    key_obj = result.scalar_one_or_none()
    if not key_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Org API key not found")

    key_obj.is_active = 0
    key_obj.updated_at = datetime.now(timezone.utc)

    await AuditService.log(
        db,
        action="org_api_key.revoked",
        user_id=user.id,
        target_type="org_api_key",
        target_id=key_uuid,
        ip_address=ip_address,
        extra_details={"org_uuid": org_uuid},
    )


async def rotate_org_key(
    org_uuid: str,
    key_uuid: str,
    user: User,
    db: AsyncSession,
    ip_address: Optional[str] = None,
) -> tuple[OrgApiKey, str]:
    await _require_org_admin(org_uuid, user, db)

    result = await db.execute(
        select(OrgApiKey).where(
            and_(OrgApiKey.uuid == key_uuid, OrgApiKey.org_id == org_uuid)
        )
    )
    key_obj = result.scalar_one_or_none()
    if not key_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Org API key not found")

    raw_key = _generate_raw_key(ORG_PREFIX)
    key_obj.key_prefix = raw_key[:8]
    key_obj.key_hash = _hash_key(raw_key)
    key_obj.is_active = 1
    key_obj.updated_at = datetime.now(timezone.utc)

    await AuditService.log(
        db,
        action="org_api_key.rotated",
        user_id=user.id,
        target_type="org_api_key",
        target_id=key_uuid,
        ip_address=ip_address,
        extra_details={"org_uuid": org_uuid},
    )
    return key_obj, raw_key


# ── Validation for authentication ─────────────────────────────────────────────

async def validate_api_key(
    raw_key: str,
    db: AsyncSession,
    ip_address: Optional[str] = None,
) -> Optional[User]:
    """Return the User if the raw API key is valid; None otherwise."""
    if not raw_key:
        return None

    prefix = raw_key[:8]
    now = datetime.now(timezone.utc)

    # Try personal key first
    if raw_key.startswith(PERSONAL_PREFIX):
        result = await db.execute(
            select(ApiKey).where(
                and_(ApiKey.key_prefix == prefix, ApiKey.is_active == 1)
            )
        )
        for key_obj in result.scalars().all():
            if not _verify_key(raw_key, key_obj.key_hash):
                continue
            if key_obj.expires_at and key_obj.expires_at.replace(tzinfo=timezone.utc) < now:
                continue
            key_obj.last_used_at = now
            key_obj.last_used_ip = ip_address

            await AuditService.log(
                db,
                action="api_key.used",
                user_id=key_obj.user_id,
                target_type="api_key",
                target_id=key_obj.uuid,
                ip_address=ip_address,
            )

            user_result = await db.execute(
                select(User).where(User.id == key_obj.user_id)
            )
            return user_result.scalar_one_or_none()

    # Try org key
    if raw_key.startswith(ORG_PREFIX):
        result = await db.execute(
            select(OrgApiKey).where(
                and_(OrgApiKey.key_prefix == prefix, OrgApiKey.is_active == 1)
            )
        )
        for key_obj in result.scalars().all():
            if not _verify_key(raw_key, key_obj.key_hash):
                continue
            if key_obj.expires_at and key_obj.expires_at.replace(tzinfo=timezone.utc) < now:
                continue
            key_obj.last_used_at = now
            key_obj.last_used_ip = ip_address

            await AuditService.log(
                db,
                action="org_api_key.used",
                user_id=key_obj.created_by,
                target_type="org_api_key",
                target_id=key_obj.uuid,
                ip_address=ip_address,
            )

            user_result = await db.execute(
                select(User).where(User.id == key_obj.created_by)
            )
            return user_result.scalar_one_or_none()

    return None


# ── Admin: list all org keys across all orgs ──────────────────────────────────

async def admin_list_all_org_keys(db: AsyncSession) -> List[dict]:
    from models.organization import Organization
    from sqlalchemy.orm import aliased

    result = await db.execute(
        select(OrgApiKey, Organization, User)
        .join(Organization, Organization.uuid == OrgApiKey.org_id)
        .join(User, User.id == OrgApiKey.created_by)
        .order_by(OrgApiKey.created_at.desc())
    )
    rows = result.all()
    out = []
    for key_obj, org, creator in rows:
        out.append({
            "uuid": key_obj.uuid,
            "org_id": key_obj.org_id,
            "org_name": org.name,
            "name": key_obj.name,
            "key_prefix": key_obj.key_prefix,
            "scopes": key_obj.scopes,
            "is_active": bool(key_obj.is_active),
            "last_used_at": key_obj.last_used_at,
            "created_at": key_obj.created_at,
            "created_by_email": creator.email,
        })
    return out
