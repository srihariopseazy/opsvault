import client from './client';

// ── Request types ─────────────────────────────────────────────────────────────

export interface OrgCreatePayload { name: string }
export interface OrgRenamePayload { name: string }
export interface InvitePayload    { email: string; role?: string }
export interface ChangeRolePayload { role: string }

// ── Response types ────────────────────────────────────────────────────────────

export interface OrgSummary {
  uuid: string;
  name: string;
  member_count: number;
  my_role: string;
  created_at: string | null;
}

export interface OrgMemberInfo {
  uuid: string;
  user_uuid: string;
  user_name: string;
  user_email: string;
  role: string;
  status: string;
  invited_at: string | null;
  accepted_at: string | null;
}

export interface CollectionSummary {
  uuid: string;
  name: string;
  item_count: number;
  member_count: number;
}

export interface OrgDetail {
  uuid: string;
  name: string;
  my_role: string;
  members: OrgMemberInfo[];
  collections: CollectionSummary[];
  created_at: string | null;
}

export interface PendingInvite {
  uuid: string;
  org_uuid: string;
  org_name: string;
  role: string;
  invited_at: string | null;
}

// ── API client ────────────────────────────────────────────────────────────────

function toError(ctx: string, err: unknown): Error {
  const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = e?.response?.data?.detail;
  const msg = typeof detail === 'string' ? detail : e?.message ?? 'Unknown error';
  console.error(`[orgsApi] ${ctx}:`, err);
  return new Error(msg);
}

export const orgsApi = {
  async listOrgs() {
    try { return await client.get<OrgSummary[]>('/organizations'); }
    catch (e) { throw toError('listOrgs', e); }
  },

  async createOrg(payload: OrgCreatePayload) {
    try { return await client.post<OrgSummary>('/organizations', payload); }
    catch (e) { throw toError('createOrg', e); }
  },

  async getOrg(uuid: string) {
    try { return await client.get<OrgDetail>(`/organizations/${uuid}`); }
    catch (e) { throw toError('getOrg', e); }
  },

  async renameOrg(uuid: string, payload: OrgRenamePayload) {
    try { return await client.put<{ message: string }>(`/organizations/${uuid}`, payload); }
    catch (e) { throw toError('renameOrg', e); }
  },

  async deleteOrg(uuid: string) {
    try { return await client.delete<{ message: string }>(`/organizations/${uuid}`); }
    catch (e) { throw toError('deleteOrg', e); }
  },

  async inviteMember(orgUuid: string, payload: InvitePayload) {
    try { return await client.post<OrgMemberInfo>(`/organizations/${orgUuid}/invite`, payload); }
    catch (e) { throw toError('inviteMember', e); }
  },

  async changeMemberRole(orgUuid: string, memberUuid: string, payload: ChangeRolePayload) {
    try { return await client.post<{ message: string }>(`/organizations/${orgUuid}/members/${memberUuid}/role`, payload); }
    catch (e) { throw toError('changeMemberRole', e); }
  },

  async removeMember(orgUuid: string, memberUuid: string) {
    try { return await client.delete<{ message: string }>(`/organizations/${orgUuid}/members/${memberUuid}`); }
    catch (e) { throw toError('removeMember', e); }
  },

  async listPendingInvites() {
    try { return await client.get<PendingInvite[]>('/org-invites/pending'); }
    catch (e) { throw toError('listPendingInvites', e); }
  },

  async acceptInvite(inviteUuid: string) {
    try { return await client.post<{ message: string }>(`/org-invites/${inviteUuid}/accept`); }
    catch (e) { throw toError('acceptInvite', e); }
  },

  async rejectInvite(inviteUuid: string) {
    try { return await client.post<{ message: string }>(`/org-invites/${inviteUuid}/reject`); }
    catch (e) { throw toError('rejectInvite', e); }
  },
};
