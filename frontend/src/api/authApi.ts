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
  device_fingerprint?: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: { uuid: string; email: string; name: string; totp_enabled: boolean };
  protected_symmetric_key: string;
  kdf_iterations: number;
}

/** Returned by /auth/login when the user has TOTP enabled on an untrusted device. */
export interface MfaRequiredResponse {
  mfa_required: true;
  mfa_token: string;
}

export type LoginResponse = AuthResponse | MfaRequiredResponse;

export interface VerifyMfaPayload {
  mfa_token: string;
  totp_code: string;
  trust_device?: boolean;
  device_fingerprint?: string;
  device_name?: string;
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
  const httpStatus = axiosErr?.response?.status;
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

  console.error(`[authApi] ${context} error:`, { status: httpStatus, detail, raw: err });
  const wrapped = new Error(message);
  (wrapped as Error & { status?: number }).status = httpStatus;
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
      const res = await client.post<LoginResponse>('/auth/login', payload);
      console.log('[authApi] login ← response', res.status);
      return res;
    } catch (err) {
      throw toError('login', err);
    }
  },

  async verifyMfa(payload: VerifyMfaPayload) {
    console.log('[authApi] verifyMfa → request');
    try {
      const res = await client.post<AuthResponse>('/auth/verify-mfa', payload);
      console.log('[authApi] verifyMfa ← response', res.status, res.data?.user);
      return res;
    } catch (err) {
      throw toError('verifyMfa', err);
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
      return await client.get<{ uuid: string; email: string; name: string; totp_enabled: boolean }>('/auth/me');
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

  async getTotpStatus() {
    try {
      return await client.get<{ totp_enabled: boolean }>('/auth/totp/status');
    } catch (err) {
      throw toError('getTotpStatus', err);
    }
  },

  async setupTotp() {
    try {
      return await client.get<{ secret: string; otpauth_url: string }>('/auth/totp/setup');
    } catch (err) {
      throw toError('setupTotp', err);
    }
  },

  async enableTotp(payload: { secret: string; totp_code: string }) {
    try {
      return await client.post<{ message: string }>('/auth/totp/enable', payload);
    } catch (err) {
      throw toError('enableTotp', err);
    }
  },

  async disableTotp() {
    try {
      return await client.post<{ message: string }>('/auth/totp/disable');
    } catch (err) {
      throw toError('disableTotp', err);
    }
  },
};
