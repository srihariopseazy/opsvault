import uuid as _uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from typing import List

from database import get_db
from dependencies import get_current_active_user
from models.user import User
from models.generator_history import GeneratorHistory
from schemas.generator_history import GeneratorHistorySave, GeneratorHistoryResponse
from schemas.common import MessageResponse

router = APIRouter(prefix="/generator-history", tags=["generator-history"])

_MAX_HISTORY = 100


@router.get("", response_model=List[GeneratorHistoryResponse])
async def list_history(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GeneratorHistory)
        .where(GeneratorHistory.user_id == current_user.id)
        .order_by(GeneratorHistory.created_at.desc())
        .limit(_MAX_HISTORY)
    )
    entries = result.scalars().all()
    return [
        GeneratorHistoryResponse(uuid=e.uuid, password=e.password, created_at=e.created_at)
        for e in entries
    ]


@router.post("", response_model=GeneratorHistoryResponse, status_code=201)
async def save_password(
    data: GeneratorHistorySave,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    # Enforce max 100 entries — delete oldest if over limit
    count_res = await db.execute(
        select(func.count(GeneratorHistory.id)).where(
            GeneratorHistory.user_id == current_user.id
        )
    )
    count = count_res.scalar() or 0

    if count >= _MAX_HISTORY:
        oldest_res = await db.execute(
            select(GeneratorHistory)
            .where(GeneratorHistory.user_id == current_user.id)
            .order_by(GeneratorHistory.created_at.asc())
            .limit(count - _MAX_HISTORY + 1)
        )
        for old in oldest_res.scalars().all():
            await db.delete(old)

    entry = GeneratorHistory(
        uuid=str(_uuid.uuid4()),
        user_id=current_user.id,
        password=data.password,
    )
    db.add(entry)
    await db.flush()
    return GeneratorHistoryResponse(uuid=entry.uuid, password=entry.password, created_at=entry.created_at)


@router.delete("", response_model=MessageResponse)
async def clear_all_history(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GeneratorHistory).where(GeneratorHistory.user_id == current_user.id)
    )
    for entry in result.scalars().all():
        await db.delete(entry)
    await db.flush()
    return MessageResponse(message="Generator history cleared")


@router.delete("/{entry_uuid}", response_model=MessageResponse)
async def delete_history_entry(
    entry_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GeneratorHistory).where(
            and_(
                GeneratorHistory.uuid == entry_uuid,
                GeneratorHistory.user_id == current_user.id,
            )
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        from fastapi import HTTPException, status as http_status
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Entry not found")
    await db.delete(entry)
    await db.flush()
    return MessageResponse(message="Entry deleted")
