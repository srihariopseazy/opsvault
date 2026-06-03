import uuid as _uuid
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_

from models.user import User
from models.emergency_access import EmergencyAccess, EmergencyAccessStatus, EmergencyAccessType
from schemas.emergency_access import EmergencyAccessResponse
from services.notification_service import NotificationService
from config import get_settings as _get_settings


def _to_response(ea: EmergencyAccess) -> EmergencyAccessResponse:
    return EmergencyAccessResponse(
        uuid=ea.uuid,
        type=ea.type.value,
        status=ea.status.value,
        wait_time_days=ea.wait_time_days,
        recovery_initiated_at=ea.recovery_initiated_at,
        created_at=ea.created_at,
        grantor_uuid=ea.grantor.uuid if ea.grantor else None,
        grantor_name=ea.grantor.name if ea.grantor else None,
        grantor_email=ea.grantor.email if ea.grantor else None,
        grantee_uuid=ea.grantee.uuid if ea.grantee else None,
        grantee_name=ea.grantee.name if ea.grantee else None,
        grantee_email=ea.grantee.email if ea.grantee else None,
    )


async def _get_ea(
    ea_uuid: str,
    db: AsyncSession,
) -> EmergencyAccess:
    result = await db.execute(
        select(EmergencyAccess).where(EmergencyAccess.uuid == ea_uuid)
    )
    ea = result.scalar_one_or_none()
    if not ea:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Emergency access record not found",
        )
    return ea


async def _load_user_relations(ea: EmergencyAccess, db: AsyncSession) -> None:
    grantor_res = await db.execute(select(User).where(User.id == ea.grantor_id))
    ea.grantor = grantor_res.scalar_one_or_none()
    grantee_res = await db.execute(select(User).where(User.id == ea.grantee_id))
    ea.grantee = grantee_res.scalar_one_or_none()


def _check_auto_approval(ea: EmergencyAccess) -> bool:
    """Return True if the wait period has elapsed and status should be approved."""
    if ea.status != EmergencyAccessStatus.recovery_initiated:
        return False
    if not ea.recovery_initiated_at:
        return False
    deadline = ea.recovery_initiated_at + timedelta(days=ea.wait_time_days)
    return datetime.now(timezone.utc) >= deadline.replace(tzinfo=timezone.utc)


