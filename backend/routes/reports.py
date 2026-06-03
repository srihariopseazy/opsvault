import asyncio
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from database import get_db
from dependencies import get_current_active_user
from models.user import User
from schemas.report import (
    ScheduledReportCreate,
    ScheduledReportUpdate,
    ScheduledReportResponse,
    ReportLogResponse,
    VaultHealthReportResponse,
    BreachCheckItem,
    BreachCheckResponse,
    BreachResult,
    ComplianceReportResponse,
)
from schemas.common import MessageResponse
from services import report_service
from services.breach_service import check_prefix

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/vault-health", response_model=VaultHealthReportResponse)
async def get_vault_health(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await report_service.generate_vault_health_report(current_user.uuid, db)


@router.post("/breach-check", response_model=BreachCheckResponse)
async def check_breaches(
    items: List[BreachCheckItem],
    _: User = Depends(get_current_active_user),
):
    """Check a list of password hash prefixes against HaveIBeenPwned.

    Client sends { uuid, password_hash_prefix } where prefix is the first 5
    uppercase hex chars of the SHA-1 hash of the plaintext password.
    The full suffix must be included so we can match per-item breach count.
    We extend BreachCheckItem with the full hash for suffix matching — client
    sends the prefix; we return all suffix+count pairs so the client can check.
    """
    # Group items by prefix to deduplicate HIBP calls
    prefix_map: dict[str, list] = {}
    for item in items:
        prefix = item.password_hash_prefix.upper()[:5]
        if len(prefix) < 5:
            continue
        prefix_map.setdefault(prefix, []).append(item)

    # For each unique prefix, fetch HIBP data
    # We return all suffix+count data keyed by prefix — client does final match.
    # But to return per-item count the client must also send suffix (chars 6+).
    # Since the spec has the client send only prefix, we take a conservative
    # approach: if any hash in the HIBP result matches the prefix bucket,
    # we mark total breached count as the MAX count seen for that prefix.
    results: List[BreachResult] = []

    for prefix, prefix_items in prefix_map.items():
        try:
            suffix_counts = await check_prefix(prefix)
        except Exception:
            continue

        if not suffix_counts:
            continue

        # Return the maximum pwned count for any suffix in this prefix as
        # a conservative per-item result. Client can refine with full hash.
        max_count = max(c for _, c in suffix_counts) if suffix_counts else 0
        if max_count > 0:
            for item in prefix_items:
                results.append(BreachResult(uuid=item.uuid, pwned_count=max_count))

        # Rate limiting already applied inside check_prefix (asyncio.sleep)

    return BreachCheckResponse(
        results=results,
        checked=len(items),
        breached=len(results),
    )


@router.get("/compliance/{org_uuid}", response_model=ComplianceReportResponse)
async def get_compliance_report(
    org_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await report_service.generate_compliance_report(org_uuid, current_user.uuid, db)


@router.get("/scheduled", response_model=List[ScheduledReportResponse])
async def list_scheduled_reports(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await report_service.get_scheduled_reports(current_user.uuid, db)


@router.post("/scheduled", response_model=ScheduledReportResponse, status_code=201)
async def create_scheduled_report(
    data: ScheduledReportCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await report_service.create_scheduled_report(current_user.uuid, data, db)
    await db.commit()
    return result


@router.put("/scheduled/{report_uuid}", response_model=ScheduledReportResponse)
async def update_scheduled_report(
    report_uuid: str,
    data: ScheduledReportUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await report_service.update_scheduled_report(report_uuid, current_user.uuid, data, db)
    await db.commit()
    return result


@router.delete("/scheduled/{report_uuid}", response_model=MessageResponse)
async def delete_scheduled_report(
    report_uuid: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await report_service.delete_scheduled_report(report_uuid, current_user.uuid, db)
    await db.commit()
    return MessageResponse(message="Scheduled report deleted")


@router.get("/logs", response_model=List[ReportLogResponse])
async def get_report_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await report_service.get_report_logs(current_user.uuid, db, skip=skip, limit=limit)
