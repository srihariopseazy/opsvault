import client from './client';

export interface PushSubscriptionPayload {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionResponse {
  uuid: string;
  endpoint: string;
  created_at: string;
}

export const pushApi = {
  subscribe(payload: PushSubscriptionPayload) {
    return client.post<PushSubscriptionResponse>('/push/subscribe', payload);
  },

  unsubscribe(uuid: string) {
    return client.delete(`/push/subscribe/${uuid}`);
  },

  listSubscriptions() {
    return client.get<PushSubscriptionResponse[]>('/push/subscriptions');
  },
};
