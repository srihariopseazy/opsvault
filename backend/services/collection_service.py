import uuid as _uuid
from typing import List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

from models.user import User
from models.organization import Organization
from models.org_member import OrgMember, OrgMemberRole, OrgMemberStatus
from models.collection import Collection
from models.collection_member import CollectionMember, CollectionAccess
from models.collection_item import CollectionItem
from models.vault_item import VaultItem
from schemas.collections import (
    CollectionResponse,
    CollectionDetail,
    CollectionMemberResponse,
    CollectionItemResponse,
)


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _get_org_membership(
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


async def _resolve_collection_access(
    user: User,
    collection_uuid: str,
    db: AsyncSession,
) -> Tuple[Collection, str]:
    """Return (collection, access_level) or raise 403/404.
    access_level is 'read', 'write', or 'admin' (owner/admin of the org).
    """
    coll_res = await db.execute(
        select(Collection).where(Collection.uuid == collection_uuid)
    )
    collection = coll_res.scalar_one_or_none()
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    # Check org membership first
    org_m = await _get_org_membership(user.id, collection.org_id, db)
    if not org_m:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this organization",
        )

    # Owner/admin have full access
    if org_m.role in (OrgMemberRole.owner, OrgMemberRole.admin):
        return collection, "admin"

    # Regular member — check collection_members table
    cm_res = await db.execute(
        select(CollectionMember).where(
            and_(
                CollectionMember.collection_id == collection_uuid,
                CollectionMember.user_id == user.id,
            )
        )
    )
    cm = cm_res.scalar_one_or_none()
    if not cm:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this collection",
        )
    return collection, cm.access.value


async def _require_collection_admin(
    user: User,
    collection_uuid: str,
    db: AsyncSession,
) -> Collection:
    collection, access = await _resolve_collection_access(user, collection_uuid, db)
    if access != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or owner role required to manage this collection",
        )
    return collection


# ── CollectionService ─────────────────────────────────────────────────────────

