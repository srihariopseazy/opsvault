import client from './client';

export interface SmtpConfig {
  uuid: string;
  host: string;
  port: number;
  username: string;
  password: string;
  from_email: string;
  from_name: string;
  use_tls: boolean;
  use_ssl: boolean;
  enabled: boolean;
}

export interface SmtpConfigUpdate {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  from_email?: string;
  from_name?: string;
  use_tls?: boolean;
  use_ssl?: boolean;
  enabled?: boolean;
}

export interface SmtpTestResult {
  success: boolean;
  message: string;
}

export interface EmailLog {
  uuid: string;
  to_email: string;
  subject: string;
  template: string;
  status: 'sent' | 'failed' | 'skipped';
  error_message: string | null;
  user_uuid: string | null;
  created_at: string | null;
}

export interface EmailLogList {
  items: EmailLog[];
  total: number;
}

export interface NotificationPreferences {
  new_device_login: boolean;
  master_password_changed: boolean;
  send_item_viewed: boolean;
  org_invites: boolean;
  emergency_access: boolean;
}

export const smtpApi = {
  getSmtpConfig: () =>
    client.get<SmtpConfig>('/admin/smtp'),

  updateSmtpConfig: (data: SmtpConfigUpdate) =>
    client.put<SmtpConfig>('/admin/smtp', data),

  testSmtp: (toEmail: string) =>
    client.post<SmtpTestResult>('/admin/smtp/test', { to_email: toEmail }),

  getEmailLogs: (params?: {
    status?: string;
    date_from?: string;
    date_to?: string;
    skip?: number;
    limit?: number;
  }) =>
    client.get<EmailLogList>('/admin/smtp/logs', { params }),

  getNotifPrefs: () =>
    client.get<NotificationPreferences>('/users/me/notification-preferences'),

  updateNotifPrefs: (data: Partial<NotificationPreferences>) =>
    client.put<NotificationPreferences>('/users/me/notification-preferences', data),
};
