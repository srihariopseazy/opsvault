import uuid as _uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

from models.report import ScheduledReport, ReportLog, ReportType, ReportFrequency, ReportStatus
from models.user import User
from models.vault_item import VaultItem
from models.organization import Organization
from models.org_member import OrgMember, OrgMemberRole, OrgMemberStatus
from models.collection import Collection
from models.org_policy import OrgPolicy
from schemas.report import (
    ScheduledReportCreate,
    ScheduledReportUpdate,
    ScheduledReportResponse,
    ReportLogResponse,
    VaultHealthReportResponse,
    VaultItemStat,
    ComplianceReportResponse,
    InactiveMember,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _next_send(frequency: ReportFrequency) -> datetime:
    now = datetime.now(timezone.utc)
    if frequency == ReportFrequency.daily:
        return now + timedelta(days=1)
    elif frequency == ReportFrequency.weekly:
        return now + timedelta(weeks=1)
    else:
        return now + timedelta(days=30)


def _to_scheduled_response(r: ScheduledReport) -> ScheduledReportResponse:
    return ScheduledReportResponse(
        uuid=r.uuid,
        report_type=r.report_type.value,
        frequency=r.frequency.value,
        enabled=bool(r.enabled),
        last_sent_at=r.last_sent_at,
        next_send_at=r.next_send_at,
        recipient_email=r.recipient_email,
        created_at=r.created_at,
    )


def _to_log_response(l: ReportLog) -> ReportLogResponse:
    return ReportLogResponse(
        uuid=l.uuid,
        report_type=l.report_type.value,
        status=l.status.value,
        file_size=l.file_size,
        error_message=l.error_message,
        created_at=l.created_at,
    )


# ── Vault health (server-side stats only) ─────────────────────────────────────

async def generate_vault_health_report(
    user_uuid: str,
    db: AsyncSession,
) -> VaultHealthReportResponse:
    user_res = await db.execute(select(User).where(User.uuid == user_uuid))
    user = user_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    items_res = await db.execute(
        select(VaultItem).where(
            and_(VaultItem.user_id == user.id, VaultItem.deleted_at.is_(None))
        )
    )
    items = items_res.scalars().all()

    cutoff_old = datetime.now(timezone.utc) - timedelta(days=180)

    by_type: dict = {}
    old_items: List[VaultItemStat] = []
    never_updated: List[VaultItemStat] = []

    for item in items:
        t = item.type.value
        by_type[t] = by_type.get(t, 0) + 1

        updated = item.updated_at
        created = item.created_at

        # Make timezone-aware for comparison
        if updated and updated.tzinfo is None:
            updated = updated.replace(tzinfo=timezone.utc)
        if created and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)

        stat = VaultItemStat(
            uuid=item.uuid,
            name=item.name,    # still encrypted ciphertext
            updated_at=item.updated_at,
            created_at=item.created_at,
            type=t,
        )

        if updated and updated < cutoff_old:
            old_items.append(stat)

        if created and updated and abs((updated - created).total_seconds()) < 5:
            never_updated.append(stat)

    return VaultHealthReportResponse(
        total_items=len(items),
        items_by_type=by_type,
        old_items=old_items,
        never_updated=never_updated,
        total_old=len(old_items),
        total_never_updated=len(never_updated),
    )


# ── Compliance report ─────────────────────────────────────────────────────────

async def generate_compliance_report(
    org_uuid: str,
    requesting_user_uuid: str,
    db: AsyncSession,
) -> ComplianceReportResponse:
    # Verify requester is admin/owner
    user_res = await db.execute(select(User).where(User.uuid == requesting_user_uuid))
    user = user_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    member_res = await db.execute(
        select(OrgMember).where(
            and_(
                OrgMember.org_id == org_uuid,
                OrgMember.user_id == user.id,
                OrgMember.status == OrgMemberStatus.accepted,
                OrgMember.role.in_([OrgMemberRole.owner, OrgMemberRole.admin]),
            )
        )
    )
    if not member_res.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin or owner role required")

    org_res = await db.execute(select(Organization).where(Organization.uuid == org_uuid))
    org = org_res.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    # All accepted members
    all_members_res = await db.execute(
        select(OrgMember).where(
            and_(OrgMember.org_id == org_uuid, OrgMember.status == OrgMemberStatus.accepted)
        )
    )
    all_members = all_members_res.scalars().all()

    total_members = len(all_members)
    members_with_2fa = 0
    inactive: List[InactiveMember] = []
    cutoff_inactive = datetime.now(timezone.utc) - timedelta(days=30)

    for m in all_members:
        member_user_res = await db.execute(select(User).where(User.id == m.user_id))
        mu = member_user_res.scalar_one_or_none()
        if not mu:
            continue
        if bool(mu.totp_enabled):
            members_with_2fa += 1

        last_login = mu.last_login_at
        if last_login and last_login.tzinfo is None:
            last_login = last_login.replace(tzinfo=timezone.utc)
        if not last_login or last_login < cutoff_inactive:
            inactive.append(InactiveMember(
                user_uuid=mu.uuid,
                user_email=mu.email,
                user_name=mu.name,
                last_login_at=mu.last_login_at,
                role=m.role.value,
            ))

    # Active policies
    policies_res = await db.execute(
        select(OrgPolicy).where(
            and_(OrgPolicy.org_uuid == org_uuid, OrgPolicy.enabled == 1)
        )
    )
    active_policies = [p.policy_type.value for p in policies_res.scalars().all()]

    # Collections count
    coll_count_res = await db.execute(
        select(func.count()).select_from(Collection).where(Collection.org_id == org_uuid)
    )
    total_collections = coll_count_res.scalar_one()

    # Compliance score: weighted average
    two_fa_pct = (members_with_2fa / total_members * 100) if total_members else 0
    policy_score = min(len(active_policies) / 6 * 100, 100)
    inactive_pct = (len(inactive) / total_members * 100) if total_members else 0
    activity_score = max(0, 100 - inactive_pct)
    compliance_score = round((two_fa_pct * 0.5 + policy_score * 0.3 + activity_score * 0.2), 1)

    return ComplianceReportResponse(
        org_uuid=org_uuid,
        org_name=org.name,
        total_members=total_members,
        members_with_2fa=members_with_2fa,
        members_without_2fa=total_members - members_with_2fa,
        two_fa_adoption_pct=round(two_fa_pct, 1),
        active_policies=active_policies,
        policy_count=len(active_policies),
        inactive_members=inactive,
        total_collections=total_collections,
        compliance_score=compliance_score,
    )


