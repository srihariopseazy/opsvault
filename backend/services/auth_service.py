import uuid
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Optional, Union
from fastapi import HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
import jwt as pyjwt
import pyotp

from config import get_settings
from models.user import User
from models.session import Session
from models.trusted_device import TrustedDevice
from models.login_event import LoginEvent, LoginStatus
from schemas.auth import (
    RegisterRequest,
    LoginRequest,
    AuthResponse,
    UserResponse,
    MfaRequiredResponse,
    VerifyMfaRequest,
    TotpSetupResponse,
    TotpStatusResponse,
)
from services.token_service import TokenService

settings = get_settings()

# Short-lived MFA challenge token: 5 minutes
_MFA_TOKEN_EXPIRE_MINUTES = 5


# ── Internal helpers ─────────────────────────────────────────────────────────

def _hash_password(master_password_hash: str) -> str:
    return hashlib.sha256(master_password_hash.encode()).hexdigest()


def _verify_password(master_password_hash: str, stored_hash: str) -> bool:
    expected = hashlib.sha256(master_password_hash.encode()).hexdigest()
    return hmac.compare_digest(expected, stored_hash)


def _create_mfa_token(user_uuid: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=_MFA_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_uuid,
        "type": "mfa",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return pyjwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def _decode_mfa_token(token: str) -> Optional[dict]:
    try:
        payload = pyjwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "mfa":
            return None
        return payload
    except pyjwt.InvalidTokenError:
        return None


def _build_auth_response(user: User, access_token: str, refresh_token: str) -> AuthResponse:
    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserResponse(
            uuid=user.uuid,
            email=user.email,
            name=user.name,
            totp_enabled=bool(user.totp_enabled),
            is_superuser=bool(user.is_superuser),
        ),
        protected_symmetric_key=user.protected_symmetric_key,
        kdf_iterations=user.kdf_iterations,
    )


async def _create_session(
    user: User,
    request: Request,
    db: AsyncSession,
) -> tuple[str, str]:
    """Create a new session row and return (access_token, refresh_token)."""
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
    await db.flush()
    return access_token, refresh_token


async def _log_event(
    user_id: Optional[int],
    request: Request,
    login_status: LoginStatus,
    db: AsyncSession,
    device_name: Optional[str] = None,
) -> None:
    event = LoginEvent(
        uuid=str(uuid.uuid4()),
        user_id=user_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("User-Agent"),
        device_name=device_name or request.headers.get("X-Device-Name"),
        status=login_status,
    )
    db.add(event)
    await db.flush()


async def _is_device_trusted(
    user: User,
    fingerprint: Optional[str],
    db: AsyncSession,
) -> bool:
    if not fingerprint:
        return False
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(TrustedDevice).where(
            and_(
                TrustedDevice.user_id == user.id,
                TrustedDevice.device_fingerprint == fingerprint,
                TrustedDevice.expires_at > now,
            )
        )
    )
    return result.scalar_one_or_none() is not None


# ── AuthService ──────────────────────────────────────────────────────────────