class CollectionService:

    @staticmethod
    async def list_accessible(user: User, db: AsyncSession) -> List[CollectionResponse]:
        """List all collections the user can access across all their orgs."""
        # Get all accepted org memberships
        memberships_res = await db.execute(
            select(OrgMember).where(
                and_(
                    OrgMember.user_id == user.id,
                    OrgMember.status == OrgMemberStatus.accepted,
                )
            )
        )
        memberships = memberships_res.scalars().all()
        org_roles = {m.org_id: m.role for m in memberships}

        collections: List[CollectionResponse] = []
        seen_uuids: set = set()

        for org_id, role in org_roles.items():
            if role in (OrgMemberRole.owner, OrgMemberRole.admin):
                # Admins/owners see all collections in the org
                coll_res = await db.execute(
                    select(Collection).where(Collection.org_id == org_id)
                )
                org_collections = coll_res.scalars().all()
                for c in org_collections:
                    if c.uuid not in seen_uuids:
                        seen_uuids.add(c.uuid)
                        ic = await db.execute(
                            select(func.count(CollectionItem.id)).where(
                                CollectionItem.collection_id == c.uuid
                            )
                        )
                        mc = await db.execute(
                            select(func.count(CollectionMember.id)).where(
                                CollectionMember.collection_id == c.uuid
                            )
                        )
                        collections.append(CollectionResponse(
                            uuid=c.uuid,
                            org_id=c.org_id,
                            name=c.name,
                            item_count=ic.scalar() or 0,
                            member_count=mc.scalar() or 0,
                            my_access="admin",
                            created_at=c.created_at,
                        ))
            else:
                # Regular members see only their assigned collections
                cm_res = await db.execute(
                    select(CollectionMember)
                    .join(Collection, Collection.uuid == CollectionMember.collection_id)
                    .where(
                        and_(
                            CollectionMember.user_id == user.id,
                            Collection.org_id == org_id,
                        )
                    )
                )
                assigned = cm_res.scalars().all()
                for cm in assigned:
                    if cm.collection_id not in seen_uuids:
                        seen_uuids.add(cm.collection_id)
                        c_res = await db.execute(
                            select(Collection).where(Collection.uuid == cm.collection_id)
                        )
                        c = c_res.scalar_one_or_none()
                        if c:
                            ic = await db.execute(
                                select(func.count(CollectionItem.id)).where(
                                    CollectionItem.collection_id == c.uuid
                                )
                            )
                            mc = await db.execute(
                                select(func.count(CollectionMember.id)).where(
                                    CollectionMember.collection_id == c.uuid
                                )
                            )
                            collections.append(CollectionResponse(
                                uuid=c.uuid,
                                org_id=c.org_id,
                                name=c.name,
                                item_count=ic.scalar() or 0,
                                member_count=mc.scalar() or 0,
                                my_access=cm.access.value,
                                created_at=c.created_at,
                            ))
        return collections

    @staticmethod
    async def create_collection(
        user: User,
        org_id: str,
        name: str,
        db: AsyncSession,
    ) -> CollectionResponse:
        # Only org admin/owner can create collections
        org_m = await _get_org_membership(user.id, org_id, db)
        if not org_m or org_m.role not in (OrgMemberRole.owner, OrgMemberRole.admin):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin or owner role required to create collections",
            )

        collection = Collection(
            uuid=str(_uuid.uuid4()),
            org_id=org_id,
            name=name.strip(),
        )
        db.add(collection)
        await db.flush()

        return CollectionResponse(
            uuid=collection.uuid,
            org_id=collection.org_id,
            name=collection.name,
            item_count=0,
            member_count=0,
            my_access="admin",
            created_at=collection.created_at,
        )

    @staticmethod
    async def get_collection_detail(
        user: User,
        collection_uuid: str,
        db: AsyncSession,
    ) -> CollectionDetail:
        collection, my_access = await _resolve_collection_access(user, collection_uuid, db)

        # Members
        cm_res = await db.execute(
            select(CollectionMember).where(
                CollectionMember.collection_id == collection_uuid
            )
        )
        cms = cm_res.scalars().all()

        member_responses: List[CollectionMemberResponse] = []
        for cm in cms:
            u_res = await db.execute(select(User).where(User.id == cm.user_id))
            u = u_res.scalar_one_or_none()
            if u:
                member_responses.append(CollectionMemberResponse(
                    uuid=cm.uuid,
                    user_uuid=u.uuid,
                    user_name=u.name,
                    user_email=u.email,
                    access=cm.access.value,
                    created_at=cm.created_at,
                ))

        # Items
        ci_res = await db.execute(
            select(CollectionItem).where(
                CollectionItem.collection_id == collection_uuid
            )
        )
        cis = ci_res.scalars().all()

        item_responses: List[CollectionItemResponse] = []
        for ci in cis:
            vi_res = await db.execute(
                select(VaultItem).where(VaultItem.uuid == ci.item_id)
            )
            vi = vi_res.scalar_one_or_none()
            if vi:
                item_responses.append(CollectionItemResponse(
                    uuid=ci.uuid,
                    item_uuid=vi.uuid,
                    item_name=vi.name,  # encrypted string — client decrypts if it owns the item
                    item_type=vi.type.value,
                    added_at=ci.added_at,
                ))

        return CollectionDetail(
            uuid=collection.uuid,
            org_id=collection.org_id,
            name=collection.name,
            my_access=my_access,
            members=member_responses,
            items=item_responses,
            created_at=collection.created_at,
        )

    @staticmethod
    async def rename_collection(
        user: User,
        collection_uuid: str,
        name: str,
        db: AsyncSession,
    ) -> Collection:
        collection = await _require_collection_admin(user, collection_uuid, db)
        collection.name = name.strip()
        await db.flush()
        return collection

    @staticmethod
    async def delete_collection(
        user: User,
        collection_uuid: str,
        db: AsyncSession,
    ) -> None:
        collection = await _require_collection_admin(user, collection_uuid, db)
        await db.delete(collection)
        await db.flush()

    @staticmethod
    async def add_member(
        user: User,
        collection_uuid: str,
        target_user_uuid: str,
        access_str: str,
        db: AsyncSession,
    ) -> CollectionMember:
        collection = await _require_collection_admin(user, collection_uuid, db)

        # Validate access level
        try:
            access = CollectionAccess(access_str)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid access level: {access_str}",
            )

        # Resolve target user
        u_res = await db.execute(
            select(User).where(User.uuid == target_user_uuid)
        )
        target = u_res.scalar_one_or_none()
        if not target:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        # Target must be an accepted org member
        org_m = await _get_org_membership(target.id, collection.org_id, db)
        if not org_m:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is not an accepted member of this organization",
            )

        # Check not already assigned
        existing = await db.execute(
            select(CollectionMember).where(
                and_(
                    CollectionMember.collection_id == collection_uuid,
                    CollectionMember.user_id == target.id,
                )
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User already has access to this collection",
            )

        cm = CollectionMember(
            uuid=str(_uuid.uuid4()),
            collection_id=collection_uuid,
            user_id=target.id,
            access=access,
        )
        db.add(cm)
        await db.flush()
        cm.user = target
        return cm

    @staticmethod
    async def remove_member(
        user: User,
        collection_uuid: str,
        member_uuid: str,
        db: AsyncSession,
    ) -> None:
        await _require_collection_admin(user, collection_uuid, db)

        cm_res = await db.execute(
            select(CollectionMember).where(
                and_(
                    CollectionMember.uuid == member_uuid,
                    CollectionMember.collection_id == collection_uuid,
                )
            )
        )
        cm = cm_res.scalar_one_or_none()
        if not cm:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Collection member not found",
            )
        await db.delete(cm)
        await db.flush()

    @staticmethod
    async def add_item(
        user: User,
        collection_uuid: str,
        item_uuid: str,
        db: AsyncSession,
    ) -> CollectionItem:
        collection, my_access = await _resolve_collection_access(user, collection_uuid, db)
        if my_access == "read":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Write access required to add items to this collection",
            )

        # Verify the vault item exists and belongs to the requesting user
        vi_res = await db.execute(
            select(VaultItem).where(
                and_(
                    VaultItem.uuid == item_uuid,
                    VaultItem.user_id == user.id,
                    VaultItem.deleted_at.is_(None),
                )
            )
        )
        vi = vi_res.scalar_one_or_none()
        if not vi:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vault item not found or does not belong to you",
            )

        # Check not already in this collection
        existing = await db.execute(
            select(CollectionItem).where(
                and_(
                    CollectionItem.collection_id == collection_uuid,
                    CollectionItem.item_id == item_uuid,
                )
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Item is already in this collection",
            )

        ci = CollectionItem(
            uuid=str(_uuid.uuid4()),
            collection_id=collection_uuid,
            item_id=item_uuid,
        )
        db.add(ci)
        await db.flush()
        return ci

    @staticmethod
    async def remove_item(
        user: User,
        collection_uuid: str,
        item_uuid: str,
        db: AsyncSession,
    ) -> None:
        _collection, my_access = await _resolve_collection_access(user, collection_uuid, db)
        if my_access == "read":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Write access required to remove items from this collection",
            )

        ci_res = await db.execute(
            select(CollectionItem).where(
                and_(
                    CollectionItem.collection_id == collection_uuid,
                    CollectionItem.item_id == item_uuid,
                )
            )
        )
        ci = ci_res.scalar_one_or_none()
        if not ci:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found in this collection",
            )
        await db.delete(ci)
        await db.flush()
