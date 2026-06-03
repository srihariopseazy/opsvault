from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime


class SsoConfigCreate(BaseModel):
    provider_type: str = Field(..., pattern="^(saml|oidc)$")
    is_active: bool = False

    # SAML
    saml_entity_id:    Optional[str] = None
    saml_sso_url:      Optional[str] = None
    saml_slo_url:      Optional[str] = None
    saml_certificate:  Optional[str] = None
    saml_sp_entity_id: Optional[str] = None
    saml_sp_acs_url:   Optional[str] = None

    # OIDC
    oidc_client_id:     Optional[str] = None
    oidc_client_secret: Optional[str] = None
    oidc_discovery_url: Optional[str] = None
    oidc_scopes:        Optional[str] = "openid email profile"
    oidc_redirect_uri:  Optional[str] = None

    attribute_mapping: Optional[Dict[str, str]] = None
    auto_provision:    bool = True


class SsoConfigUpdate(BaseModel):
    provider_type: Optional[str] = None
    is_active:     Optional[bool] = None

    saml_entity_id:    Optional[str] = None
    saml_sso_url:      Optional[str] = None
    saml_slo_url:      Optional[str] = None
    saml_certificate:  Optional[str] = None
    saml_sp_entity_id: Optional[str] = None
    saml_sp_acs_url:   Optional[str] = None

    oidc_client_id:     Optional[str] = None
    oidc_client_secret: Optional[str] = None
    oidc_discovery_url: Optional[str] = None
    oidc_scopes:        Optional[str] = None
    oidc_redirect_uri:  Optional[str] = None

    attribute_mapping: Optional[Dict[str, str]] = None
    auto_provision:    Optional[bool] = None


class SsoConfigResponse(BaseModel):
    uuid:          str
    org_id:        str
    provider_type: str
    is_active:     bool

    saml_entity_id:    Optional[str] = None
    saml_sso_url:      Optional[str] = None
    saml_slo_url:      Optional[str] = None
    saml_certificate:  Optional[str] = None
    saml_sp_entity_id: Optional[str] = None
    saml_sp_acs_url:   Optional[str] = None

    oidc_client_id:     Optional[str] = None
    oidc_discovery_url: Optional[str] = None
    oidc_scopes:        Optional[str] = None
    oidc_redirect_uri:  Optional[str] = None

    attribute_mapping: Optional[Dict[str, str]] = None
    auto_provision:    bool
    created_at:        Optional[datetime] = None
    updated_at:        Optional[datetime] = None

    model_config = {"from_attributes": True}


class SsoLoginResponse(BaseModel):
    redirect_url: str
    state:        str


class SsoCallbackResponse(BaseModel):
    access_token:           str
    refresh_token:          str
    token_type:             str = "bearer"
    user_uuid:              str
    user_email:             str
    user_name:              str
    protected_symmetric_key: str
    kdf_iterations:         int
    is_new_user:            bool = False
