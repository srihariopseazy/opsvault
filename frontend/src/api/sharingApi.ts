import client from './client';

export interface ShareCreatePayload {
  vault_item_uuid: string;
  recipient_email: string;
  encrypted_item_data: string;
  encrypted_item_key: string;
  permissions: 'view' | 'edit';
  expires_in_days: number | null;
  message: string | null;
}

export interface VaultShareResponse {
  uuid: string;
  recipient_email: string;
  permissions: string;
  status: string;
  message: string | null;
  expires_at: string | null;
  accepted_at: string | null;
  created_at: string;
  sharer_email: string | null;
}

export interface SharedItemResponse {
  share_uuid: string;
  encrypted_item_data: string;
  encrypted_item_key: string;
  permissions: string;
  sharer_email: string;
}

export interface PublicKeyResponse {
  user_email: string;
  public_key: string;
}

export const sharingApi = {
  createShare(payload: ShareCreatePayload) {
    return client.post<VaultShareResponse>('/sharing/share', payload);
  },

  sharedByMe() {
    return client.get<VaultShareResponse[]>('/sharing/shared-by-me');
  },

  sharedWithMe() {
    return client.get<VaultShareResponse[]>('/sharing/shared-with-me');
  },

  acceptShare(uuid: string) {
    return client.post<VaultShareResponse>(`/sharing/share/${uuid}/accept`);
  },

  declineShare(uuid: string) {
    return client.post<VaultShareResponse>(`/sharing/share/${uuid}/decline`);
  },

  revokeShare(uuid: string) {
    return client.post<VaultShareResponse>(`/sharing/share/${uuid}/revoke`);
  },

  getSharedItem(uuid: string) {
    return client.get<SharedItemResponse>(`/sharing/share/${uuid}/item`);
  },

  uploadPublicKey(publicKey: string) {
    return client.post('/keys/public', { public_key: publicKey });
  },

  getPublicKey(email: string) {
    return client.get<PublicKeyResponse>(`/keys/public/${encodeURIComponent(email)}`);
  },
};
