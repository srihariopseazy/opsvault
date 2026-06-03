import client from './client';

export interface EmergencyAccessInvitePayload {
  email: string;
  type?: string;
  wait_time_days?: number;
}

export interface EmergencyAccessInfo {
  uuid: string;
  type: string;
  status: string;
  wait_time_days: number;
  recovery_initiated_at: string | null;
  created_at: string | null;
  grantor_uuid: string | null;
  grantor_name: string | null;
  grantor_email: string | null;
  grantee_uuid: string | null;
  grantee_name: string | null;
  grantee_email: string | null;
}

function toError(ctx: string, err: unknown): Error {
  const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = e?.response?.data?.detail;
  const msg = typeof detail === 'string' ? detail : e?.message ?? 'Unknown error';
  console.error(`[emergencyApi] ${ctx}:`, err);
  return new Error(msg);
}

export const emergencyApi = {
  async invite(payload: EmergencyAccessInvitePayload) {
    try { return await client.post<EmergencyAccessInfo>('/emergency-access/invite', payload); }
    catch (e) { throw toError('invite', e); }
  },
  async list() {
    try { return await client.get<EmergencyAccessInfo[]>('/emergency-access'); }
    catch (e) { throw toError('list', e); }
  },
  async accept(uuid: string) {
    try { return await client.post<EmergencyAccessInfo>(`/emergency-access/${uuid}/accept`); }
    catch (e) { throw toError('accept', e); }
  },
  async reject(uuid: string) {
    try { return await client.post<EmergencyAccessInfo>(`/emergency-access/${uuid}/reject`); }
    catch (e) { throw toError('reject', e); }
  },
  async initiate(uuid: string) {
    try { return await client.post<EmergencyAccessInfo>(`/emergency-access/${uuid}/initiate`); }
    catch (e) { throw toError('initiate', e); }
  },
  async approve(uuid: string) {
    try { return await client.post<EmergencyAccessInfo>(`/emergency-access/${uuid}/approve`); }
    catch (e) { throw toError('approve', e); }
  },
  async rejectRecovery(uuid: string) {
    try { return await client.post<EmergencyAccessInfo>(`/emergency-access/${uuid}/reject-recovery`); }
    catch (e) { throw toError('rejectRecovery', e); }
  },
  async remove(uuid: string) {
    try { return await client.delete<{ message: string }>(`/emergency-access/${uuid}`); }
    catch (e) { throw toError('remove', e); }
  },
};
