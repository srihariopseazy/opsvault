import client from './client';

export interface GeneratorHistoryEntry {
  uuid: string;
  password: string;   // encrypted — client decrypts before display
  created_at: string | null;
}

function toError(ctx: string, err: unknown): Error {
  const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = e?.response?.data?.detail;
  const msg = typeof detail === 'string' ? detail : e?.message ?? 'Unknown error';
  console.error(`[generatorHistoryApi] ${ctx}:`, err);
  return new Error(msg);
}

export const generatorHistoryApi = {
  async list() {
    try { return await client.get<GeneratorHistoryEntry[]>('/generator-history'); }
    catch (e) { throw toError('list', e); }
  },
  async save(encryptedPassword: string) {
    try {
      return await client.post<GeneratorHistoryEntry>('/generator-history', {
        password: encryptedPassword,
      });
    }
    catch (e) { throw toError('save', e); }
  },
  async deleteEntry(uuid: string) {
    try { return await client.delete<{ message: string }>(`/generator-history/${uuid}`); }
    catch (e) { throw toError('deleteEntry', e); }
  },
  async clearAll() {
    try { return await client.delete<{ message: string }>('/generator-history'); }
    catch (e) { throw toError('clearAll', e); }
  },
};
