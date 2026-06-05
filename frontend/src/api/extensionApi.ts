import client from './client';
import type { ApiKeyResponse } from './apiKeysApi';

export interface AutofillLogEntry {
  uuid: string;
  item_uuid: string;
  url: string | null;
  created_at: string;
}

export const extensionApi = {
  getExtensionKeys() {
    return client.get<ApiKeyResponse[]>('/api-keys');
  },

  revokeKey(uuid: string) {
    return client.delete(`/api-keys/${uuid}`);
  },
};
