from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from database import get_db
from dependencies import get_current_active_user
from models.user import User
from models.vault_item import VaultItem, VaultItemType
from schemas.dashboard import DashboardStats, RecentItemSummary

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_stats(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    base = and_(VaultItem.user_id == current_user.id, VaultItem.deleted_at.is_(None))

    # Aggregate counts
    agg_result = await db.execute(
        select(
            func.count(VaultItem.id).label("total"),
            func.sum(func.if_(VaultItem.type == VaultItemType.login, 1, 0)).label("logins"),
            func.sum(func.if_(VaultItem.type == VaultItemType.note, 1, 0)).label("notes"),
            func.sum(func.if_(VaultItem.type == VaultItemType.card, 1, 0)).label("cards"),
            func.sum(func.if_(VaultItem.type == VaultItemType.identity, 1, 0)).label("identities"),
            func.sum(VaultItem.favorite).label("favorites"),
        ).where(base)
    )
    row = agg_result.one()

    trash_result = await db.execute(
        select(func.count(VaultItem.id)).where(
            and_(VaultItem.user_id == current_user.id, VaultItem.deleted_at.isnot(None))
        )
    )
    trash_count = trash_result.scalar() or 0

    # Recent added (last 5)
    recent_result = await db.execute(
        select(VaultItem.uuid, VaultItem.type, VaultItem.created_at, VaultItem.updated_at)
        .where(base)
        .order_by(VaultItem.created_at.desc())
        .limit(5)
    )
    recent_rows = recent_result.all()

    # Recently modified (last 5 by revision_date)
    modified_result = await db.execute(
        select(VaultItem.uuid, VaultItem.type, VaultItem.created_at, VaultItem.updated_at)
        .where(base)
        .order_by(VaultItem.revision_date.desc())
        .limit(5)
    )
    modified_rows = modified_result.all()

    return DashboardStats(
        total_items=row.total or 0,
        logins=row.logins or 0,
        notes=row.notes or 0,
        cards=row.cards or 0,
        identities=row.identities or 0,
        favorites=row.favorites or 0,
        trash=trash_count,
        weak_passwords_count=0,    # Encrypted server-side — computed client-side
        reused_passwords_count=0,  # Encrypted server-side — computed client-side
        recent_items=[
            RecentItemSummary(
                uuid=r.uuid,
                type=r.type.value if hasattr(r.type, "value") else str(r.type),
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in recent_rows
        ],
        recent_modified=[
            RecentItemSummary(
                uuid=r.uuid,
                type=r.type.value if hasattr(r.type, "value") else str(r.type),
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in modified_rows
        ],
    )
