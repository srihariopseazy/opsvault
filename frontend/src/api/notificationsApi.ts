import client from './client';

export interface NotificationInfo {
  uuid: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string | null;
}

function toError(ctx: string, err: unknown): Error {
  const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = e?.response?.data?.detail;
  const msg = typeof detail === 'string' ? detail : e?.message ?? 'Unknown error';
  console.error(`[notificationsApi] ${ctx}:`, err);
  return new Error(msg);
}

export const notificationsApi = {
  async list() {
    try { return await client.get<NotificationInfo[]>('/notifications'); }
    catch (e) { throw toError('list', e); }
  },
  async unreadCount() {
    try { return await client.get<{ unread_count: number }>('/notifications/unread-count'); }
    catch (e) { throw toError('unreadCount', e); }
  },
  async markRead(uuid: string) {
    try { return await client.post<{ message: string }>(`/notifications/${uuid}/read`); }
    catch (e) { throw toError('markRead', e); }
  },
  async markAllRead() {
    try { return await client.post<{ message: string }>('/notifications/read-all'); }
    catch (e) { throw toError('markAllRead', e); }
  },
};
