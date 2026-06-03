import client from './client';

export interface SendCreatePayload {
  type: string;
  name: string;         // encrypted with user's symmetricKey
  content: string;      // encrypted with per-send key
  max_access_count?: number;
  expiration_at?: string;
  deletion_at: string;
  password?: string;
  hide_content?: boolean;
}

export interface SendUpdatePayload {
  name?: string;
  content?: string;
  max_access_count?: number;
  expiration_at?: string;
  deletion_at?: string;
  password?: string;
  hide_content?: boolean;
  disabled?: boolean;
}

export interface SendInfo {
  uuid: string;
  access_id: string;
  type: string;
  name: string;           // encrypted
  access_count: number;
  max_access_count: number | null;
  expiration_at: string | null;
  deletion_at: string;
  hide_content: boolean;
  disabled: boolean;
  password_protected: boolean;
  created_at: string | null;
}

export interface PublicSendInfo {
  access_id: string;
  type: string;
  content: string;        // encrypted with per-send key
  hide_content: boolean;
  password_required: boolean;
}

function toError(ctx: string, err: unknown): Error {
  const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = e?.response?.data?.detail;
  const msg = typeof detail === 'string' ? detail : e?.message ?? 'Unknown error';
  console.error(`[sendApi] ${ctx}:`, err);
  return new Error(msg);
}

export const sendApi = {
  async listSends() {
    try { return await client.get<SendInfo[]>('/send'); }
    catch (e) { throw toError('listSends', e); }
  },
  async createSend(payload: SendCreatePayload) {
    try { return await client.post<SendInfo>('/send', payload); }
    catch (e) { throw toError('createSend', e); }
  },
  async getSend(uuid: string) {
    try { return await client.get<SendInfo>(`/send/${uuid}`); }
    catch (e) { throw toError('getSend', e); }
  },
  async updateSend(uuid: string, payload: SendUpdatePayload) {
    try { return await client.put<SendInfo>(`/send/${uuid}`, payload); }
    catch (e) { throw toError('updateSend', e); }
  },
  async deleteSend(uuid: string) {
    try { return await client.delete<{ message: string }>(`/send/${uuid}`); }
    catch (e) { throw toError('deleteSend', e); }
  },
  async publicAccess(accessId: string, password?: string) {
    const params = password ? { password } : {};
    try { return await client.get<PublicSendInfo>(`/send/access/${accessId}`, { params }); }
    catch (e) { throw toError('publicAccess', e); }
  },
};
