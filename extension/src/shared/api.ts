import type { StoredCredentials } from './types';
import { setCredentials } from './storage';

interface ApiOptions {
  method?: string;
  body?: unknown;
}

async function authedFetch(path: string, server: string, token: string, opts: ApiOptions): Promise<Response> {
  return fetch(`${server}/api/v1${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

/** Exchange the stored refresh token for a new access/refresh pair and
 * persist it. Returns null (without throwing) if the refresh itself fails -
 * callers fall back to surfacing the original 401. */
async function refreshTokens(creds: StoredCredentials): Promise<StoredCredentials | null> {
  try {
    const res = await fetch(`${creds.server}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: creds.refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const updated: StoredCredentials = { ...creds, accessToken: data.access_token, refreshToken: data.refresh_token };
    await setCredentials(updated);
    return updated;
  } catch {
    return null;
  }
}

/** Authenticated request using the stored access token, transparently
 * refreshing (and persisting the new tokens) once on a 401 before giving up. */
export async function apiRequest<T>(path: string, creds: StoredCredentials, opts: ApiOptions = {}): Promise<T> {
  let res = await authedFetch(path, creds.server, creds.accessToken, opts);

  if (res.status === 401) {
    const refreshed = await refreshTokens(creds);
    if (refreshed) {
      res = await authedFetch(path, refreshed.server, refreshed.accessToken, opts);
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function authRequest<T>(path: string, body: unknown, server: string): Promise<T> {
  const url = `${server}/api/v1${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Pre-login lookup: what iteration count does this account use? Needed
 * before deriving the login hash. */
export async function getKdfParams(email: string, server: string): Promise<{ kdf_iterations: number }> {
  const url = `${server}/api/v1/auth/kdf-params?email=${encodeURIComponent(email)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/** Silent crypto-scheme upgrade, fired right after a successful login for an
 * account still below the current KDF floor. */
export async function migrateKdf(
  payload: {
    oldMasterPasswordHash: string;
    newMasterPasswordHash: string;
    newProtectedSymmetricKey: string;
    newKdfIterations: number;
  },
  accessToken: string,
  server: string,
): Promise<void> {
  const res = await fetch(`${server}/api/v1/auth/migrate-kdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
}

export async function syncVault(creds: StoredCredentials): Promise<Array<{ uuid: string; name: string; item_data: string; type: string; notes?: string; favorite: boolean; deleted_at?: string; updated_at?: string }>> {
  const data = await apiRequest<{ items: Array<{ uuid: string; name: string; item_data: string; type: string; notes?: string; favorite: boolean; deleted_at?: string; updated_at?: string }> }>('/vault/sync', creds);
  return data.items;
}
