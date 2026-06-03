import client from './client';

export interface DeviceResponse {
  uuid:               string;
  device_name:        string | null;
  device_type:        string | null;
  browser:            string | null;
  os:                 string | null;
  ip_address:         string | null;
  last_seen_ip:       string | null;
  is_trusted:         boolean;
  last_used_at:       string | null;
  created_at:         string | null;
  status:             'active' | 'wiped' | 'revoked';
  wiped_at:           string | null;
  device_fingerprint: string;
}

export interface AdminDeviceResponse extends DeviceResponse {
  user_id:    number;
  user_email: string | null;
  user_name:  string | null;
}

export const devicesApi = {
  listDevices: () =>
    client.get<DeviceResponse[]>('/devices'),

  getDevice: (uuid: string) =>
    client.get<DeviceResponse>(`/devices/${uuid}`),

  revokeDevice: (uuid: string) =>
    client.post<DeviceResponse>(`/devices/${uuid}/revoke`, {}),

  wipeDevice: (uuid: string) =>
    client.post<DeviceResponse>(`/devices/${uuid}/wipe`, {}),

  trustDevice: (uuid: string) =>
    client.post<DeviceResponse>(`/devices/${uuid}/trust`, {}),

  untrustDevice: (uuid: string) =>
    client.post<DeviceResponse>(`/devices/${uuid}/untrust`, {}),

  adminListAllDevices: () =>
    client.get<AdminDeviceResponse[]>('/devices/admin/all'),

  adminWipeDevice: (uuid: string) =>
    client.post<DeviceResponse>(`/devices/admin/${uuid}/wipe`, {}),
};
