import client from './client';

// ── Vault health ───────────────────────────────────────────────────────────────

export interface VaultItemStat {
  uuid: string;
  name: string;
  updated_at: string | null;
  created_at: string | null;
  type: string;
}

export interface VaultHealthReport {
  total_items: number;
  items_by_type: Record<string, number>;
  old_items: VaultItemStat[];
  never_updated: VaultItemStat[];
  total_old: number;
  total_never_updated: number;
}

// ── Breach check ───────────────────────────────────────────────────────────────

export interface BreachCheckItem {
  uuid: string;
  password_hash_prefix: string;
}

export interface BreachResult {
  uuid: string;
  pwned_count: number;
}

export interface BreachCheckResponse {
  results: BreachResult[];
  checked: number;
  breached: number;
}

// ── Compliance ────────────────────────────────────────────────────────────────

export interface InactiveMember {
  user_uuid: string;
  user_email: string;
  user_name: string;
  last_login_at: string | null;
  role: string;
}

export interface ComplianceReport {
  org_uuid: string;
  org_name: string;
  total_members: number;
  members_with_2fa: number;
  members_without_2fa: number;
  two_fa_adoption_pct: number;
  active_policies: string[];
  policy_count: number;
  inactive_members: InactiveMember[];
  total_collections: number;
  compliance_score: number;
}

// ── Scheduled reports ──────────────────────────────────────────────────────────

export interface ScheduledReportCreate {
  report_type: string;
  frequency: string;
  recipient_email: string;
}

export interface ScheduledReportUpdate {
  frequency?: string;
  enabled?: boolean;
  recipient_email?: string;
}

export interface ScheduledReport {
  uuid: string;
  report_type: string;
  frequency: string;
  enabled: boolean;
  last_sent_at: string | null;
  next_send_at: string;
  recipient_email: string;
  created_at: string | null;
}

export interface ReportLog {
  uuid: string;
  report_type: string;
  status: string;
  file_size: number | null;
  error_message: string | null;
  created_at: string | null;
}

// ── API client ────────────────────────────────────────────────────────────────

export const reportsApi = {
  getVaultHealthReport: () =>
    client.get<VaultHealthReport>('/reports/vault-health'),

  checkBreaches: (items: BreachCheckItem[]) =>
    client.post<BreachCheckResponse>('/reports/breach-check', items),

  getComplianceReport: (orgUuid: string) =>
    client.get<ComplianceReport>(`/reports/compliance/${orgUuid}`),

  getScheduledReports: () =>
    client.get<ScheduledReport[]>('/reports/scheduled'),

  createScheduledReport: (data: ScheduledReportCreate) =>
    client.post<ScheduledReport>('/reports/scheduled', data),

  updateScheduledReport: (uuid: string, data: ScheduledReportUpdate) =>
    client.put<ScheduledReport>(`/reports/scheduled/${uuid}`, data),

  deleteScheduledReport: (uuid: string) =>
    client.delete<{ message: string }>(`/reports/scheduled/${uuid}`),

  getReportLogs: (params?: { skip?: number; limit?: number }) =>
    client.get<ReportLog[]>('/reports/logs', { params }),
};
