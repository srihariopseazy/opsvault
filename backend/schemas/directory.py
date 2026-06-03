from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime


class DirectoryConfigCreate(BaseModel):
    sync_type: str = Field(..., pattern="^(ldap|azure_ad|google_workspace|csv)$")
    is_active: bool = False

    ldap_host:           Optional[str] = None
    ldap_port:           Optional[int] = 389
    ldap_bind_dn:        Optional[str] = None
    ldap_bind_password:  Optional[str] = None
    ldap_base_dn:        Optional[str] = None
    ldap_user_filter:    Optional[str] = "(objectClass=person)"
    ldap_use_ssl:        bool = False

    azure_tenant_id:     Optional[str] = None
    azure_client_id:     Optional[str] = None
    azure_client_secret: Optional[str] = None
    azure_group_filter:  Optional[str] = None

    google_domain:              Optional[str] = None
    google_admin_email:         Optional[str] = None
    google_service_account_key: Optional[str] = None

    sync_interval_hours: int = 24


class DirectoryConfigUpdate(BaseModel):
    sync_type: Optional[str] = None
    is_active: Optional[bool] = None

    ldap_host:           Optional[str] = None
    ldap_port:           Optional[int] = None
    ldap_bind_dn:        Optional[str] = None
    ldap_bind_password:  Optional[str] = None
    ldap_base_dn:        Optional[str] = None
    ldap_user_filter:    Optional[str] = None
    ldap_use_ssl:        Optional[bool] = None

    azure_tenant_id:     Optional[str] = None
    azure_client_id:     Optional[str] = None
    azure_client_secret: Optional[str] = None
    azure_group_filter:  Optional[str] = None

    google_domain:              Optional[str] = None
    google_admin_email:         Optional[str] = None
    google_service_account_key: Optional[str] = None

    sync_interval_hours: Optional[int] = None


class DirectoryConfigResponse(BaseModel):
    uuid:      str
    org_id:    str
    sync_type: str
    is_active: bool

    ldap_host:        Optional[str] = None
    ldap_port:        Optional[int] = None
    ldap_bind_dn:     Optional[str] = None
    ldap_base_dn:     Optional[str] = None
    ldap_user_filter: Optional[str] = None
    ldap_use_ssl:     bool = False

    azure_tenant_id:    Optional[str] = None
    azure_client_id:    Optional[str] = None
    azure_group_filter: Optional[str] = None

    google_domain:      Optional[str] = None
    google_admin_email: Optional[str] = None

    sync_interval_hours: int
    last_synced_at:      Optional[datetime] = None
    created_at:          Optional[datetime] = None
    updated_at:          Optional[datetime] = None

    model_config = {"from_attributes": True}


class DirectorySyncLogResponse(BaseModel):
    uuid:              str
    status:            str
    users_added:       int
    users_updated:     int
    users_deactivated: int
    errors:            Optional[Any] = None
    started_at:        Optional[datetime] = None
    completed_at:      Optional[datetime] = None
    created_at:        Optional[datetime] = None

    model_config = {"from_attributes": True}


class DirectorySyncUserResponse(BaseModel):
    uuid:         str
    external_id:  str
    email:        str
    display_name: Optional[str] = None
    user_id:      Optional[int] = None
    status:       str
    last_seen_at: Optional[datetime] = None
    created_at:   Optional[datetime] = None

    model_config = {"from_attributes": True}


class SyncPreviewResponse(BaseModel):
    users_to_add:        int
    users_to_update:     int
    users_to_deactivate: int
    sample_adds:         List[str] = []
    sample_deactivations: List[str] = []
