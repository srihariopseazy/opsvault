export interface DecryptedVaultItem {
  uuid: string;
  type: 'login' | 'note' | 'card' | 'identity';
  name: string;
  notes?: string;
  favorite: boolean;
  itemData: LoginItemData | Record<string, unknown>;
  deleted_at?: string;
  updated_at?: string;
}

export interface LoginItemData {
  username?: string;
  password?: string;
  uris?: Array<{ uri: string; match?: string | null }>;
  totp?: string;
}

export interface StoredCredentials {
  apiKey: string;
  email: string;
  server: string;
  protectedSymmetricKey: string;
}

export interface SessionData {
  symmetricKey: string;
  items: DecryptedVaultItem[];
  lastSync: number;
}

// Messages exchanged between popup ↔ service worker ↔ content script
export type MsgType =
  | 'GET_STATE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOCK'
  | 'SYNC_VAULT'
  | 'GET_ITEMS'
  | 'AUTOFILL';

export interface Msg {
  type: MsgType;
  payload?: unknown;
}

export interface StateResponse {
  isLocked: boolean;
  email?: string;
  server?: string;
  itemCount?: number;
}
