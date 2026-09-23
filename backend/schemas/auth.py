from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Literal

# Server-side floor for PBKDF2 iterations. Below this, an offline attacker
# who obtains the users table can brute-force the login hash too cheaply.
# Rejected outright rather than silently clamped: the client already derived
# masterPasswordHash locally using whatever iteration count it actually used,
# so silently storing a different kdfIterations value here would desync
# future logins (which re-derive using the stored count) from that hash.
MIN_KDF_ITERATIONS = 600_000


class RegisterRequest(BaseModel):
    email: EmailStr
    name: str
    masterPasswordHash: str
    masterPasswordHint: Optional[str] = None
    protectedSymmetricKey: str
    kdfIterations: int = Field(default=MIN_KDF_ITERATIONS, ge=MIN_KDF_ITERATIONS)


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
    totp_code: Optional[str] = None


class UserResponse(BaseModel):
    uuid: str
    email: str
    name: str
    totp_enabled: bool = False
    is_superuser: bool = False


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