# ── Scheduled report CRUD ─────────────────────────────────────────────────────

async def get_scheduled_reports(user_uuid: str, db: AsyncSession) -> List[ScheduledReportResponse]:
    res = await db.execute(
        select(ScheduledReport)
        .where(ScheduledReport.user_uuid == user_uuid)
        .order_by(ScheduledReport.created_at.desc())
    )
    return [_to_scheduled_response(r) for r in res.scalars().all()]


async def create_scheduled_report(
    user_uuid: str,
    data: ScheduledReportCreate,
    db: AsyncSession,
) -> ScheduledReportResponse:
    try:
        rt = ReportType(data.report_type)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Invalid report_type: {data.report_type}")
    try:
        freq = ReportFrequency(data.frequency)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Invalid frequency: {data.frequency}")

    report = ScheduledReport(
        uuid=str(_uuid.uuid4()),
        user_uuid=user_uuid,
        report_type=rt,
        frequency=freq,
        enabled=1,
        next_send_at=_next_send(freq),
        recipient_email=data.recipient_email,
    )
    db.add(report)
    await db.flush()
    return _to_scheduled_response(report)


async def update_scheduled_report(
    report_uuid: str,
    user_uuid: str,
    data: ScheduledReportUpdate,
    db: AsyncSession,
) -> ScheduledReportResponse:
    res = await db.execute(
        select(ScheduledReport).where(
            and_(ScheduledReport.uuid == report_uuid, ScheduledReport.user_uuid == user_uuid)
        )
    )
    report = res.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    if data.enabled is not None:
        report.enabled = 1 if data.enabled else 0
    if data.recipient_email is not None:
        report.recipient_email = data.recipient_email
    if data.frequency is not None:
        try:
            freq = ReportFrequency(data.frequency)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Invalid frequency: {data.frequency}")
        report.frequency = freq
        report.next_send_at = _next_send(freq)

    await db.flush()
    return _to_scheduled_response(report)


async def delete_scheduled_report(
    report_uuid: str,
    user_uuid: str,
    db: AsyncSession,
) -> None:
    res = await db.execute(
        select(ScheduledReport).where(
            and_(ScheduledReport.uuid == report_uuid, ScheduledReport.user_uuid == user_uuid)
        )
    )
    report = res.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    await db.delete(report)
    await db.flush()


async def get_report_logs(
    user_uuid: str,
    db: AsyncSession,
    skip: int = 0,
    limit: int = 50,
) -> List[ReportLogResponse]:
    res = await db.execute(
        select(ReportLog)
        .where(ReportLog.user_uuid == user_uuid)
        .order_by(ReportLog.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return [_to_log_response(l) for l in res.scalars().all()]


# ── Scheduled report processing (called by Celery) ────────────────────────────

async def process_due_reports(db: AsyncSession) -> int:
    """Find all due reports, generate summaries, email them. Returns count processed."""
    now = datetime.now(timezone.utc)

    res = await db.execute(
        select(ScheduledReport).where(
            and_(
                ScheduledReport.enabled == 1,
                ScheduledReport.next_send_at <= now,
            )
        )
    )
    due = res.scalars().all()
    processed = 0

    for report in due:
        log = ReportLog(
            uuid=str(_uuid.uuid4()),
            user_uuid=report.user_uuid,
            report_type=report.report_type,
            status=ReportStatus.failed,
        )
        db.add(log)
        try:
            # Generate a lightweight summary for the email
            user_res = await db.execute(select(User).where(User.uuid == report.user_uuid))
            user = user_res.scalar_one_or_none()
            if not user:
                continue

            if report.report_type == ReportType.vault_health:
                health = await generate_vault_health_report(report.user_uuid, db)
                summary = {
                    "report_type": "Vault Health",
                    "total_items": health.total_items,
                    "old_items": health.total_old,
                    "never_updated": health.total_never_updated,
                }
            else:
                summary = {"report_type": report.report_type.value}

            from config import get_settings
            from services.email_service import send_email
            await send_email(
                to_email=report.recipient_email,
                template_name="scheduled_report",
                context={
                    "user_name": user.name,
                    "report_type": report.report_type.value.replace("_", " ").title(),
                    "frequency": report.frequency.value,
                    "summary": summary,
                    "frontend_url": get_settings().FRONTEND_URL,
                },
                db=db,
                user_uuid=report.user_uuid,
            )

            log.status = ReportStatus.sent
            report.last_sent_at = now
            report.next_send_at = _next_send(report.frequency)
            processed += 1

        except Exception as exc:
            log.status = ReportStatus.failed
            log.error_message = str(exc)[:500]

        await db.flush()

    return processed
