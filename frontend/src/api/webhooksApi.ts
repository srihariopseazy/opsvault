import client from './client';

export interface WebhookResponse {
  uuid: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface WebhookWithSecretResponse extends WebhookResponse {
  secret: string;
}

export interface WebhookDeliveryResponse {
  uuid: string;
  event_type: string;
  response_status: number | null;
  response_body: string | null;
  attempt_count: number;
  success: boolean;
  delivered_at: string | null;
  created_at: string | null;
}

export interface WebhookDetailResponse extends WebhookWithSecretResponse {
  recent_deliveries: WebhookDeliveryResponse[];
}

export interface WebhookCreate {
  name: string;
  url: string;
  events: string[];
}

export interface WebhookUpdate {
  name?: string;
  url?: string;
  events?: string[];
  is_active?: boolean;
}

export const webhooksApi = {
  // Personal
  listWebhooks: () =>
    client.get<WebhookResponse[]>('/webhooks'),

  createWebhook: (data: WebhookCreate) =>
    client.post<WebhookWithSecretResponse>('/webhooks', data),

  getWebhook: (uuid: string) =>
    client.get<WebhookDetailResponse>(`/webhooks/${uuid}`),

  updateWebhook: (uuid: string, data: WebhookUpdate) =>
    client.put<WebhookResponse>(`/webhooks/${uuid}`, data),

  deleteWebhook: (uuid: string) =>
    client.delete(`/webhooks/${uuid}`),

  testWebhook: (uuid: string) =>
    client.post(`/webhooks/${uuid}/test`, {}),

  getDeliveries: (uuid: string, skip = 0, limit = 50) =>
    client.get<WebhookDeliveryResponse[]>(`/webhooks/${uuid}/deliveries`, {
      params: { skip, limit },
    }),

  // Org
  listOrgWebhooks: (orgUuid: string) =>
    client.get<WebhookResponse[]>(`/webhooks/org/${orgUuid}`),

  createOrgWebhook: (orgUuid: string, data: WebhookCreate) =>
    client.post<WebhookWithSecretResponse>(`/webhooks/org/${orgUuid}`, data),

  deleteOrgWebhook: (orgUuid: string, webhookUuid: string) =>
    client.delete(`/webhooks/org/${orgUuid}/${webhookUuid}`),

  testOrgWebhook: (orgUuid: string, webhookUuid: string) =>
    client.post(`/webhooks/org/${orgUuid}/${webhookUuid}/test`, {}),
};

export const EVENT_GROUPS = [
  { label: 'Vault',        events: ['vault_item_created', 'vault_item_updated', 'vault_item_deleted'] },
  { label: 'Auth',         events: ['login_success', 'login_failed', 'new_device_login'] },
  { label: 'Organization', events: ['org_member_invited', 'org_member_accepted', 'org_member_removed'] },
  { label: 'Emergency',    events: ['emergency_access_invited', 'emergency_access_granted'] },
  { label: 'API Keys',     events: ['api_key_created', 'api_key_revoked'] },
  { label: 'Security',     events: ['breach_detected', 'send_item_viewed'] },
] as const;

export const ALL_EVENTS = EVENT_GROUPS.flatMap((g) => g.events as unknown as string[]);
