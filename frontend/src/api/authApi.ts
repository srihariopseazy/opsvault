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

export const authApi = {
  register(payload: RegisterPayload) {
    return client.post<AuthResponse>('/auth/register', payload);
  },

  login(payload: LoginPayload) {
    return client.post<AuthResponse>('/auth/login', payload);
  },

  logout() {
    return client.post('/auth/logout');
  },

  refresh(refreshToken: string) {
    return client.post<AuthResponse>('/auth/refresh', { refresh_token: refreshToken });
  },

  me() {
    return client.get<{ uuid: string; email: string; name: string }>('/auth/me');
  },

  changeMasterPassword(payload: {
    masterPasswordHash: string;
    newMasterPasswordHash: string;
    newProtectedSymmetricKey: string;
  }) {
    return client.post('/auth/change-master-password', payload);
  },
};
