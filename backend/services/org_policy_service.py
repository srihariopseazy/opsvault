import uuid as _uuid
from typing import List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from models.org_policy import OrgPolicy, OrgPolicyType
from models.org_member import OrgMember, OrgMemberStatus
from schemas.org_policy import OrgPolicyResponse, OrgPoliciesResponse

_ALL_POLICY_TYPES = list(OrgPolicyType)


async def _ensure_all_policies(org_uuid: str, db: AsyncSession) -> None:
    """Lazily create default (disabled) rows for any missing policy types."""
    result = await db.execute(
        select(OrgPolicy.policy_type).where(OrgPolicy.org_uuid == org_uuid)
    )
    existing = {row[0] for row in result.all()}

    for pt in _ALL_POLICY_TYPES:
        if pt not in existing:
            policy = OrgPolicy(
                uuid=str(_uuid.uuid4()),
                org_uuid=org_uuid,
                policy_type=pt,
                enabled=0,
                policy_data=None,
            )
            db.add(policy)
    await db.flush()


def _to_response(p: OrgPolicy) -> OrgPolicyResponse:
    return OrgPolicyResponse(
        policy_type=p.policy_type.value,
        enabled=bool(p.enabled),
        policy_data=p.policy_data,
        updated_at=p.updated_at,
    )


class OrgPolicyService:

    @staticmethod
    async def get_policies(org_uuid: str, db: AsyncSession) -> OrgPoliciesResponse:
        await _ensure_all_policies(org_uuid, db)
        result = await db.execute(
            select(OrgPolicy).where(OrgPolicy.org_uuid == org_uuid)
        )
        policies = result.scalars().all()
        # Sort by enum order for consistent display
        policy_map = {p.policy_type: p for p in policies}
        ordered = [policy_map[pt] for pt in _ALL_POLICY_TYPES if pt in policy_map]
        return OrgPoliciesResponse(
            org_uuid=org_uuid,
            policies=[_to_response(p) for p in ordered],
        )

    @staticmethod
    async def set_policy(
        org_uuid: str,
        policy_type_str: str,
        enabled: bool,
        policy_data: Optional[dict],
        db: AsyncSession,
    ) -> OrgPolicyResponse:
        try:
            policy_type = OrgPolicyType(policy_type_str)
        except ValueError:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown policy type: {policy_type_str}",
            )

        result = await db.execute(
            select(OrgPolicy).where(
                and_(
                    OrgPolicy.org_uuid == org_uuid,
                    OrgPolicy.policy_type == policy_type,
                )
            )
        )
        policy = result.scalar_one_or_none()
        if policy:
            policy.enabled = 1 if enabled else 0
            policy.policy_data = policy_data
        else:
            policy = OrgPolicy(
                uuid=str(_uuid.uuid4()),
                org_uuid=org_uuid,
                policy_type=policy_type,
                enabled=1 if enabled else 0,
                policy_data=policy_data,
            )
            db.add(policy)
        await db.flush()
        return _to_response(policy)

    @staticmethod
    async def get_active_policies(
        org_uuid: str, db: AsyncSession
    ) -> List[OrgPolicyResponse]:
        result = await db.execute(
            select(OrgPolicy).where(
                and_(OrgPolicy.org_uuid == org_uuid, OrgPolicy.enabled == 1)
            )
        )
        return [_to_response(p) for p in result.scalars().all()]

    @staticmethod
    async def check_policy(
        org_uuid: str, policy_type_str: str, db: AsyncSession
    ) -> Tuple[bool, Optional[dict]]:
        try:
            policy_type = OrgPolicyType(policy_type_str)
        except ValueError:
            return False, None

        result = await db.execute(
            select(OrgPolicy).where(
                and_(
                    OrgPolicy.org_uuid == org_uuid,
                    OrgPolicy.policy_type == policy_type,
                )
            )
        )
        policy = result.scalar_one_or_none()
        if not policy:
            return False, None
        return bool(policy.enabled), policy.policy_data

    @staticmethod
    async def get_user_policies(
        user_uuid: str, db: AsyncSession
    ) -> List[OrgPolicyResponse]:
        """Aggregate all enabled policies across all orgs the user belongs to.
        Most-restrictive wins (if any org enables a policy, it's enforced)."""
        # Get all accepted org memberships
        result = await db.execute(
            select(OrgMember.org_id).where(
                and_(
                    OrgMember.user_id.in_(
                        select(
                            __import__("models.user", fromlist=["User"]).User.id
                        ).where(
                            __import__("models.user", fromlist=["User"]).User.uuid
                            == user_uuid
                        )
                    ),
                    OrgMember.status == OrgMemberStatus.accepted,
                )
            )
        )
        org_uuids = [row[0] for row in result.all()]

        if not org_uuids:
            return []

        # Get all enabled policies across those orgs
        policies_result = await db.execute(
            select(OrgPolicy).where(
                and_(
                    OrgPolicy.org_uuid.in_(org_uuids),
                    OrgPolicy.enabled == 1,
                )
            )
        )
        all_enabled = policies_result.scalars().all()

        # Deduplicate by policy type — most restrictive (any org enabling = enforced)
        seen: dict[str, OrgPolicy] = {}
        for p in all_enabled:
            pt = p.policy_type.value
            if pt not in seen:
                seen[pt] = p
        return [_to_response(p) for p in seen.values()]
