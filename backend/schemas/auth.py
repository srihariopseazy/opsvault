from pydantic import BaseModel, EmailStr
from typing import Optional


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


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse
    protected_symmetric_key: str
    kdf_iterations: int
