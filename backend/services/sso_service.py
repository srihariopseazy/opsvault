"""SSO service — SAML 2.0 and OIDC login flows."""
import uuid
import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from models.sso import SsoConfig, SsoSession, SsoProviderType
from models.organization import Organization
from schemas.sso import SsoConfigCreate, SsoConfigUpdate, SsoConfigResponse, SsoLoginResponse, SsoCallbackResponse

logger = logging.getLogger("opsvault.sso")

_SSO_SESSION_TTL_MINUTES = 10


# ── SSO Config CRUD ───────────────────────────────────────────────────────────

async def get_sso_config(org_uuid: str, db: AsyncSession) -> Optional[SsoConfig]:
    result = await db.execute(select(SsoConfig).where(SsoConfig.org_id == org_uuid))
    return result.scalar_one_or_none()


async def create_or_update_sso_config(
    org_uuid: str,
    data: SsoConfigCreate | SsoConfigUpdate,
    db: AsyncSession,
) -> SsoConfig:
    existing = await get_sso_config(org_uuid, db)

    if existing:
        for field, value in data.model_dump(exclude_unset=True).items():
            if field == "is_active":
                setattr(existing, field, 1 if value else 0)
            elif field == "auto_provision":
                setattr(existing, "auto_provision", 1 if value else 0)
            elif field == "ldap_use_ssl":
                setattr(existing, field, 1 if value else 0)
            elif value is not None:
                setattr(existing, field, value)
        existing.updated_at = datetime.now(timezone.utc)
        return existing

    cfg = SsoConfig(
        uuid=str(uuid.uuid4()),
        org_id=org_uuid,
        provider_type=data.provider_type if hasattr(data, "provider_type") and data.provider_type else "oidc",
        is_active=1 if getattr(data, "is_active", False) else 0,
        saml_entity_id=getattr(data, "saml_entity_id", None),
        saml_sso_url=getattr(data, "saml_sso_url", None),
        saml_slo_url=getattr(data, "saml_slo_url", None),
        saml_certificate=getattr(data, "saml_certificate", None),
        saml_sp_entity_id=getattr(data, "saml_sp_entity_id", None),
        saml_sp_acs_url=getattr(data, "saml_sp_acs_url", None),
        oidc_client_id=getattr(data, "oidc_client_id", None),
        oidc_client_secret=getattr(data, "oidc_client_secret", None),
        oidc_discovery_url=getattr(data, "oidc_discovery_url", None),
        oidc_scopes=getattr(data, "oidc_scopes", "openid email profile"),
        oidc_redirect_uri=getattr(data, "oidc_redirect_uri", None),
        attribute_mapping=getattr(data, "attribute_mapping", None),
        auto_provision=1 if getattr(data, "auto_provision", True) else 0,
    )
    db.add(cfg)
    await db.flush()
    return cfg


async def delete_sso_config(org_uuid: str, db: AsyncSession) -> None:
    cfg = await get_sso_config(org_uuid, db)
    if not cfg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SSO config not found")
    await db.delete(cfg)


# ── SAML flow ─────────────────────────────────────────────────────────────────

