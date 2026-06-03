from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from typing import List, Optional
from datetime import datetime

from database import get_db
from dependencies import get_current_superuser
from models.user import User
from models.email_log import EmailLog, EmailStatus
from schemas.smtp import SmtpConfigUpdate, SmtpConfigResponse, SmtpTestRequest, SmtpTestResponse
from schemas.email_log import EmailLogResponse, EmailLogListResponse
from services.smtp_config_service import SmtpConfigService

router = APIRouter(prefix="/admin/smtp", tags=["smtp"])


@router.get("", response_model=SmtpConfigResponse)
async def get_smtp_config(
    _: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    return await SmtpConfigService.get_config_response(db)


@router.put("", response_model=SmtpConfigResponse)
async def update_smtp_config(
    data: SmtpConfigUpdate,
    _: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    result = await SmtpConfigService.update_config(data, db)
    await db.commit()
    return result


@router.post("/test", response_model=SmtpTestResponse)
async def test_smtp(
    data: SmtpTestRequest,
    _: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    result = await SmtpConfigService.test_smtp(data.to_email, db)
    await db.commit()
    return result


@router.get("/logs", response_model=EmailLogListResponse)
async def get_email_logs(
    status: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
):
    conditions = []
    if status:
        try:
            conditions.append(EmailLog.status == EmailStatus(status))
        except ValueError:
            pass
    if date_from:
        conditions.append(EmailLog.created_at >= date_from)
    if date_to:
        conditions.append(EmailLog.created_at <= date_to)

    query = select(EmailLog)
    if conditions:
        query = query.where(and_(*conditions))

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar_one()

    query = query.order_by(EmailLog.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()

    items = [
        EmailLogResponse(
            uuid=l.uuid,
            to_email=l.to_email,
            subject=l.subject,
            template=l.template,
            status=l.status.value,
            error_message=l.error_message,
            user_uuid=l.user_uuid,
            created_at=l.created_at,
        )
        for l in logs
    ]
    return EmailLogListResponse(items=items, total=total)