class AuthService:
    # Keep legacy static methods for tests/compatibility
    @staticmethod
    def _hash_password(master_password_hash: str) -> str:
        return _hash_password(master_password_hash)

    @staticmethod
    def _verify_password(master_password_hash: str, stored_hash: str) -> bool:
        return _verify_password(master_password_hash, stored_hash)

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
        hashed = _hash_password(data.masterPasswordHash)

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

        access_token, refresh_token = await _create_session(user, request, db)
        await _log_event(user.id, request, LoginStatus.success, db)
        return _build_auth_response(user, access_token, refresh_token)

    @staticmethod
    async def login(
        data: LoginRequest,
        db: AsyncSession,
        request: Request,
    ) -> Union[AuthResponse, MfaRequiredResponse]:
        result = await db.execute(select(User).where(User.email == data.email.lower()))
        user = result.scalar_one_or_none()

        if not user or not _verify_password(data.masterPasswordHash, user.master_password_hash):
            # Log failure only when we can identify the user
            if user:
                await _log_event(user.id, request, LoginStatus.failed, db)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or master password",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled",
            )

        # ── TOTP check ───────────────────────────────────────────────────────
        if user.totp_enabled and user.totp_secret:
            # If device is already trusted, skip TOTP prompt entirely
            if await _is_device_trusted(user, data.device_fingerprint, db):
                user.last_login_at = datetime.now(timezone.utc)
                access_token, refresh_token = await _create_session(user, request, db)
                await _log_event(user.id, request, LoginStatus.success, db)
                return _build_auth_response(user, access_token, refresh_token)

            # Not trusted — issue a short-lived MFA challenge token
            mfa_token = _create_mfa_token(user.uuid)
            return MfaRequiredResponse(mfa_token=mfa_token)

        # ── No TOTP — issue full JWT immediately ─────────────────────────────
        user.last_login_at = datetime.now(timezone.utc)
        access_token, refresh_token = await _create_session(user, request, db)
        await _log_event(user.id, request, LoginStatus.success, db)
        return _build_auth_response(user, access_token, refresh_token)

    @staticmethod
    async def verify_mfa(
        data: VerifyMfaRequest,
        db: AsyncSession,
        request: Request,
    ) -> AuthResponse:
        # Decode and validate the MFA challenge token
        payload = _decode_mfa_token(data.mfa_token)
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired MFA token",
            )

        user_uuid = payload.get("sub")
        result = await db.execute(select(User).where(User.uuid == user_uuid))
        user = result.scalar_one_or_none()

        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
            )

        if not user.totp_secret:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="TOTP not configured for this account",
            )

        # Verify the 6-digit TOTP code (allow ±1 window = ±30 s clock skew)
        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(data.totp_code.strip(), valid_window=1):
            await _log_event(user.id, request, LoginStatus.failed, db,
                             device_name=data.device_name)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid TOTP code",
            )

        # ── Optionally trust this device ─────────────────────────────────────
        if data.trust_device and data.device_fingerprint:
            expires_at = datetime.now(timezone.utc) + timedelta(days=30)
            device = TrustedDevice(
                uuid=str(uuid.uuid4()),
                user_id=user.id,
                device_fingerprint=data.device_fingerprint,
                device_name=data.device_name or request.headers.get("X-Device-Name"),
                expires_at=expires_at,
            )
            db.add(device)

        user.last_login_at = datetime.now(timezone.utc)
        access_token, refresh_token = await _create_session(user, request, db)
        await _log_event(user.id, request, LoginStatus.success, db,
                         device_name=data.device_name)
        return _build_auth_response(user, access_token, refresh_token)

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

        return _build_auth_response(user, new_access_token, new_refresh_token)

    @staticmethod
    async def change_master_password(
        user: User,
        new_master_password_hash: str,
        new_protected_symmetric_key: str,
        db: AsyncSession,
    ) -> None:
        user.master_password_hash = _hash_password(new_master_password_hash)
        user.protected_symmetric_key = new_protected_symmetric_key
        await db.flush()

    # ── TOTP management ──────────────────────────────────────────────────────

    @staticmethod
    def get_totp_status(user: User) -> TotpStatusResponse:
        return TotpStatusResponse(totp_enabled=bool(user.totp_enabled))

    @staticmethod
    def setup_totp(user: User) -> TotpSetupResponse:
        """Generate a fresh TOTP secret without saving it yet.
        The frontend shows the secret + QR, then calls enable_totp to confirm."""
        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        otpauth_url = totp.provisioning_uri(name=user.email, issuer_name="OPSVAULT")
        return TotpSetupResponse(secret=secret, otpauth_url=otpauth_url)

    @staticmethod
    async def enable_totp(
        user: User,
        secret: str,
        totp_code: str,
        db: AsyncSession,
    ) -> None:
        totp = pyotp.TOTP(secret)
        if not totp.verify(totp_code.strip(), valid_window=1):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid TOTP code — please try again",
            )
        user.totp_secret = secret
        user.totp_enabled = 1
        await db.flush()

    @staticmethod
    async def disable_totp(user: User, db: AsyncSession) -> None:
        user.totp_secret = None
        user.totp_enabled = 0
        await db.flush()
