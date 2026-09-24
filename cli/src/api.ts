import axios, { AxiosInstance } from 'axios';
import { loadConfig } from './config';

export function createClient(): AxiosInstance {
  const config = loadConfig();
  const client = axios.create({
    baseURL: `${config.server}/api/v1`,
    headers: { 'Content-Type': 'application/json' },
    timeout: 20000,
  });
  if (config.apiKey) {
    client.defaults.headers.common['Authorization'] = `ApiKey ${config.apiKey}`;
  }
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
