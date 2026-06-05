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

export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (detail) return typeof detail === 'string' ? detail : JSON.stringify(detail);
    return `HTTP ${err.response?.status ?? 0}: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}
