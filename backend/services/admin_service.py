import uuid as _uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
import jwt

from config import get_settings
from models.user import User
from models.session import Session
from models.vault_item import VaultItem
from models.organization import Organization
from models.org_member import OrgMember, OrgMemberRole, OrgMemberStatus
from models.collection import Collection
from models.send_item import SendItem
from models.platform_event import PlatformEventType
from schemas.admin import (
    PlatformStatsResponse,
    AdminUserResponse,
    AdminUserOrgInfo,
    AdminOrgResponse,
    ImpersonateResponse,
)

settings = get_settings()

_IMPERSONATE_EXPIRE_MINUTES = 15


class AdminService:

    @staticmethod
    async def get_platform_stats(db: AsyncSession) -> PlatformStatsResponse:
        total_users = (await db.execute(select(func.count()).select_from(User))).scalar_one()
        active_users = (await db.execute(
            select(func.count()).select_from(User).where(User.is_active == 1)
        )).scalar_one()
        disabled_users = total_users - active_users
        total_orgs = (await db.execute(select(func.count()).select_from(Organization))).scalar_one()
        total_vault_items = (await db.execute(
            select(func.count()).select_from(VaultItem).where(VaultItem.deleted_at.is_(None))
        )).scalar_one()
        active_sessions = (await db.execute(
            select(func.count()).select_from(Session).where(Session.is_active == 1)
        )).scalar_one()
        total_collections = (await db.execute(select(func.count()).select_from(Collection))).scalar_one()
        total_sends = (await db.execute(select(func.count()).select_from(SendItem))).scalar_one()

        return PlatformStatsResponse(
            total_users=total_users,
            active_users=active_users,
            disabled_users=disabled_users,
            total_orgs=total_orgs,
            total_vault_items=total_vault_items,
            active_sessions=active_sessions,
            total_collections=total_collections,
            total_sends=total_sends,
        )

    @staticmethod
    async def list_users(
        db: AsyncSession,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[AdminUserResponse]:
        query = select(User)
        if search:
            like = f"%{search}%"
            query = query.where(or_(User.email.like(like), User.name.like(like)))
        query = query.order_by(User.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(query)
        users = result.scalars().all()

        out = []
        for u in users:
            session_count = (await db.execute(
                select(func.count()).select_from(Session).where(
                    and_(Session.user_id == u.id, Session.is_active == 1)
                )
            )).scalar_one()
            memberships_result = await db.execute(
                select(OrgMember, Organization)
                .join(Organization, OrgMember.org_id == Organization.uuid)
                .where(
                    and_(
                        OrgMember.user_id == u.id,
                        OrgMember.status == OrgMemberStatus.accepted,
                    )
                )
            )
            org_memberships = [
                AdminUserOrgInfo(org_uuid=org.uuid, org_name=org.name, role=mem.role.value)
                for mem, org in memberships_result.all()
            ]
            out.append(AdminUserResponse(
                uuid=u.uuid,
                email=u.email,
                name=u.name,
                is_active=bool(u.is_active),
                is_superuser=bool(u.is_superuser),
                totp_enabled=bool(u.totp_enabled),
                email_verified=bool(u.email_verified),
                created_at=u.created_at,
                last_login_at=u.last_login_at,
                session_count=session_count,
                org_memberships=org_memberships,
            ))
        return out

    @staticmethod
    async def get_user_detail(user_uuid: str, db: AsyncSession) -> AdminUserResponse:
        result = await db.execute(select(User).where(User.uuid == user_uuid))
        user = result.scalar_one_or_none()
        if not user:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        session_count = (await db.execute(
            select(func.count()).select_from(Session).where(
                and_(Session.user_id == user.id, Session.is_active == 1)
            )
        )).scalar_one()
        memberships_result = await db.execute(
            select(OrgMember, Organization)
            .join(Organization, OrgMember.org_id == Organization.uuid)
            .where(
                and_(
                    OrgMember.user_id == user.id,
                    OrgMember.status == OrgMemberStatus.accepted,
                )
            )
        )
        org_memberships = [
            AdminUserOrgInfo(org_uuid=org.uuid, org_name=org.name, role=mem.role.value)
            for mem, org in memberships_result.all()
        ]
        return AdminUserResponse(
            uuid=user.uuid,
            email=user.email,
            name=user.name,
            is_active=bool(user.is_active),
            is_superuser=bool(user.is_superuser),
            totp_enabled=bool(user.totp_enabled),
            email_verified=bool(user.email_verified),
            created_at=user.created_at,
            last_login_at=user.last_login_at,
            session_count=session_count,
            org_memberships=org_memberships,
        )

    @staticmethod
    async def disable_user(user_uuid: str, db: AsyncSession) -> None:
        result = await db.execute(select(User).where(User.uuid == user_uuid))
        user = result.scalar_one_or_none()
        if not user:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        user.is_active = 0
        sessions_result = await db.execute(
            select(Session).where(Session.user_id == user.id)
        )
        for session in sessions_result.scalars().all():
            session.is_active = 0
        await db.flush()

    @staticmethod
    async def enable_user(user_uuid: str, db: AsyncSession) -> None:
        result = await db.execute(select(User).where(User.uuid == user_uuid))
        user = result.scalar_one_or_none()
        if not user:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        user.is_active = 1
        await db.flush()

    @staticmethod
    async def force_logout_user(user_uuid: str, db: AsyncSession) -> None:
        result = await db.execute(select(User).where(User.uuid == user_uuid))
        user = result.scalar_one_or_none()
        if not user:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        sessions_result = await db.execute(
            select(Session).where(Session.user_id == user.id)
        )
        for session in sessions_result.scalars().all():
            await db.delete(session)
        await db.flush()

    @staticmethod
    async def delete_user(user_uuid: str, db: AsyncSession) -> None:
        result = await db.execute(select(User).where(User.uuid == user_uuid))
        user = result.scalar_one_or_none()
        if not user:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        await db.delete(user)
        await db.flush()

    @staticmethod
    async def impersonate_user(
        admin_uuid: str,
        target_uuid: str,
        db: AsyncSession,
    ) -> ImpersonateResponse:
        result = await db.execute(select(User).where(User.uuid == target_uuid))
        target = result.scalar_one_or_none()
        if not target:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found")

        expire = datetime.now(timezone.utc) + timedelta(minutes=_IMPERSONATE_EXPIRE_MINUTES)
        payload = {
            "sub": target_uuid,
            "type": "access",
            "jti": str(_uuid.uuid4()),
            "impersonated_by": admin_uuid,
            "exp": expire,
            "iat": datetime.now(timezone.utc),
        }
        temp_token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

        from services.platform_event_service import PlatformEventService
        await PlatformEventService.log_event(
            event_type=PlatformEventType.admin_impersonate,
            db=db,
            actor_uuid=admin_uuid,
            target_user_uuid=target_uuid,
            event_data={"target_email": target.email},
        )
        return ImpersonateResponse(
            temp_token=temp_token,
            expires_in=_IMPERSONATE_EXPIRE_MINUTES * 60,
            target_email=target.email,
        )

    @staticmethod
    async def list_orgs(
        db: AsyncSession,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[AdminOrgResponse]:
        query = select(Organization)
        if search:
            query = query.where(Organization.name.like(f"%{search}%"))
        query = query.order_by(Organization.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(query)
        orgs = result.scalars().all()

        out = []
        for org in orgs:
            member_count = (await db.execute(
                select(func.count()).select_from(OrgMember).where(
                    and_(
                        OrgMember.org_id == org.uuid,
                        OrgMember.status == OrgMemberStatus.accepted,
                    )
                )
            )).scalar_one()
            collection_count = (await db.execute(
                select(func.count()).select_from(Collection).where(
                    Collection.org_id == org.uuid
                )
            )).scalar_one()
            # Get owner email
            owner_result = await db.execute(select(User).where(User.id == org.owner_id))
            owner = owner_result.scalar_one_or_none()
            owner_email = owner.email if owner else ""

            out.append(AdminOrgResponse(
                uuid=org.uuid,
                name=org.name,
                owner_email=owner_email,
                member_count=member_count,
                collection_count=collection_count,
                is_suspended=bool(org.is_suspended),
                created_at=org.created_at,
            ))
        return out

    @staticmethod
    async def suspend_org(org_uuid: str, admin_uuid: str, db: AsyncSession) -> None:
        result = await db.execute(select(Organization).where(Organization.uuid == org_uuid))
        org = result.scalar_one_or_none()
        if not org:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
        org.is_suspended = 1
        await db.flush()

        from services.platform_event_service import PlatformEventService
        from models.org_event import OrgEventType
        from services.org_event_service import OrgEventService
        await PlatformEventService.log_event(
            event_type=PlatformEventType.org_suspended,
            db=db,
            actor_uuid=admin_uuid,
            target_org_uuid=org_uuid,
        )
        await OrgEventService.log_event(
            org_uuid=org_uuid,
            event_type=OrgEventType.org_suspended,
            db=db,
            actor_uuid=admin_uuid,
        )

    @staticmethod
    async def reactivate_org(org_uuid: str, admin_uuid: str, db: AsyncSession) -> None:
        result = await db.execute(select(Organization).where(Organization.uuid == org_uuid))
        org = result.scalar_one_or_none()
        if not org:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
        org.is_suspended = 0
        await db.flush()

        from services.platform_event_service import PlatformEventService
        from models.org_event import OrgEventType
        from services.org_event_service import OrgEventService
        await PlatformEventService.log_event(
            event_type=PlatformEventType.org_reactivated,
            db=db,
            actor_uuid=admin_uuid,
            target_org_uuid=org_uuid,
        )
        await OrgEventService.log_event(
            org_uuid=org_uuid,
            event_type=OrgEventType.org_reactivated,
            db=db,
            actor_uuid=admin_uuid,
        )
