from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
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


@router.post("/login", response_model=AuthResponse)
async def login(
    data: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    return await AuthService.login(data, db, request)


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
