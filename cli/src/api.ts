import axios, { AxiosInstance } from 'axios';
import { loadConfig, saveConfig } from './config';

/** Authenticated client for ongoing commands (list/get/add/edit/...): sends
 * the stored access token as a Bearer header and transparently refreshes
 * (persisting the new tokens to config.json) once on a 401 before giving up -
 * each CLI invocation is a fresh process, so a token that expired since the
 * last login must be silently renewed rather than forcing a re-login every
 * time. */
export function createClient(): AxiosInstance {
  const config = loadConfig();
  const client = axios.create({
    baseURL: `${config.server}/api/v1`,
    headers: { 'Content-Type': 'application/json' },
    timeout: 20000,
  });
  if (config.accessToken) {
    client.defaults.headers.common['Authorization'] = `Bearer ${config.accessToken}`;
  }

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error.config;
      if (error.response?.status === 401 && !original._retry && config.refreshToken) {
        original._retry = true;
        try {
          const raw = createRawClient(config.server);
          const { data } = await raw.post('/auth/refresh', { refresh_token: config.refreshToken });
          config.accessToken = data.access_token;
          config.refreshToken = data.refresh_token;
          saveConfig(config);
          client.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`;
          original.headers['Authorization'] = `Bearer ${data.access_token}`;
          return client(original);
        } catch {
          // Refresh itself failed (expired/revoked) - fall through to the
          // original 401 so the caller sees a real auth error.
        }
      }
      return Promise.reject(error);
    },
  );

  return client;
}

export function createBearerClient(token: string, server: string): AxiosInstance {
  return axios.create({
    baseURL: `${server}/api/v1`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    timeout: 20000,
  });
}

export function createRawClient(server: string): AxiosInstance {
  return axios.create({
    baseURL: `${server}/api/v1`,
    headers: { 'Content-Type': 'application/json' },
    timeout: 20000,
  });
}

/** Pre-login lookup: what iteration count does this account use? Needed
 * before deriving the login hash. */
export async function getKdfParams(email: string, server: string): Promise<{ kdf_iterations: number }> {
  const client = createRawClient(server);
  const { data } = await client.get('/auth/kdf-params', { params: { email } });
  return data;
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
  const client = createBearerClient(accessToken, server);
  await client.post('/auth/migrate-kdf', payload);
}

export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (detail) return typeof detail === 'string' ? detail : JSON.stringify(detail);
    return `HTTP ${err.response?.status ?? 0}: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}
