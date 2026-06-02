import client from './client';

export const settingsApi = {
  /** Invalidate all sessions for the current user across all devices. */
  logoutAll() {
    return client.post<{ message: string }>('/settings/logout-all');
  },

  /** Permanently delete the account and all vault data. */
  deleteAccount() {
    return client.delete<{ message: string }>('/settings/account');
  },
};
