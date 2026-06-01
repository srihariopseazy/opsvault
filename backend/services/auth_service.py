import uuid
import hashlib
import hmac
from datetime import datetime, timezone
from fastapi import HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.user import User
from models.session import Session
from schemas.auth import RegisterRequest, LoginRequest, AuthResponse, UserResponse
from services.token_service import TokenService


class AuthService:
    @staticmethod
    def _hash_password(master_password_hash: str) -> str:
        # Store a server-side hash of the already-derived client hash
        # to avoid storing the raw value directly
        return hashlib.sha256(master_password_hash.encode()).hexdigest()

    @staticmethod
    def _verify_password(master_password_hash: str, stored_hash: str) -> bool:
        expected = hashlib.sha256(master_password_hash.encode()).hexdigest()
        return hmac.compare_digest(expected, stored_hash)

    @staticmethod
    async def register(
        data: RegisterRequest,
        db: AsyncSession,
        request: Request,
    ) -> AuthResponse:
        result = await db.execute(select(User).where(User.email == data.email.lower()))
        existing = result.scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists",
            )

        user_uuid = str(uuid.uuid4())
        hashed = AuthService._hash_password(data.masterPasswordHash)

        user = User(
            uuid=user_uuid,
            email=data.email.lower().strip(),
            name=data.name,
            master_password_hash=hashed,
            protected_symmetric_key=data.protectedSymmetricKey,
            kdf_iterations=data.kdfIterations,
            master_password_hint=data.masterPasswordHint,
        )
        db.add(user)
        await db.flush()

        jti = str(uuid.uuid4())
        refresh_jti = str(uuid.uuid4())

        access_token = TokenService.create_access_token(user_uuid, jti)
        refresh_token = TokenService.create_refresh_token(user_uuid, refresh_jti)

        session = Session(
            uuid=str(uuid.uuid4()),
            user_id=user.id,
            jti=jti,
            device_name=request.headers.get("X-Device-Name"),
            device_type=request.headers.get("X-Device-Type"),
            ip_address=request.client.host if request.client else None,
            created_at=datetime.now(timezone.utc),
            expires_at=TokenService.get_refresh_token_expiry(),
            last_used_at=datetime.now(timezone.utc),
        )
        db.add(session)
        await db.flush()

        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user=UserResponse(
                uuid=user.uuid,
                email=user.email,
                name=user.name,
            ),
            protected_symmetric_key=user.protected_symmetric_key,
            kdf_iterations=user.kdf_iterations,
        )

    @staticmethod
    async def login(
        data: LoginRequest,
        db: AsyncSession,
        request: Request,
    ) -> AuthResponse:
        result = await db.execute(select(User).where(User.email == data.email.lower()))
        user = result.scalar_one_or_none()

        if not user or not AuthService._verify_password(data.masterPasswordHash, user.master_password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or master password",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled",
            )

        jti = str(uuid.uuid4())
        access_token = TokenService.create_access_token(user.uuid, jti)
        refresh_token = TokenService.create_refresh_token(user.uuid, str(uuid.uuid4()))

        session = Session(
            uuid=str(uuid.uuid4()),
            user_id=user.id,
            jti=jti,
            device_name=request.headers.get("X-Device-Name"),
            device_type=request.headers.get("X-Device-Type"),
            ip_address=request.client.host if request.client else None,
            created_at=datetime.now(timezone.utc),
            expires_at=TokenService.get_refresh_token_expiry(),
            last_used_at=datetime.now(timezone.utc),
        )
        db.add(session)

        user.last_login_at = datetime.now(timezone.utc)
        await db.flush()

        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user=UserResponse(
                uuid=user.uuid,
                email=user.email,
                name=user.name,
            ),
            protected_symmetric_key=user.protected_symmetric_key,
            kdf_iterations=user.kdf_iterations,
        )

    @staticmethod
    async def refresh_tokens(
        refresh_token: str,
        db: AsyncSession,
    ) -> AuthResponse:
        payload = TokenService.decode_refresh_token(refresh_token)
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token",
            )

        user_uuid = payload.get("sub")
        result = await db.execute(select(User).where(User.uuid == user_uuid))
        user = result.scalar_one_or_none()

        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
            )

        new_jti = str(uuid.uuid4())
        new_access_token = TokenService.create_access_token(user.uuid, new_jti)
        new_refresh_token = TokenService.create_refresh_token(user.uuid, str(uuid.uuid4()))

        return AuthResponse(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            token_type="bearer",
            user=UserResponse(
                uuid=user.uuid,
                email=user.email,
                name=user.name,
            ),
            protected_symmetric_key=user.protected_symmetric_key,
            kdf_iterations=user.kdf_iterations,
        )

    @staticmethod
    async def change_master_password(
        user: User,
        new_master_password_hash: str,
        new_protected_symmetric_key: str,
        db: AsyncSession,
    ) -> None:
        user.master_password_hash = AuthService._hash_password(new_master_password_hash)
        user.protected_symmetric_key = new_protected_symmetric_key
        await db.flush()
