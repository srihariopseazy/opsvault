import base64
import hashlib
import uuid as _uuid
from typing import Optional
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from config import get_settings
from models.smtp_config import SmtpConfig
from schemas.smtp import SmtpConfigUpdate, SmtpConfigResponse, SmtpTestResponse

settings = get_settings()


def _fernet_key() -> bytes:
    """Derive a 32-byte URL-safe base64 Fernet key from SECRET_KEY."""
    digest = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return base64.urlsafe_b64encode(digest)


def _encrypt(plaintext: str) -> str:
    if not plaintext:
        return ""
    from cryptography.fernet import Fernet
    f = Fernet(_fernet_key())
    return f.encrypt(plaintext.encode()).decode()


def _decrypt(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    try:
        from cryptography.fernet import Fernet
        f = Fernet(_fernet_key())
        return f.decrypt(ciphertext.encode()).decode()
    except Exception:
        return ""


def _to_response(cfg: SmtpConfig) -> SmtpConfigResponse:
    return SmtpConfigResponse(
        uuid=cfg.uuid,
        host=cfg.host or "",
        port=cfg.port or 587,
        username=cfg.username or "",
        password="********" if cfg.password else "",
        from_email=cfg.from_email or "",
        from_name=cfg.from_name or "OPSVAULT",
        use_tls=bool(cfg.use_tls),
        use_ssl=bool(cfg.use_ssl),
        enabled=bool(cfg.enabled),
    )


class SmtpConfigService:

    @staticmethod
    def decrypt_password(encrypted: str) -> str:
        return _decrypt(encrypted)

    @staticmethod
    async def get_config(db: AsyncSession) -> SmtpConfig:
        result = await db.execute(select(SmtpConfig))
        cfg = result.scalar_one_or_none()
        if not cfg:
            cfg = SmtpConfig(uuid=str(_uuid.uuid4()))
            db.add(cfg)
            await db.flush()
        return cfg

    @staticmethod
    async def get_config_response(db: AsyncSession) -> SmtpConfigResponse:
        cfg = await SmtpConfigService.get_config(db)
        return _to_response(cfg)

    @staticmethod
    async def update_config(data: SmtpConfigUpdate, db: AsyncSession) -> SmtpConfigResponse:
        cfg = await SmtpConfigService.get_config(db)
        if data.host       is not None: cfg.host       = data.host
        if data.port       is not None: cfg.port       = data.port
        if data.username   is not None: cfg.username   = data.username
        if data.from_email is not None: cfg.from_email = data.from_email
        if data.from_name  is not None: cfg.from_name  = data.from_name
        if data.use_tls    is not None: cfg.use_tls    = 1 if data.use_tls else 0
        if data.use_ssl    is not None: cfg.use_ssl    = 1 if data.use_ssl else 0
        if data.enabled    is not None: cfg.enabled    = 1 if data.enabled else 0
        if data.password   is not None:
            cfg.password = _encrypt(data.password) if data.password else ""
        await db.flush()
        return _to_response(cfg)

    @staticmethod
    async def test_smtp(to_email: str, db: AsyncSession) -> SmtpTestResponse:
        from services.email_service import send_email
        cfg = await SmtpConfigService.get_config(db)
        if not cfg.enabled or not cfg.host:
            return SmtpTestResponse(success=False, message="SMTP is not configured or disabled")
        try:
            await send_email(
                to_email=to_email,
                template_name="smtp_test",
                context={},
                db=db,
                user_uuid=None,
            )
            return SmtpTestResponse(success=True, message=f"Test email sent to {to_email}")
        except Exception as exc:
            return SmtpTestResponse(success=False, message=str(exc))
