import uuid as _uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

from models.user import User
from models.organization import Organization
from models.org_member import OrgMember, OrgMemberRole, OrgMemberStatus
from models.collection import Collection
from models.collection_item import CollectionItem
from models.collection_member import CollectionMember
from schemas.organizations import (
    OrgSummary,
    OrgDetail,
    OrgMemberResponse,
    CollectionSummary,
    PendingInviteResponse,
)


# ── Role helpers ──────────────────────────────────────────────────────────────

_ROLE_RANK = {
    OrgMemberRole.owner: 3,
    OrgMemberRole.admin: 2,
    OrgMemberRole.member: 1,
}


def _is_admin_or_above(role: OrgMemberRole) -> bool:
    return _ROLE_RANK[role] >= _ROLE_RANK[OrgMemberRole.admin]


# ── Internal finders ──────────────────────────────────────────────────────────

async def _get_accepted_member(
    user_id: int,
    org_uuid: str,
    db: AsyncSession,
) -> Optional[OrgMember]:
    result = await db.execute(
        select(OrgMember).where(
            and_(
                OrgMember.org_id == org_uuid,
                OrgMember.user_id == user_id,
                OrgMember.status == OrgMemberStatus.accepted,
            )
        )
    )
    return result.scalar_one_or_none()


async def _require_accepted_member(
    user: User,
    org_uuid: str,
    db: AsyncSession,
) -> OrgMember:
    m = await _get_accepted_member(user.id, org_uuid, db)
    if not m:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this organization",
        )
    return m


async def _require_admin(
    user: User,
    org_uuid: str,
    db: AsyncSession,
) -> OrgMember:
    m = await _require_accepted_member(user, org_uuid, db)
    if not _is_admin_or_above(m.role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or owner role required",
        )
    return m


async def _require_owner(
    user: User,
    org_uuid: str,
    db: AsyncSession,
) -> OrgMember:
    m = await _require_accepted_member(user, org_uuid, db)
    if m.role != OrgMemberRole.owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner role required",
        )
    return m


async def _get_org(org_uuid: str, db: AsyncSession) -> Organization:
    result = await db.execute(
        select(Organization).where(Organization.uuid == org_uuid)
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )
    return org


def _member_to_response(m: OrgMember) -> OrgMemberResponse:
    return OrgMemberResponse(
        uuid=m.uuid,
        user_uuid=m.user.uuid,
        user_name=m.user.name,
        user_email=m.user.email,
        role=m.role.value,
        status=m.status.value,
        invited_at=m.invited_at,
        accepted_at=m.accepted_at,
    )


# ── OrgService ────────────────────────────────────────────────────────────────

