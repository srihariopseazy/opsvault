import client from './client';

export interface PlatformStats {
  total_users: number;
  active_users: number;
  disabled_users: number;
  total_orgs: number;
  total_vault_items: number;
  active_sessions: number;
  total_collections: number;
  total_sends: number;
}

export interface AdminUserOrgInfo {
  org_uuid: string;
  org_name: string;
  role: string;
}

export interface AdminUser {
  uuid: string;
  email: string;
  name: string;
  is_active: boolean;
  is_superuser: boolean;
  totp_enabled: boolean;
  email_verified: boolean;
  created_at: string | null;
  last_login_at: string | null;
  session_count: number;
  org_memberships: AdminUserOrgInfo[];
}

export interface AdminOrg {
  uuid: string;
  name: string;
  owner_email: string;
  member_count: number;
  collection_count: number;
  is_suspended: boolean;
  created_at: string | null;
}

export interface ImpersonateResult {
  temp_token: string;
  expires_in: number;
  target_email: string;
}

export interface PlatformEvent {
  uuid: string;
  event_type: string;
  actor_uuid: string | null;
  actor_email: string | null;
  target_user_uuid: string | null;
  target_user_email: string | null;
  target_org_uuid: string | null;
  target_org_name: string | null;
  ip_address: string | null;
  event_data: Record<string, unknown> | null;
  created_at: string | null;
}

const BASE = '/admin';

export const adminApi = {
  getStats: () =>
    client.get<PlatformStats>(`${BASE}/stats`),

  listUsers: (params?: { search?: string; skip?: number; limit?: number }) =>
    client.get<AdminUser[]>(`${BASE}/users`, { params }),

  getUserDetail: (uuid: string) =>
    client.get<AdminUser>(`${BASE}/users/${uuid}`),

  disableUser: (uuid: string) =>
    client.post<{ message: string }>(`${BASE}/users/${uuid}/disable`),

  enableUser: (uuid: string) =>
    client.post<{ message: string }>(`${BASE}/users/${uuid}/enable`),

  forceLogout: (uuid: string) =>
    client.post<{ message: string }>(`${BASE}/users/${uuid}/force-logout`),

  deleteUser: (uuid: string) =>
    client.delete<{ message: string }>(`${BASE}/users/${uuid}`),

  impersonateUser: (uuid: string) =>
    client.post<ImpersonateResult>(`${BASE}/users/${uuid}/impersonate`),

  listOrgs: (params?: { search?: string; skip?: number; limit?: number }) =>
    client.get<AdminOrg[]>(`${BASE}/orgs`, { params }),

  suspendOrg: (uuid: string) =>
    client.post<{ message: string }>(`${BASE}/orgs/${uuid}/suspend`),

  reactivateOrg: (uuid: string) =>
    client.post<{ message: string }>(`${BASE}/orgs/${uuid}/reactivate`),

  getPlatformEvents: (params?: {
    event_type?: string;
    actor_uuid?: string;
    date_from?: string;
    date_to?: string;
    skip?: number;
    limit?: number;
  }) =>
    client.get<PlatformEvent[]>(`${BASE}/events`, { params }),
};
