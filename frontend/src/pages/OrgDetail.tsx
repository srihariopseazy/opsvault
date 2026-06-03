import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { orgsApi, OrgDetail as OrgDetailData, OrgMemberInfo } from '../api/orgsApi';
import { collectionsApi } from '../api/collectionsApi';
import { orgPoliciesApi, OrgPolicy } from '../api/orgPoliciesApi';
import { orgEventsApi, OrgEvent } from '../api/orgEventsApi';
import { webhooksApi, WebhookResponse, WebhookCreate, WebhookWithSecretResponse, EVENT_GROUPS } from '../api/webhooksApi';
import { useToast } from '../components/ui/Toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  owner:  'bg-purple-100 text-purple-700',
  admin:  'bg-blue-100 text-blue-700',
  member: 'bg-gray-100 text-gray-600',
};

const STATUS_COLORS: Record<string, string> = {
  accepted: 'bg-green-100 text-green-700',
  invited:  'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-600',
};

// ── Invite modal ──────────────────────────────────────────────────────────────

function InviteModal({
  open, onClose, onInvite,
}: {
  open: boolean;
  onClose: () => void;
  onInvite: (email: string, role: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole]   = useState('member');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    try { await onInvite(email.trim(), role); setEmail(''); setRole('member'); onClose(); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Invite member</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
            <input type="email" autoFocus required value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="colleague@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || !email.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors">
              {saving ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Create collection modal ───────────────────────────────────────────────────

function CreateCollectionModal({
  open, onClose, onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try { await onCreate(name.trim()); setName(''); onClose(); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Create collection</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Collection name</label>
            <input type="text" autoFocus required value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Production credentials" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || !name.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors">
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Policy descriptions ───────────────────────────────────────────────────────

const POLICY_META: Record<string, { label: string; description: string }> = {
  two_factor_authentication: {
    label: 'Two-Factor Authentication',
    description: 'Require all members to use 2FA',
  },
  master_password_strength: {
    label: 'Master Password Strength',
    description: 'Enforce minimum password strength',
  },
  single_org: {
    label: 'Single Organization',
    description: 'Prevent members from joining other organizations',
  },
  personal_vault_disabled: {
    label: 'Personal Vault Disabled',
    description: 'Prevent members from using personal vault',
  },
  send_disabled: {
    label: 'Send Disabled',
    description: 'Prevent members from creating Send items',
  },
  max_vault_timeout: {
    label: 'Max Vault Timeout',
    description: 'Set maximum vault auto-lock timeout',
  },
};

const STRENGTH_LABELS: Record<number, string> = {
  1: 'Weak',
  2: 'Fair',
  3: 'Strong',
  4: 'Very Strong',
};

// ── Policies tab ──────────────────────────────────────────────────────────────

function PoliciesTab({ orgUuid }: { orgUuid: string }) {
  const toast = useToast();
  const [policies, setPolicies] = useState<OrgPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    orgPoliciesApi.getPolicies(orgUuid)
      .then(({ data }) => setPolicies(data.policies))
      .catch(() => toast.error('Failed to load policies'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgUuid]);

  const handleToggle = useCallback(async (policy: OrgPolicy) => {
    const newEnabled = !policy.enabled;
    setSaving(policy.policy_type);
    try {
      const { data } = await orgPoliciesApi.setPolicy(
        orgUuid,
        policy.policy_type,
        newEnabled,
        newEnabled ? policy.policy_data : null,
      );
      setPolicies((prev) => prev.map((p) => p.policy_type === policy.policy_type ? data : p));
      toast.success(`Policy ${newEnabled ? 'enabled' : 'disabled'}`);
    } catch {
      toast.error('Failed to update policy');
    } finally {
      setSaving(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgUuid]);

  const handlePolicyData = useCallback(async (policy: OrgPolicy, policyData: Record<string, unknown>) => {
    setSaving(policy.policy_type);
    try {
      const { data } = await orgPoliciesApi.setPolicy(orgUuid, policy.policy_type, policy.enabled, policyData);
      setPolicies((prev) => prev.map((p) => p.policy_type === policy.policy_type ? data : p));
    } catch {
      toast.error('Failed to update policy config');
    } finally {
      setSaving(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgUuid]);

  if (loading) return <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="space-y-3">
      {policies.map((policy) => {
        const meta = POLICY_META[policy.policy_type] ?? { label: policy.policy_type, description: '' };
        const isSaving = saving === policy.policy_type;
        return (
          <div key={policy.policy_type} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">{meta.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{meta.description}</p>
              </div>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleToggle(policy)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 cursor-pointer focus:outline-none ${
                  policy.enabled ? 'bg-blue-600' : 'bg-gray-200'
                } disabled:opacity-50`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                  policy.enabled ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {/* Inline config when enabled */}
            {policy.enabled && policy.policy_type === 'master_password_strength' && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">Minimum strength</label>
                <select
                  value={policy.policy_data?.min_strength as number ?? 3}
                  onChange={(e) => handlePolicyData(policy, { min_strength: Number(e.target.value) })}
                  disabled={isSaving}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {[1, 2, 3, 4].map((v) => (
                    <option key={v} value={v}>{v} — {STRENGTH_LABELS[v]}</option>
                  ))}
                </select>
              </div>
            )}

            {policy.enabled && policy.policy_type === 'max_vault_timeout' && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">Timeout (minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={10080}
                  defaultValue={policy.policy_data?.timeout_minutes as number ?? 30}
                  onBlur={(e) => handlePolicyData(policy, { timeout_minutes: Number(e.target.value) })}
                  disabled={isSaving}
                  className="w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Org Event Log tab ─────────────────────────────────────────────────────────

function OrgEventLogTab({ orgUuid }: { orgUuid: string }) {
  const toast = useToast();
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [skip, setSkip] = useState(0);
  const limit = 20;

  const load = useCallback(async (offset: number, replace: boolean) => {
    if (offset === 0) setLoading(true);
    try {
      const { data } = await orgEventsApi.getOrgEvents(orgUuid, { skip: offset, limit });
      if (replace) {
        setEvents(data);
      } else {
        setEvents((prev) => [...prev, ...data]);
      }
    } catch {
      toast.error('Failed to load events');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgUuid]);

  useEffect(() => { load(0, true); }, [load]);

  const handleLoadMore = () => {
    const newSkip = skip + limit;
    setSkip(newSkip);
    load(newSkip, false);
  };

  if (loading) return <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="space-y-3">
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {events.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">No events yet.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {events.map((e) => (
              <div key={e.uuid} className="flex items-start gap-3 px-5 py-3.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 uppercase tracking-wide">
                      {e.event_type.replace(/_/g, ' ')}
                    </span>
                    {e.actor_email && (
                      <span className="text-xs text-gray-500">by {e.actor_email}</span>
                    )}
                  </div>
                  {e.event_data && Object.keys(e.event_data).length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {JSON.stringify(e.event_data)}
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                  {e.created_at ? new Date(e.created_at).toLocaleString() : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {events.length > 0 && events.length % limit === 0 && (
        <div className="flex justify-center">
          <button type="button" onClick={handleLoadMore}
            className="text-sm text-blue-600 border border-blue-200 hover:bg-blue-50 px-4 py-2 rounded-lg transition-colors">
            Load more
          </button>
        </div>
      )}
    </div>
  );
}

// ── Org Webhooks tab ──────────────────────────────────────────────────────────

function OrgWebhooksTab({ orgUuid }: { orgUuid: string }) {
  const toast = useToast();
  const [webhooks, setWebhooks] = useState<WebhookResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [revealSecret, setRevealSecret] = useState<string | null>(null);

  // form state
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newEvents, setNewEvents] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const { data } = await webhooksApi.listOrgWebhooks(orgUuid);
      setWebhooks(data);
    } catch {
      toast.error('Failed to load webhooks');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgUuid]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim() || newEvents.length === 0) {
      toast.error('Name, URL, and at least one event are required');
      return;
    }
    try {
      const { data } = await webhooksApi.createOrgWebhook(orgUuid, {
        name: newName.trim(),
        url: newUrl.trim(),
        events: newEvents,
      } as WebhookCreate);
      setRevealSecret((data as WebhookWithSecretResponse).secret);
      setShowCreate(false);
      setNewName(''); setNewUrl(''); setNewEvents([]);
      load();
    } catch {
      toast.error('Failed to create webhook');
    }
  };

  const handleTest = async (wh: WebhookResponse) => {
    try {
      await webhooksApi.testOrgWebhook(orgUuid, wh.uuid);
      toast.success('Test ping enqueued');
    } catch {
      toast.error('Failed to send test');
    }
  };

  const handleDelete = async (wh: WebhookResponse) => {
    if (!confirm(`Delete webhook "${wh.name}"?`)) return;
    try {
      await webhooksApi.deleteOrgWebhook(orgUuid, wh.uuid);
      toast.success('Webhook deleted');
      load();
    } catch {
      toast.error('Failed to delete webhook');
    }
  };

  const toggleEvent = (ev: string) =>
    setNewEvents((prev) =>
      prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]
    );

  if (loading) return <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => setShowCreate(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + New Webhook
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">URL</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Events</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {webhooks.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">No webhooks yet.</td></tr>
            ) : webhooks.map((wh) => (
              <tr key={wh.uuid} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{wh.name}</td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate" title={wh.url}>{wh.url}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {wh.events.slice(0, 3).map((e) => (
                      <span key={e} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                        {e.replace(/_/g, ' ')}
                      </span>
                    ))}
                    {wh.events.length > 3 && (
                      <span className="text-[10px] text-gray-400">+{wh.events.length - 3}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => handleTest(wh)}
                      className="text-xs text-blue-600 border border-blue-200 hover:bg-blue-50 px-2 py-1 rounded transition-colors">
                      Test
                    </button>
                    <button type="button" onClick={() => handleDelete(wh)}
                      className="text-xs text-red-600 border border-red-200 hover:bg-red-50 px-2 py-1 rounded transition-colors">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCreate(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-gray-900 mb-4">New Org Webhook</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. CI notifications"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint URL</label>
                <input type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://hooks.example.com/webhook"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Events</label>
                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {EVENT_GROUPS.map((group) => (
                    <div key={group.label}>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{group.label}</p>
                      <div className="grid grid-cols-1 gap-1 pl-2">
                        {group.events.map((ev) => (
                          <label key={ev} className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={newEvents.includes(ev)} onChange={() => toggleEvent(ev)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                            <span className="text-sm text-gray-700">{ev.replace(/_/g, ' ')}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Secret reveal */}
      {revealSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRevealSecret(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Webhook secret</h2>
            <p className="text-sm text-amber-700 font-medium">Store this to verify incoming signatures.</p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 font-mono text-xs text-gray-800 break-all select-all">
              {revealSecret}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={async () => { await navigator.clipboard.writeText(revealSecret); toast.success('Copied'); }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors">
                Copy
              </button>
              <button type="button" onClick={() => setRevealSecret(null)}
                className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'members' | 'collections' | 'policies' | 'events' | 'webhooks';

export default function OrgDetail() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate  = useNavigate();
  const toast     = useToast();

  const [org, setOrg]           = useState<OrgDetailData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<Tab>('members');
  const [inviteOpen, setInviteOpen]         = useState(false);
  const [createCollOpen, setCreateCollOpen] = useState(false);
  const [removingUuid, setRemovingUuid]     = useState<string | null>(null);

  const isAdmin = org?.my_role === 'owner' || org?.my_role === 'admin';

  const load = useCallback(async () => {
    if (!uuid) return;
    setLoading(true);
    try {
      const { data } = await orgsApi.getOrg(uuid);
      setOrg(data);
    } catch {
      toast.error('Failed to load organization');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid]);

  useEffect(() => { load(); }, [load]);

  const handleInvite = useCallback(async (email: string, role: string) => {
    if (!uuid) return;
    try {
      await orgsApi.inviteMember(uuid, { email, role });
      toast.success(`Invite sent to ${email}`);
      await load();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Failed to send invite';
      toast.error(msg);
      throw err;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid, load]);

  const handleRemoveMember = useCallback(async (m: OrgMemberInfo) => {
    if (!uuid) return;
    setRemovingUuid(m.uuid);
    try {
      await orgsApi.removeMember(uuid, m.uuid);
      toast.success('Member removed');
      await load();
    } catch {
      toast.error('Failed to remove member');
    } finally {
      setRemovingUuid(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid, load]);

  const handleCreateCollection = useCallback(async (name: string) => {
    if (!uuid) return;
    try {
      await collectionsApi.createCollection({ org_id: uuid, name });
      toast.success('Collection created');
      await load();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Failed to create collection';
      toast.error(msg);
      throw err;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid, load]);

  const handleDeleteOrg = useCallback(async () => {
    if (!uuid || !window.confirm('Delete this organization? This cannot be undone.')) return;
    try {
      await orgsApi.deleteOrg(uuid);
      toast.success('Organization deleted');
      navigate('/organizations');
    } catch {
      toast.error('Failed to delete organization');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid, navigate]);

  if (loading) {
    return <div className="p-6 text-center text-gray-400 text-sm">Loading…</div>;
  }
  if (!org) {
    return <div className="p-6 text-center text-gray-400 text-sm">Organization not found.</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button type="button" onClick={() => navigate('/organizations')}
              className="text-xs text-gray-400 hover:text-gray-600">
              ← Organizations
            </button>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[org.my_role] ?? 'bg-gray-100 text-gray-600'}`}>
              {org.my_role}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">{org.members.length} member{org.members.length !== 1 ? 's' : ''}</p>
        </div>

        {org.my_role === 'owner' && (
          <button type="button" onClick={handleDeleteOrg}
            className="text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">
            Delete org
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
        {(['members', 'collections', ...(isAdmin ? (['policies', 'events', 'webhooks'] as Tab[]) : [])] as Tab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'events' ? 'Event Log' : t}
          </button>
        ))}
      </div>

      {/* ── Members tab ──────────────────────────────────────────────────────── */}
      {tab === 'members' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {isAdmin && (
            <div className="px-6 py-3 border-b border-gray-100 flex justify-end">
              <button type="button" onClick={() => setInviteOpen(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Invite member
              </button>
            </div>
          )}
          <div className="divide-y divide-gray-50">
            {org.members.map((m) => (
              <div key={m.uuid} className="flex items-center gap-3 px-6 py-4">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold flex-shrink-0">
                  {m.user_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.user_name}</p>
                  <p className="text-xs text-gray-400 truncate">{m.user_email}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize flex-shrink-0 ${ROLE_COLORS[m.role] ?? 'bg-gray-100 text-gray-600'}`}>
                  {m.role}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize flex-shrink-0 ${STATUS_COLORS[m.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {m.status}
                </span>
                {isAdmin && m.role !== 'owner' && (
                  <button type="button" onClick={() => handleRemoveMember(m)}
                    disabled={removingUuid === m.uuid}
                    className="flex-shrink-0 text-xs text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 px-2.5 py-1 rounded-lg transition-colors">
                    {removingUuid === m.uuid ? '…' : 'Remove'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Collections tab ───────────────────────────────────────────────────── */}
      {tab === 'collections' && (
        <div className="space-y-3">
          {isAdmin && (
            <div className="flex justify-end">
              <button type="button" onClick={() => setCreateCollOpen(true)}
                className="flex items-center gap-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New collection
              </button>
            </div>
          )}

          {org.collections.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No collections yet.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {org.collections.map((c) => (
                <button key={c.uuid} type="button"
                  onClick={() => navigate(`/organizations/${uuid}/collections/${c.uuid}`)}
                  className="text-left bg-white border border-gray-200 hover:border-blue-300 hover:shadow-sm rounded-xl p-5 transition-all">
                  <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {c.item_count} item{c.item_count !== 1 ? 's' : ''} · {c.member_count} member{c.member_count !== 1 ? 's' : ''}
                  </p>
                  <div className="mt-3 flex items-center gap-1 text-xs text-blue-600">
                    <span>Open</span>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Policies tab ──────────────────────────────────────────────────────── */}
      {tab === 'policies' && isAdmin && uuid && (
        <PoliciesTab orgUuid={uuid} />
      )}

      {/* ── Event Log tab ─────────────────────────────────────────────────────── */}
      {tab === 'events' && isAdmin && uuid && (
        <OrgEventLogTab orgUuid={uuid} />
      )}

      {/* ── Webhooks tab ──────────────────────────────────────────────────────── */}
      {tab === 'webhooks' && isAdmin && uuid && (
        <OrgWebhooksTab orgUuid={uuid} />
      )}

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvite={handleInvite}
      />
      <CreateCollectionModal
        open={createCollOpen}
        onClose={() => setCreateCollOpen(false)}
        onCreate={handleCreateCollection}
      />
    </div>
  );
}