async def get_saml_login_url(org_uuid: str, db: AsyncSession) -> SsoLoginResponse:
    cfg = await get_sso_config(org_uuid, db)
    if not cfg or not cfg.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SSO not configured for this organization")
    if cfg.provider_type != SsoProviderType.saml:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization uses OIDC, not SAML")
    if not cfg.saml_sso_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SAML SSO URL not configured")

    state = secrets.token_urlsafe(32)
    session = SsoSession(
        uuid=str(uuid.uuid4()),
        org_id=org_uuid,
        state=state,
        provider_type=SsoProviderType.saml,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=_SSO_SESSION_TTL_MINUTES),
    )
    db.add(session)
    await db.flush()

    try:
        from onelogin.saml2.auth import OneLogin_Saml2_Auth
        from onelogin.saml2.settings import OneLogin_Saml2_Settings

        sp_entity_id = cfg.saml_sp_entity_id or "opsvault"
        acs_url = cfg.saml_sp_acs_url or ""

        saml_settings = {
            "sp": {
                "entityId": sp_entity_id,
                "assertionConsumerService": {"url": acs_url, "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"},
            },
            "idp": {
                "entityId": cfg.saml_entity_id or "",
                "singleSignOnService": {"url": cfg.saml_sso_url, "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"},
                "x509cert": (cfg.saml_certificate or "").replace("-----BEGIN CERTIFICATE-----", "").replace("-----END CERTIFICATE-----", "").strip(),
            },
        }
        settings_obj = OneLogin_Saml2_Settings(settings=saml_settings, sp_validation_only=True)
        auth_url = settings_obj.get_idp_data()["singleSignOnService"]["url"]
        params = urlencode({"SAMLRequest": state, "RelayState": state})
        redirect_url = f"{auth_url}?{params}"
    except ImportError:
        # python3-saml not installed — return a placeholder
        params = urlencode({"SAMLRequest": state, "RelayState": org_uuid})
        redirect_url = f"{cfg.saml_sso_url}?{params}"

    return SsoLoginResponse(redirect_url=redirect_url, state=state)


async def process_saml_response(
    saml_response: str,
    relay_state: Optional[str],
    db: AsyncSession,
) -> SsoCallbackResponse:
    if not relay_state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing relay state")

    result = await db.execute(
        select(SsoSession).where(
            and_(
                SsoSession.state == relay_state,
                SsoSession.provider_type == SsoProviderType.saml,
                SsoSession.expires_at > datetime.now(timezone.utc),
            )
        )
    )
    session_obj = result.scalar_one_or_none()
    if not session_obj:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired SSO session")

    org_uuid = session_obj.org_id
    cfg = await get_sso_config(org_uuid, db)
    if not cfg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SSO config not found")

    try:
        from onelogin.saml2.response import OneLogin_Saml2_Response
        from onelogin.saml2.settings import OneLogin_Saml2_Settings

        saml_settings = {
            "sp": {
                "entityId": cfg.saml_sp_entity_id or "opsvault",
                "assertionConsumerService": {"url": cfg.saml_sp_acs_url or "", "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"},
            },
            "idp": {
                "entityId": cfg.saml_entity_id or "",
                "singleSignOnService": {"url": cfg.saml_sso_url or "", "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"},
                "x509cert": (cfg.saml_certificate or "").replace("-----BEGIN CERTIFICATE-----", "").replace("-----END CERTIFICATE-----", "").strip(),
            },
        }
        settings_obj = OneLogin_Saml2_Settings(settings=saml_settings)
        response = OneLogin_Saml2_Response(settings_obj, saml_response)
        response.is_valid({"https": "on", "http_host": "opsvault", "script_name": "/sso/saml/callback"})
        attrs = response.get_attributes()
        mapping = cfg.attribute_mapping or {}
        email_attr = mapping.get("email", "email")
        name_attr = mapping.get("name", "displayName")
        email = (attrs.get(email_attr) or attrs.get("email") or [None])[0]
        name = (attrs.get(name_attr) or attrs.get("displayName") or [""])[0]
    except ImportError:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="SAML library not installed on server")

    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email not found in SAML response")

    await db.delete(session_obj)
    return await login_or_create_sso_user(db, org_uuid, email, name or email.split("@")[0])


# ── OIDC flow ─────────────────────────────────────────────────────────────────

async def _fetch_oidc_discovery(discovery_url: str) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(discovery_url)
        r.raise_for_status()
        return r.json()


