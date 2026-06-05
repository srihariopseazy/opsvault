import type { StoredCredentials } from './types';

interface ApiOptions {
  method?: string;
  body?: unknown;
  apiKey: string;
  server: string;
}

export async function apiRequest<T>(path: string, opts: ApiOptions): Promise<T> {
  const url = `${opts.server}/api/v1${path}`;
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `ApiKey ${opts.apiKey}`,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

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

export async function createApiKeyWithJwt(jwt: string, server: string): Promise<string> {
  const url = `${server}/api/v1/api-keys`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ name: 'Browser Extension', scopes: ['read', 'write'], expires_at: null }),
  });
  if (!res.ok) throw new Error('Failed to create extension API key');
  const data = await res.json();
  return data.full_key as string;
}

export async function syncVault(creds: StoredCredentials): Promise<Array<{ uuid: string; name: string; item_data: string; type: string; notes?: string; favorite: boolean; deleted_at?: string; updated_at?: string }>> {
  const data = await apiRequest<{ items: Array<Record<string, unknown>> }>('/vault/sync', {
    method: 'GET',
    apiKey: creds.apiKey,
    server: creds.server,
  });
  return data.items as ReturnType<typeof syncVault> extends Promise<infer R> ? R : never;
}