class OrgService:

    @staticmethod
    async def create_org(user: User, name: str, db: AsyncSession) -> OrgSummary:
        org = Organization(
            uuid=str(_uuid.uuid4()),
            name=name.strip(),
            owner_id=user.id,
        )
        db.add(org)
        await db.flush()

        # Creator becomes an accepted owner member
        owner_member = OrgMember(
            uuid=str(_uuid.uuid4()),
            org_id=org.uuid,
            user_id=user.id,
            role=OrgMemberRole.owner,
            status=OrgMemberStatus.accepted,
            accepted_at=datetime.now(timezone.utc),
        )
        db.add(owner_member)
        await db.flush()

        return OrgSummary(
            uuid=org.uuid,
            name=org.name,
            member_count=1,
            my_role=OrgMemberRole.owner.value,
            created_at=org.created_at,
        )

    @staticmethod
    async def list_orgs(user: User, db: AsyncSession) -> List[OrgSummary]:
        result = await db.execute(
            select(OrgMember).where(
                and_(
                    OrgMember.user_id == user.id,
                    OrgMember.status == OrgMemberStatus.accepted,
                )
            )
        )
        memberships = result.scalars().all()

        summaries: List[OrgSummary] = []
        for m in memberships:
            # Count accepted members in this org
            count_res = await db.execute(
                select(func.count(OrgMember.id)).where(
                    and_(
                        OrgMember.org_id == m.org_id,
                        OrgMember.status == OrgMemberStatus.accepted,
                    )
                )
            )
            member_count = count_res.scalar() or 0

            org_res = await db.execute(
                select(Organization).where(Organization.uuid == m.org_id)
            )
            org = org_res.scalar_one_or_none()
            if org:
                summaries.append(OrgSummary(
                    uuid=org.uuid,
                    name=org.name,
                    member_count=member_count,
                    my_role=m.role.value,
                    created_at=org.created_at,
                ))
        return summaries

    @staticmethod
    async def get_org(user: User, org_uuid: str, db: AsyncSession) -> OrgDetail:
        my_membership = await _require_accepted_member(user, org_uuid, db)
        org = await _get_org(org_uuid, db)

        # Load all members (with user eager-ish: query User per member)
        members_res = await db.execute(
            select(OrgMember).where(OrgMember.org_id == org_uuid)
        )
        all_members = members_res.scalars().all()

        member_responses: List[OrgMemberResponse] = []
        for m in all_members:
            # Lazy-load user if not already loaded
            user_res = await db.execute(select(User).where(User.id == m.user_id))
            m.user = user_res.scalar_one_or_none()
            if m.user:
                member_responses.append(_member_to_response(m))

        # Load collections
        coll_res = await db.execute(
            select(Collection).where(Collection.org_id == org_uuid)
        )
        collections = coll_res.scalars().all()

        coll_summaries: List[CollectionSummary] = []
        for c in collections:
            items_count_res = await db.execute(
                select(func.count(CollectionItem.id)).where(
                    CollectionItem.collection_id == c.uuid
                )
            )
            members_count_res = await db.execute(
                select(func.count(CollectionMember.id)).where(
                    CollectionMember.collection_id == c.uuid
                )
            )
            coll_summaries.append(CollectionSummary(
                uuid=c.uuid,
                name=c.name,
                item_count=items_count_res.scalar() or 0,
                member_count=members_count_res.scalar() or 0,
            ))

        return OrgDetail(
            uuid=org.uuid,
            name=org.name,
            my_role=my_membership.role.value,
            members=member_responses,
            collections=coll_summaries,
            created_at=org.created_at,
        )

    @staticmethod
    async def rename_org(
        user: User,
        org_uuid: str,
        name: str,
        db: AsyncSession,
    ) -> Organization:
        await _require_admin(user, org_uuid, db)
        org = await _get_org(org_uuid, db)
        org.name = name.strip()
        await db.flush()
        return org

    @staticmethod
    async def delete_org(user: User, org_uuid: str, db: AsyncSession) -> None:
        await _require_owner(user, org_uuid, db)
        org = await _get_org(org_uuid, db)
        await db.delete(org)
        await db.flush()

    @staticmethod
    async def invite_member(
        user: User,
        org_uuid: str,
        email: str,
        role_str: str,
        db: AsyncSession,
    ) -> OrgMember:
        inviter = await _require_admin(user, org_uuid, db)

        # Only owner can invite admins
        try:
            role = OrgMemberRole(role_str)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid role: {role_str}",
            )
        if role == OrgMemberRole.owner:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot invite a member as owner",
            )
        if role == OrgMemberRole.admin and inviter.role != OrgMemberRole.owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the owner can invite admins",
            )

        # Look up target user
        user_res = await db.execute(
            select(User).where(User.email == email.lower())
        )
        target = user_res.scalar_one_or_none()
        if not target:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No OPSVAULT account found for that email address",
            )

        # Check not already a member
        existing_res = await db.execute(
            select(OrgMember).where(
                and_(
                    OrgMember.org_id == org_uuid,
                    OrgMember.user_id == target.id,
                    OrgMember.status != OrgMemberStatus.rejected,
                )
            )
        )
        if existing_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User is already a member or has a pending invite",
            )

        new_member = OrgMember(
            uuid=str(_uuid.uuid4()),
            org_id=org_uuid,
            user_id=target.id,
            role=role,
            status=OrgMemberStatus.invited,
        )
        db.add(new_member)
        await db.flush()
        new_member.user = target
        return new_member

    @staticmethod
    async def change_member_role(
        user: User,
        org_uuid: str,
        member_uuid: str,
        role_str: str,
        db: AsyncSession,
    ) -> OrgMember:
        actor = await _require_admin(user, org_uuid, db)

        target_res = await db.execute(
            select(OrgMember).where(
                and_(
                    OrgMember.uuid == member_uuid,
                    OrgMember.org_id == org_uuid,
                )
            )
        )
        target = target_res.scalar_one_or_none()
        if not target:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found",
            )

        try:
            new_role = OrgMemberRole(role_str)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid role: {role_str}",
            )

        if target.role == OrgMemberRole.owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot change the owner's role",
            )
        if new_role == OrgMemberRole.owner:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Use a transfer-ownership flow to change the owner",
            )
        if new_role == OrgMemberRole.admin and actor.role != OrgMemberRole.owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the owner can promote members to admin",
            )

        target.role = new_role
        await db.flush()
        return target

    @staticmethod
    async def remove_member(
        user: User,
        org_uuid: str,
        member_uuid: str,
        db: AsyncSession,
    ) -> None:
        actor = await _require_accepted_member(user, org_uuid, db)

        target_res = await db.execute(
            select(OrgMember).where(
                and_(
                    OrgMember.uuid == member_uuid,
                    OrgMember.org_id == org_uuid,
                )
            )
        )
        target = target_res.scalar_one_or_none()
        if not target:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found",
            )

        # Self-removal always allowed; admins can remove members; owner can remove anyone
        is_self = target.user_id == user.id
        if not is_self and not _is_admin_or_above(actor.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to remove this member",
            )
        if target.role == OrgMemberRole.owner and not is_self:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot remove the organization owner",
            )

        await db.delete(target)
        await db.flush()

    @staticmethod
    async def accept_invite(
        user: User,
        invite_uuid: str,
        db: AsyncSession,
    ) -> OrgMember:
        result = await db.execute(
            select(OrgMember).where(
                and_(
                    OrgMember.uuid == invite_uuid,
                    OrgMember.user_id == user.id,
                    OrgMember.status == OrgMemberStatus.invited,
                )
            )
        )
        invite = result.scalar_one_or_none()
        if not invite:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invite not found",
            )
        invite.status = OrgMemberStatus.accepted
        invite.accepted_at = datetime.now(timezone.utc)
        await db.flush()
        return invite

    @staticmethod
    async def reject_invite(
        user: User,
        invite_uuid: str,
        db: AsyncSession,
    ) -> OrgMember:
        result = await db.execute(
            select(OrgMember).where(
                and_(
                    OrgMember.uuid == invite_uuid,
                    OrgMember.user_id == user.id,
                    OrgMember.status == OrgMemberStatus.invited,
                )
            )
        )
        invite = result.scalar_one_or_none()
        if not invite:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invite not found",
            )
        invite.status = OrgMemberStatus.rejected
        await db.flush()
        return invite

    @staticmethod
    async def list_pending_invites(
        user: User,
        db: AsyncSession,
    ) -> List[PendingInviteResponse]:
        result = await db.execute(
            select(OrgMember).where(
                and_(
                    OrgMember.user_id == user.id,
                    OrgMember.status == OrgMemberStatus.invited,
                )
            )
        )
        invites = result.scalars().all()

        responses: List[PendingInviteResponse] = []
        for inv in invites:
            org_res = await db.execute(
                select(Organization).where(Organization.uuid == inv.org_id)
            )
            org = org_res.scalar_one_or_none()
            if org:
                responses.append(PendingInviteResponse(
                    uuid=inv.uuid,
                    org_uuid=inv.org_id,
                    org_name=org.name,
                    role=inv.role.value,
                    invited_at=inv.invited_at,
                ))
        return responses
