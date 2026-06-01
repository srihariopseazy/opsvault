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

export const KDF_ITERATIONS = 600000;

export const CLIPBOARD_CLEAR_DELAY_MS = 30_000;
