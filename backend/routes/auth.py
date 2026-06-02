from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Union

from database import get_db
from dependencies import get_current_active_user
from models.user import User
from schemas.auth import (
    RegisterRequest,
    LoginRequest,
    RefreshRequest,
    ChangeMasterPasswordRequest,
    AuthResponse,
    UserResponse,
    MfaRequiredResponse,
    VerifyMfaRequest,
    TotpStatusResponse,
    TotpSetupResponse,
    TotpEnableRequest,
)
from schemas.common import MessageResponse
from services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
async def register(
    data: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    return await AuthService.register(data, db, request)


@router.post("/login", response_model=Union[AuthResponse, MfaRequiredResponse])
async def login(
    data: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    return await AuthService.login(data, db, request)


@router.post("/verify-mfa", response_model=AuthResponse)
async def verify_mfa(
    data: VerifyMfaRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    return await AuthService.verify_mfa(data, db, request)


@router.post("/logout", response_model=MessageResponse)
async def logout(
    current_user: User = Depends(get_current_active_user),
):
    return MessageResponse(message="Logged out successfully")


@router.post("/refresh", response_model=AuthResponse)
async def refresh_tokens(
    data: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    return await AuthService.refresh_tokens(data.refresh_token, db)


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_active_user),
):
    return UserResponse(
        uuid=current_user.uuid,
        email=current_user.email,
        name=current_user.name,
        totp_enabled=bool(current_user.totp_enabled),
    )


@router.post("/change-master-password", response_model=MessageResponse)
async def change_master_password(
    data: ChangeMasterPasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await AuthService.change_master_password(
        current_user,
        data.newMasterPasswordHash,
        data.newProtectedSymmetricKey,
        db,
    )
    return MessageResponse(message="Master password updated successfully")


# ── TOTP management ───────────────────────────────────────────────────────────

@router.get("/totp/status", response_model=TotpStatusResponse)
async def totp_status(
    current_user: User = Depends(get_current_active_user),
):
    """Return whether the current user has TOTP enabled."""
    return AuthService.get_totp_status(current_user)


@router.get("/totp/setup", response_model=TotpSetupResponse)
async def totp_setup(
    current_user: User = Depends(get_current_active_user),
):
    """Generate a new TOTP secret.  The secret is NOT saved until /totp/enable
    is called with a valid verification code."""
    return AuthService.setup_totp(current_user)


@router.post("/totp/enable", response_model=MessageResponse)
async def totp_enable(
    data: TotpEnableRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify the TOTP code against the provided secret and activate 2FA."""
    await AuthService.enable_totp(current_user, data.secret, data.totp_code, db)
    return MessageResponse(message="Two-factor authentication enabled")


@router.post("/totp/disable", response_model=MessageResponse)
async def totp_disable(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Disable TOTP for the current user."""
    await AuthService.disable_totp(current_user, db)
    return MessageResponse(message="Two-factor authentication disabled")