async def get_oidc_login_url(org_uuid: str, db: AsyncSession) -> SsoLoginResponse:
    cfg = await get_sso_config(org_uuid, db)
    if not cfg or not cfg.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SSO not configured for this organization")
    if cfg.provider_type != SsoProviderType.oidc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization uses SAML, not OIDC")
    if not cfg.oidc_discovery_url or not cfg.oidc_client_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OIDC not fully configured")

    state = secrets.token_urlsafe(32)
    session_obj = SsoSession(
        uuid=str(uuid.uuid4()),
        org_id=org_uuid,
        state=state,
        provider_type=SsoProviderType.oidc,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=_SSO_SESSION_TTL_MINUTES),
    )
    db.add(session_obj)
    await db.flush()

    discovery = await _fetch_oidc_discovery(cfg.oidc_discovery_url)
    auth_endpoint = discovery.get("authorization_endpoint", "")

    params = {
        "response_type": "code",
        "client_id": cfg.oidc_client_id,
        "scope": cfg.oidc_scopes or "openid email profile",
        "redirect_uri": cfg.oidc_redirect_uri or "",
        "state": state,
        "nonce": secrets.token_urlsafe(16),
    }
    redirect_url = f"{auth_endpoint}?{urlencode(params)}"
    return SsoLoginResponse(redirect_url=redirect_url, state=state)


async def process_oidc_callback(
    code: str,
    state: str,
    db: AsyncSession,
) -> SsoCallbackResponse:
    result = await db.execute(
        select(SsoSession).where(
            and_(
                SsoSession.state == state,
                SsoSession.provider_type == SsoProviderType.oidc,
                SsoSession.expires_at > datetime.now(timezone.utc),
            )
        )
    )
    session_obj = result.scalar_one_or_none()
    if not session_obj:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired SSO session state")

    org_uuid = session_obj.org_id
    cfg = await get_sso_config(org_uuid, db)
    if not cfg or not cfg.oidc_discovery_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SSO config not found")

    discovery = await _fetch_oidc_discovery(cfg.oidc_discovery_url)
    token_endpoint = discovery.get("token_endpoint", "")
    userinfo_endpoint = discovery.get("userinfo_endpoint", "")

    async with httpx.AsyncClient(timeout=15.0) as client:
        token_resp = await client.post(token_endpoint, data={
            "grant_type":    "authorization_code",
            "code":          code,
            "redirect_uri":  cfg.oidc_redirect_uri or "",
            "client_id":     cfg.oidc_client_id or "",
            "client_secret": cfg.oidc_client_secret or "",
        })
        if token_resp.status_code != 200:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Failed to exchange code for token")
        tokens = token_resp.json()
        access_token = tokens.get("access_token", "")

        userinfo_resp = await client.get(
            userinfo_endpoint,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Failed to fetch user info")
        userinfo = userinfo_resp.json()

    mapping = cfg.attribute_mapping or {}
    email_key = mapping.get("email", "email")
    name_key  = mapping.get("name", "name")

    email = userinfo.get(email_key) or userinfo.get("email")
    name  = userinfo.get(name_key) or userinfo.get("name") or (email.split("@")[0] if email else "")

    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email not returned by OIDC provider")

    await db.delete(session_obj)
    return await login_or_create_sso_user(db, org_uuid, email, name)


# ── Initiate (detects provider type) ─────────────────────────────────────────

async def initiate_sso_login(org_uuid: str, db: AsyncSession) -> SsoLoginResponse:
    cfg = await get_sso_config(org_uuid, db)
    if not cfg or not cfg.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SSO not configured or inactive for this organization")

    if cfg.provider_type == SsoProviderType.oidc:
        return await get_oidc_login_url(org_uuid, db)
    return await get_saml_login_url(org_uuid, db)


# ── Re-export login_or_create_sso_user from auth_service ─────────────────────

async def login_or_create_sso_user(
    db: AsyncSession,
    org_id: str,
    email: str,
    name: str,
) -> "SsoCallbackResponse":
    from services.auth_service import login_or_create_sso_user as _impl
    return await _impl(db, org_id, email, name)