class EmergencyAccessService:

    @staticmethod
    async def invite(
        grantor: User,
        grantee_email: str,
        ea_type: str,
        wait_time_days: int,
        db: AsyncSession,
    ) -> EmergencyAccessResponse:
        # Validate type
        try:
            parsed_type = EmergencyAccessType(ea_type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid type: {ea_type}",
            )

        if wait_time_days < 1 or wait_time_days > 90:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="wait_time_days must be between 1 and 90",
            )

        # Look up grantee
        result = await db.execute(
            select(User).where(User.email == grantee_email.lower())
        )
        grantee = result.scalar_one_or_none()
        if not grantee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No OPSVAULT account found for that email",
            )
        if grantee.id == grantor.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot designate yourself as emergency contact",
            )

        # Check for existing active record
        existing_res = await db.execute(
            select(EmergencyAccess).where(
                and_(
                    EmergencyAccess.grantor_id == grantor.id,
                    EmergencyAccess.grantee_id == grantee.id,
                    EmergencyAccess.status.not_in(
                        [EmergencyAccessStatus.rejected]
                    ),
                )
            )
        )
        if existing_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An active emergency access record already exists with this contact",
            )

        ea = EmergencyAccess(
            uuid=str(_uuid.uuid4()),
            grantor_id=grantor.id,
            grantee_id=grantee.id,
            type=parsed_type,
            status=EmergencyAccessStatus.invited,
            wait_time_days=wait_time_days,
        )
        db.add(ea)
        await db.flush()

        # Notify grantee
        await NotificationService.create(
            user_id=grantee.id,
            notif_type="emergency_access_invite",
            title="Emergency access invitation",
            body=f"{grantor.name} ({grantor.email}) has designated you as an emergency contact.",
            db=db,
        )

        ea.grantor = grantor
        ea.grantee = grantee

        try:
            from services.email_service import send_email
            await send_email(
                to_email=grantee.email,
                template_name="emergency_access_invite",
                context={
                    "grantor_name": grantor.name,
                    "grantor_email": grantor.email,
                    "wait_time_days": wait_time_days,
                    "frontend_url": _get_settings().FRONTEND_URL,
                },
                db=db,
                user_uuid=grantee.uuid,
            )
        except Exception:
            pass

        return _to_response(ea)

    @staticmethod
    async def list_for_user(user: User, db: AsyncSession) -> List[EmergencyAccessResponse]:
        result = await db.execute(
            select(EmergencyAccess).where(
                or_(
                    EmergencyAccess.grantor_id == user.id,
                    EmergencyAccess.grantee_id == user.id,
                )
            )
        )
        records = result.scalars().all()

        responses: List[EmergencyAccessResponse] = []
        for ea in records:
            await _load_user_relations(ea, db)
            # Auto-approve if wait period elapsed
            if _check_auto_approval(ea):
                ea.status = EmergencyAccessStatus.recovery_approved
                await db.flush()
                await NotificationService.create(
                    user_id=ea.grantee_id,
                    notif_type="emergency_access_auto_approved",
                    title="Emergency access approved",
                    body=f"Your emergency access request for {ea.grantor.name}'s vault has been approved (wait period elapsed).",
                    db=db,
                )
            responses.append(_to_response(ea))
        return responses

    @staticmethod
    async def accept(user: User, ea_uuid: str, db: AsyncSession) -> EmergencyAccessResponse:
        ea = await _get_ea(ea_uuid, db)
        if ea.grantee_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if ea.status != EmergencyAccessStatus.invited:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invite is no longer pending",
            )
        ea.status = EmergencyAccessStatus.accepted
        await db.flush()

        await _load_user_relations(ea, db)
        await NotificationService.create(
            user_id=ea.grantor_id,
            notif_type="emergency_access_accepted",
            title="Emergency access accepted",
            body=f"{ea.grantee.name} ({ea.grantee.email}) has accepted your emergency access invite.",
            db=db,
        )
        try:
            from services.email_service import send_email
            await send_email(
                to_email=ea.grantor.email,
                template_name="emergency_access_accepted",
                context={
                    "grantee_name": ea.grantee.name,
                    "grantee_email": ea.grantee.email,
                    "frontend_url": _get_settings().FRONTEND_URL,
                },
                db=db,
                user_uuid=ea.grantor.uuid,
            )
        except Exception:
            pass
        return _to_response(ea)

    @staticmethod
    async def reject(user: User, ea_uuid: str, db: AsyncSession) -> EmergencyAccessResponse:
        ea = await _get_ea(ea_uuid, db)
        if ea.grantee_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if ea.status not in (EmergencyAccessStatus.invited, EmergencyAccessStatus.accepted):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot reject at current status",
            )
        ea.status = EmergencyAccessStatus.rejected
        await db.flush()
        await _load_user_relations(ea, db)
        return _to_response(ea)

    @staticmethod
    async def initiate_recovery(
        user: User, ea_uuid: str, db: AsyncSession
    ) -> EmergencyAccessResponse:
        ea = await _get_ea(ea_uuid, db)
        if ea.grantee_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if ea.status != EmergencyAccessStatus.accepted:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Emergency access must be accepted before initiating recovery",
            )
        ea.status = EmergencyAccessStatus.recovery_initiated
        ea.recovery_initiated_at = datetime.now(timezone.utc)
        await db.flush()

        await _load_user_relations(ea, db)
        await NotificationService.create(
            user_id=ea.grantor_id,
            notif_type="emergency_recovery_initiated",
            title="Emergency access requested",
            body=(
                f"{ea.grantee.name} has initiated emergency access recovery. "
                f"You have {ea.wait_time_days} day(s) to reject this request. "
                f"If not rejected, access will be granted automatically."
            ),
            db=db,
        )
        try:
            from services.email_service import send_email
            await send_email(
                to_email=ea.grantor.email,
                template_name="emergency_access_initiated",
                context={
                    "grantee_name": ea.grantee.name,
                    "grantee_email": ea.grantee.email,
                    "wait_time_days": ea.wait_time_days,
                    "initiated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                    "frontend_url": _get_settings().FRONTEND_URL,
                },
                db=db,
                user_uuid=ea.grantor.uuid,
            )
        except Exception:
            pass
        return _to_response(ea)

    @staticmethod
    async def approve_recovery(
        user: User, ea_uuid: str, db: AsyncSession
    ) -> EmergencyAccessResponse:
        ea = await _get_ea(ea_uuid, db)
        if ea.grantor_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if ea.status != EmergencyAccessStatus.recovery_initiated:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No active recovery request to approve",
            )
        ea.status = EmergencyAccessStatus.recovery_approved
        await db.flush()

        await _load_user_relations(ea, db)
        await NotificationService.create(
            user_id=ea.grantee_id,
            notif_type="emergency_recovery_approved",
            title="Emergency access approved",
            body=f"{ea.grantor.name} has approved your emergency access request.",
            db=db,
        )
        try:
            from services.email_service import send_email
            await send_email(
                to_email=ea.grantee.email,
                template_name="emergency_access_approved",
                context={
                    "grantor_name": ea.grantor.name,
                    "access_type": ea.type.value,
                    "frontend_url": _get_settings().FRONTEND_URL,
                },
                db=db,
                user_uuid=ea.grantee.uuid,
            )
        except Exception:
            pass
        return _to_response(ea)

    @staticmethod
    async def reject_recovery(
        user: User, ea_uuid: str, db: AsyncSession
    ) -> EmergencyAccessResponse:
        ea = await _get_ea(ea_uuid, db)
        if ea.grantor_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if ea.status != EmergencyAccessStatus.recovery_initiated:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No active recovery request to reject",
            )
        ea.status = EmergencyAccessStatus.accepted  # Back to accepted state
        ea.recovery_initiated_at = None
        await db.flush()

        await _load_user_relations(ea, db)
        await NotificationService.create(
            user_id=ea.grantee_id,
            notif_type="emergency_recovery_rejected",
            title="Emergency access denied",
            body=f"{ea.grantor.name} has rejected your emergency access recovery request.",
            db=db,
        )
        try:
            from services.email_service import send_email
            await send_email(
                to_email=ea.grantee.email,
                template_name="emergency_access_rejected",
                context={
                    "grantor_name": ea.grantor.name,
                    "frontend_url": _get_settings().FRONTEND_URL,
                },
                db=db,
                user_uuid=ea.grantee.uuid,
            )
        except Exception:
            pass
        return _to_response(ea)

    @staticmethod
    async def delete(user: User, ea_uuid: str, db: AsyncSession) -> None:
        ea = await _get_ea(ea_uuid, db)
        if ea.grantor_id != user.id and ea.grantee_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        await db.delete(ea)
        await db.flush()
