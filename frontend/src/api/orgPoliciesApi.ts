import client from './client';

export interface OrgPolicy {
  policy_type: string;
  enabled: boolean;
  policy_data: Record<string, unknown> | null;
  updated_at: string | null;
}

export interface OrgPoliciesResponse {
  org_uuid: string;
  policies: OrgPolicy[];
}

export const orgPoliciesApi = {
  getPolicies: (orgUuid: string) =>
    client.get<OrgPoliciesResponse>(`/organizations/${orgUuid}/policies`),

  setPolicy: (
    orgUuid: string,
    policyType: string,
    enabled: boolean,
    policyData?: Record<string, unknown> | null,
  ) =>
    client.put<OrgPolicy>(`/organizations/${orgUuid}/policies/${policyType}`, {
      enabled,
      policy_data: policyData ?? null,
    }),
};
