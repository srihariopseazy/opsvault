export const ROUTES = {
  LOGIN: '/login',
  REGISTER: '/register',
  VAULT: '/vault',
  DASHBOARD: '/dashboard',
  UNLOCK: '/unlock',
} as const;

export const ITEM_TYPES = {
  login: 'Login',
  note: 'Secure Note',
  card: 'Card',
  identity: 'Identity',
} as const;

export const CIPHER_PREFIX = '2.';

// Must match PBKDF2_ITERATIONS in crypto/cryptoEngine.ts. This value is sent to
// the server and stored as kdf_iterations so login/unlock derive the same key.
export const KDF_ITERATIONS = 10000;

export const CLIPBOARD_CLEAR_DELAY_MS = 30_000;
