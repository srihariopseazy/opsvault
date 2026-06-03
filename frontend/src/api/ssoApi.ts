import client from './client';

export interface SsoConfigResponse {
  uuid: string;
  org_id: string;
  provider_type: 'saml' | 'oidc';
  is_active: boolean;
  saml_entity_id?: string | null;
  saml_sso_url?: string | null;
  saml_slo_url?: string | null;
  saml_certificate?: string | null;
  saml_sp_entity_id?: string | null;
  saml_sp_acs_url?: string | null;
  oidc_client_id?: string | null;
  oidc_discovery_url?: string | null;
  oidc_scopes?: string | null;
  oidc_redirect_uri?: string | null;
  attribute_mapping?: Record<string, string> | null;
  auto_provision: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface SsoConfigCreate {
  provider_type: 'saml' | 'oidc';
  is_active?: boolean;
  saml_entity_id?: string;
  saml_sso_url?: string;
  saml_slo_url?: string;
  saml_certificate?: string;
  saml_sp_entity_id?: string;
  saml_sp_acs_url?: string;
  oidc_client_id?: string;
  oidc_client_secret?: string;
  oidc_discovery_url?: string;
  oidc_scopes?: string;
  oidc_redirect_uri?: string;
  attribute_mapping?: Record<string, string>;
  auto_provision?: boolean;
}

export interface SsoLoginResponse {
  redirect_url: string;
  state: string;
}

export interface SsoCallbackResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user_uuid: string;
  user_email: string;
  user_name: string;
  protected_symmetric_key: string;
  kdf_iterations: number;
  is_new_user: boolean;
}

export const ssoApi = {
  getConfig: (orgUuid: string) =>
    client.get<SsoConfigResponse>(`/sso/config/${orgUuid}`),

  upsertConfig: (orgUuid: string, data: SsoConfigCreate) =>
    client.post<SsoConfigResponse>(`/sso/config/${orgUuid}`, data),

  deleteConfig: (orgUuid: string) =>
    client.delete(`/sso/config/${orgUuid}`),

  initiateLogin: (orgUuid: string) =>
    client.post<SsoLoginResponse>(`/sso/login/${orgUuid}`, {}),

  oidcCallback: (code: string, state: string) =>
    client.get<SsoCallbackResponse>(`/sso/oidc/callback`, { params: { code, state } }),
};
