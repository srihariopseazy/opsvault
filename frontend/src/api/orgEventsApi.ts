import client from './client';

export interface OrgEvent {
  uuid: string;
  event_type: string;
  actor_uuid: string | null;
  actor_email: string | null;
  target_uuid: string | null;
  ip_address: string | null;
  event_data: Record<string, unknown> | null;
  created_at: string | null;
}

export const orgEventsApi = {
  getOrgEvents: (
    orgUuid: string,
    params?: {
      event_type?: string;
      date_from?: string;
      date_to?: string;
      skip?: number;
      limit?: number;
    },
  ) =>
    client.get<OrgEvent[]>(`/organizations/${orgUuid}/events`, { params }),
};
