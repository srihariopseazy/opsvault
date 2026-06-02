import client from './client';

export interface SessionInfo {
  uuid: string;
  device_name: string | null;
  device_type: string | null;
  ip_address: string | null;
  created_at: string | null;
  last_used_at: string | null;
  is_current: boolean;
}

export interface LoginEventInfo {
  uuid: string;
  ip_address: string | null;
  user_agent: string | null;
  device_name: string | null;
  status: 'success' | 'failed';
  created_at: string | null;
}

function toError(context: string, err: unknown): Error {
  const axiosErr = err as {
    response?: { data?: { detail?: unknown }; status?: number };
    message?: string;
  };
  const detail = axiosErr?.response?.data?.detail;
  const message =
    typeof detail === 'string'
      ? detail
      : axiosErr?.message ?? 'Unknown error';
  console.error(`[sessionsApi] ${context}:`, err);
  return new Error(message);
}

export const sessionsApi = {
  async listSessions() {
    try {
      return await client.get<SessionInfo[]>('/sessions');
    } catch (err) {
      throw toError('listSessions', err);
    }
  },

  async revokeSession(uuid: string) {
    try {
      return await client.delete<{ message: string }>(`/sessions/${uuid}`);
    } catch (err) {
      throw toError('revokeSession', err);
    }
  },

  async revokeAll() {
    try {
      return await client.delete<{ message: string }>('/sessions/revoke-all');
    } catch (err) {
      throw toError('revokeAll', err);
    }
  },

  async listLoginEvents() {
    try {
      return await client.get<LoginEventInfo[]>('/sessions/login-events');
    } catch (err) {
      throw toError('listLoginEvents', err);
    }
  },
};
