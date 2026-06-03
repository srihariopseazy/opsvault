import client from './client';

export interface ApiKeyResponse {
  uuid: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  is_active: boolean;
  created_at: string | null;
}

export interface ApiKeyCreatedResponse extends ApiKeyResponse {
  full_key: string;
}

export interface ApiKeyCreate {
  name: string;
  scopes: string[];
  expires_at?: string | null;
}

export interface OrgApiKeyResponse {
  uuid: string;
  org_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  is_active: boolean;
  created_at: string | null;
  created_by_email?: string | null;
}

export interface OrgApiKeyCreatedResponse extends OrgApiKeyResponse {
  full_key: string;
}

export interface OrgApiKeyCreate {
  name: string;
  scopes: string[];
  expires_at?: string | null;
}

export interface AdminOrgApiKey {
  uuid: string;
  org_id: string;
  org_name: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  created_at: string | null;
  created_by_email: string;
}

export const apiKeysApi = {
  // Personal keys
  listKeys: () =>
    client.get<ApiKeyResponse[]>('/api-keys'),

  createKey: (data: ApiKeyCreate) =>
    client.post<ApiKeyCreatedResponse>('/api-keys', data),

  revokeKey: (uuid: string) =>
    client.delete(`/api-keys/${uuid}`),

  rotateKey: (uuid: string) =>
    client.post<ApiKeyCreatedResponse>(`/api-keys/${uuid}/rotate`, {}),

  // Org keys
  listOrgKeys: (orgUuid: string) =>
    client.get<OrgApiKeyResponse[]>(`/org-api-keys/${orgUuid}`),

  createOrgKey: (orgUuid: string, data: OrgApiKeyCreate) =>
    client.post<OrgApiKeyCreatedResponse>(`/org-api-keys/${orgUuid}`, data),

  revokeOrgKey: (orgUuid: string, keyUuid: string) =>
    client.delete(`/org-api-keys/${orgUuid}/${keyUuid}`),

  rotateOrgKey: (orgUuid: string, keyUuid: string) =>
    client.post<OrgApiKeyCreatedResponse>(`/org-api-keys/${orgUuid}/${keyUuid}/rotate`, {}),

  // Admin
  adminListAllOrgKeys: () =>
    client.get<AdminOrgApiKey[]>('/org-api-keys/admin/all'),
};
