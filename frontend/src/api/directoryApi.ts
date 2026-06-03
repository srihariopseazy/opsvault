import client from './client';

export interface DirectoryConfigResponse {
  uuid: string;
  org_id: string;
  sync_type: 'ldap' | 'azure_ad' | 'google_workspace' | 'csv';
  is_active: boolean;
  ldap_host?: string | null;
  ldap_port?: number | null;
  ldap_bind_dn?: string | null;
  ldap_base_dn?: string | null;
  ldap_user_filter?: string | null;
  ldap_use_ssl?: boolean;
  azure_tenant_id?: string | null;
  azure_client_id?: string | null;
  azure_group_filter?: string | null;
  google_domain?: string | null;
  google_admin_email?: string | null;
  sync_interval_hours: number;
  last_synced_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DirectoryConfigCreate {
  sync_type: 'ldap' | 'azure_ad' | 'google_workspace' | 'csv';
  is_active?: boolean;
  ldap_host?: string;
  ldap_port?: number;
  ldap_bind_dn?: string;
  ldap_bind_password?: string;
  ldap_base_dn?: string;
  ldap_user_filter?: string;
  ldap_use_ssl?: boolean;
  azure_tenant_id?: string;
  azure_client_id?: string;
  azure_client_secret?: string;
  azure_group_filter?: string;
  google_domain?: string;
  google_admin_email?: string;
  google_service_account_key?: string;
  sync_interval_hours?: number;
}

export interface DirectorySyncLogResponse {
  uuid: string;
  status: 'success' | 'partial' | 'failed';
  users_added: number;
  users_updated: number;
  users_deactivated: number;
  errors?: unknown;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
}

export interface DirectorySyncUserResponse {
  uuid: string;
  external_id: string;
  email: string;
  display_name?: string | null;
  user_id?: number | null;
  status: 'active' | 'deactivated';
  last_seen_at?: string | null;
  created_at?: string | null;
}

export interface SyncPreviewResponse {
  users_to_add: number;
  users_to_update: number;
  users_to_deactivate: number;
  sample_adds: string[];
  sample_deactivations: string[];
}

export const directoryApi = {
  getConfig: (orgUuid: string) =>
    client.get<DirectoryConfigResponse>(`/directory/config/${orgUuid}`),

  upsertConfig: (orgUuid: string, data: DirectoryConfigCreate) =>
    client.post<DirectoryConfigResponse>(`/directory/config/${orgUuid}`, data),

  deleteConfig: (orgUuid: string) =>
    client.delete(`/directory/config/${orgUuid}`),

  triggerSync: (orgUuid: string) =>
    client.post<DirectorySyncLogResponse>(`/directory/sync/${orgUuid}`, {}),

  previewSync: (orgUuid: string) =>
    client.post<SyncPreviewResponse>(`/directory/sync/${orgUuid}/preview`, {}),

  uploadCsv: (orgUuid: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return client.post<DirectorySyncLogResponse>(`/directory/sync/${orgUuid}/csv`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getLogs: (orgUuid: string) =>
    client.get<DirectorySyncLogResponse[]>(`/directory/sync/${orgUuid}/logs`),

  getUsers: (orgUuid: string) =>
    client.get<DirectorySyncUserResponse[]>(`/directory/users/${orgUuid}`),
};
