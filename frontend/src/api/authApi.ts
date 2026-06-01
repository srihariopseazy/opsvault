import client from './client';

export interface RegisterPayload {
  email: string;
  name: string;
  masterPasswordHash: string;
  masterPasswordHint?: string;
  protectedSymmetricKey: string;
  kdfIterations: number;
}

export interface LoginPayload {
  email: string;
  masterPasswordHash: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: { uuid: string; email: string; name: string };
  protected_symmetric_key: string;
  kdf_iterations: number;
}

/**
 * Extract a human-readable message from an axios error and throw a new Error
 * carrying that message so callers can surface it directly in a toast.
 */
function toError(context: string, err: unknown): Error {
  const axiosErr = err as {
    response?: { status?: number; data?: { detail?: unknown } };
    message?: string;
  };
  const status = axiosErr?.response?.status;
  const detail = axiosErr?.response?.data?.detail;

  let message: string;
  if (typeof detail === 'string') {
    message = detail;
  } else if (detail) {
    message = JSON.stringify(detail);
  } else if (axiosErr?.message) {
    message = axiosErr.message;
  } else {
    message = 'Unknown error';
  }

  console.error(`[authApi] ${context} error:`, { status, detail, raw: err });
  const wrapped = new Error(message);
  (wrapped as Error & { status?: number }).status = status;
  return wrapped;
}

export const authApi = {
  async register(payload: RegisterPayload) {
    console.log('[authApi] register → request', { ...payload, masterPasswordHash: '***' });
    try {
      const res = await client.post<AuthResponse>('/auth/register', payload);
      console.log('[authApi] register ← response', res.status, res.data?.user);
      return res;
    } catch (err) {
      throw toError('register', err);
    }
  },

  async login(payload: LoginPayload) {
    console.log('[authApi] login → request', { email: payload.email, masterPasswordHash: '***' });
    try {
      const res = await client.post<AuthResponse>('/auth/login', payload);
      console.log('[authApi] login ← response', res.status, res.data?.user);
      return res;
    } catch (err) {
      throw toError('login', err);
    }
  },

  async logout() {
    try {
      return await client.post('/auth/logout');
    } catch (err) {
      throw toError('logout', err);
    }
  },

  async refresh(refreshToken: string) {
    try {
      return await client.post<AuthResponse>('/auth/refresh', { refresh_token: refreshToken });
    } catch (err) {
      throw toError('refresh', err);
    }
  },

  async me() {
    try {
      return await client.get<{ uuid: string; email: string; name: string }>('/auth/me');
    } catch (err) {
      throw toError('me', err);
    }
  },

  async changeMasterPassword(payload: {
    masterPasswordHash: string;
    newMasterPasswordHash: string;
    newProtectedSymmetricKey: string;
  }) {
    try {
      return await client.post('/auth/change-master-password', payload);
    } catch (err) {
      throw toError('changeMasterPassword', err);
    }
  },
};
