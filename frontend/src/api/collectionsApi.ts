import client from './client';

// ── Request types ─────────────────────────────────────────────────────────────

export interface CollectionCreatePayload { org_id: string; name: string }
export interface CollectionRenamePayload { name: string }
export interface AddCollectionMemberPayload { user_uuid: string; access: string }
export interface AddCollectionItemPayload   { item_uuid: string }

// ── Response types ────────────────────────────────────────────────────────────

export interface CollectionResponse {
  uuid: string;
  org_id: string;
  name: string;
  item_count: number;
  member_count: number;
  my_access: string;
  created_at: string | null;
}

export interface CollectionMemberInfo {
  uuid: string;
  user_uuid: string;
  user_name: string;
  user_email: string;
  access: string;
  created_at: string | null;
}

export interface CollectionItemInfo {
  uuid: string;        // collection_item uuid
  item_uuid: string;   // vault item uuid
  item_name: string;   // encrypted — the owner can decrypt this client-side
  item_type: string;
  added_at: string | null;
}

export interface CollectionDetail {
  uuid: string;
  org_id: string;
  name: string;
  my_access: string;
  members: CollectionMemberInfo[];
  items: CollectionItemInfo[];
  created_at: string | null;
}

// ── API client ────────────────────────────────────────────────────────────────

function toError(ctx: string, err: unknown): Error {
  const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = e?.response?.data?.detail;
  const msg = typeof detail === 'string' ? detail : e?.message ?? 'Unknown error';
  console.error(`[collectionsApi] ${ctx}:`, err);
  return new Error(msg);
}

export const collectionsApi = {
  async listCollections() {
    try { return await client.get<CollectionResponse[]>('/collections'); }
    catch (e) { throw toError('listCollections', e); }
  },

  async createCollection(payload: CollectionCreatePayload) {
    try { return await client.post<CollectionResponse>('/collections', payload); }
    catch (e) { throw toError('createCollection', e); }
  },

  async getCollection(uuid: string) {
    try { return await client.get<CollectionDetail>(`/collections/${uuid}`); }
    catch (e) { throw toError('getCollection', e); }
  },

  async renameCollection(uuid: string, payload: CollectionRenamePayload) {
    try { return await client.put<{ message: string }>(`/collections/${uuid}`, payload); }
    catch (e) { throw toError('renameCollection', e); }
  },

  async deleteCollection(uuid: string) {
    try { return await client.delete<{ message: string }>(`/collections/${uuid}`); }
    catch (e) { throw toError('deleteCollection', e); }
  },

  async addMember(collectionUuid: string, payload: AddCollectionMemberPayload) {
    try { return await client.post<CollectionMemberInfo>(`/collections/${collectionUuid}/members`, payload); }
    catch (e) { throw toError('addMember', e); }
  },

  async removeMember(collectionUuid: string, memberUuid: string) {
    try { return await client.delete<{ message: string }>(`/collections/${collectionUuid}/members/${memberUuid}`); }
    catch (e) { throw toError('removeMember', e); }
  },

  async addItem(collectionUuid: string, payload: AddCollectionItemPayload) {
    try { return await client.post<CollectionItemInfo>(`/collections/${collectionUuid}/items`, payload); }
    catch (e) { throw toError('addItem', e); }
  },

  async removeItem(collectionUuid: string, itemUuid: string) {
    try { return await client.delete<{ message: string }>(`/collections/${collectionUuid}/items/${itemUuid}`); }
    catch (e) { throw toError('removeItem', e); }
  },
};
