from pydantic import BaseModel, EmailStr
from typing import Optional, Literal


class RegisterRequest(BaseModel):
    email: EmailStr
    name: str
    masterPasswordHash: str
    masterPasswordHint: Optional[str] = None
    protectedSymmetricKey: str
    kdfIterations: int = 600000


class LoginRequest(BaseModel):
    email: EmailStr
    masterPasswordHash: str
    # Phase 4: sent by the browser to check against trusted devices
    device_fingerprint: Optional[str] = None


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangeMasterPasswordRequest(BaseModel):
    masterPasswordHash: str
    newMasterPasswordHash: str
    newProtectedSymmetricKey: str


class UserResponse(BaseModel):
    uuid: str
    email: str
    name: str
    totp_enabled: bool = False


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse
    protected_symmetric_key: str
    kdf_iterations: int


# ── Phase 4: MFA schemas ─────────────────────────────────────────────────────

class MfaRequiredResponse(BaseModel):
    """Returned by /auth/login when the user has TOTP enabled and the device
    is not trusted.  The client must follow up with /auth/verify-mfa."""
    mfa_required: Literal[True] = True
    mfa_token: str


class VerifyMfaRequest(BaseModel):
    mfa_token: str
    totp_code: str
    trust_device: bool = False
    device_fingerprint: Optional[str] = None
    device_name: Optional[str] = None


class TotpStatusResponse(BaseModel):
    totp_enabled: bool


class TotpSetupResponse(BaseModel):
    secret: str
    otpauth_url: str


class TotpEnableRequest(BaseModel):
    secret: str
    totp_code: str
