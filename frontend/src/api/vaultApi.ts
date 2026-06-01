import client from './client';

export interface VaultItemPayload {
  type: string;
  name: string;
  notes?: string;
  favorite?: boolean;
  item_data: unknown;
  custom_fields?: unknown;
  reprompt?: boolean;
}

export interface VaultItemResponse {
  uuid: string;
  type: string;
  name: string;
  notes?: string;
  favorite: boolean;
  folder_id?: string;
  item_data: unknown;
  custom_fields?: unknown;
  password_history?: unknown;
  reprompt: boolean;
  deleted_at?: string;
  created_at?: string;
  updated_at?: string;
  revision_date?: string;
}

export interface SyncResponse {
  items: VaultItemResponse[];
  profile: { uuid: string; email: string; name: string };
}

export const vaultApi = {
  sync() {
    return client.get<SyncResponse>('/vault/sync');
  },

  createItem(payload: VaultItemPayload) {
    return client.post<VaultItemResponse>('/vault/items', payload);
  },

  listItems() {
    return client.get<VaultItemResponse[]>('/vault/items');
  },

  getItem(uuid: string) {
    return client.get<VaultItemResponse>(`/vault/items/${uuid}`);
  },

  updateItem(uuid: string, payload: Partial<VaultItemPayload>) {
    return client.put<VaultItemResponse>(`/vault/items/${uuid}`, payload);
  },

  deleteItem(uuid: string) {
    return client.delete(`/vault/items/${uuid}`);
  },

  permanentDelete(uuid: string) {
    return client.delete(`/vault/items/${uuid}/permanent`);
  },

  restoreItem(uuid: string) {
    return client.post<VaultItemResponse>(`/vault/items/${uuid}/restore`);
  },

  getTrash() {
    return client.get<VaultItemResponse[]>('/vault/trash');
  },

  purgeTrash() {
    return client.post('/vault/purge-trash');
  },
};
