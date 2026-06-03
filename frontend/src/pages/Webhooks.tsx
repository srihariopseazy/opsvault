import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/ui/Toast';
import {
  webhooksApi,
  WebhookResponse,
  WebhookWithSecretResponse,
  WebhookDeliveryResponse,
  WebhookCreate,
  WebhookUpdate,
  EVENT_GROUPS,
} from '../api/webhooksApi';
import { orgsApi, OrgSummary } from '../api/orgsApi';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString();
}

function EventBadge({ event }: { event: string }) {
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 whitespace-nowrap">
      {event.replace(/_/g, ' ')}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
      active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function DeliveryBadge({ success }: { success: boolean }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
      success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
    }`}>
      {success ? 'OK' : 'Failed'}
    </span>
  );
}

// ── Secret Reveal Modal ───────────────────────────────────────────────────────

function SecretModal({ secret, onClose }: { secret: string; onClose: () => void }) {
  const toast = useToast();

  const copy = async () => {
    await navigator.clipboard.writeText(secret);
    toast.success('Secret copied to clipboard');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 flex-shrink-0 bg-amber-100 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Webhook secret</h2>
            <p className="text-sm text-amber-700 font-medium mt-0.5">
              Use this to verify incoming webhook signatures. Store it securely.
            </p>
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 font-mono text-xs text-gray-800 break-all select-all">
          {secret}
        </div>
        <p className="text-xs text-gray-400">
          Verify delivery authenticity by checking the{' '}
          <code className="bg-gray-100 px-1 rounded">X-OPSVAULT-Signature</code> header:{' '}
          <code className="bg-gray-100 px-1 rounded">sha256=HMAC-SHA256(secret, body)</code>
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={copy}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors">
            Copy secret
          </button>
          <button type="button" onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delivery Log Drawer ───────────────────────────────────────────────────────

function DeliveryDrawer({
  webhookUuid,
  webhookName,
  onClose,
}: {
  webhookUuid: string;
  webhookName: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [deliveries, setDeliveries] = useState<WebhookDeliveryResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    webhooksApi.getDeliveries(webhookUuid)
      .then(({ data }) => setDeliveries(data))
      .catch(() => toast.error('Failed to load deliveries'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhookUuid]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Delivery Log</h2>
            <p className="text-xs text-gray-400 truncate max-w-[280px]">{webhookName}</p>
          </div>
          <button type="button" onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>
          ) : deliveries.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No deliveries yet.</div>
          ) : deliveries.map((d) => (
            <div key={d.uuid} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <DeliveryBadge success={d.success} />
                  <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                    {d.event_type.replace(/_/g, ' ')}
                  </span>
                  {d.response_status && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      d.response_status < 300 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                    }`}>
                      HTTP {d.response_status}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400">attempt #{d.attempt_count}</span>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                  {fmtDate(d.created_at)}
                </span>
              </div>
              {d.response_body && (
                <p className="text-xs text-gray-500 truncate font-mono">{d.response_body}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Event checkboxes ──────────────────────────────────────────────────────────

function EventSelector({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (events: string[]) => void;
}) {
  const toggle = (event: string) => {
    onChange(
      selected.includes(event)
        ? selected.filter((e) => e !== event)
        : [...selected, event],
    );
  };

  const toggleGroup = (events: readonly string[]) => {
    const allSelected = events.every((e) => selected.includes(e));
    if (allSelected) {
      onChange(selected.filter((e) => !events.includes(e)));
    } else {
      const toAdd = events.filter((e) => !selected.includes(e));
      onChange([...selected, ...toAdd]);
    }
  };

  return (
    <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
      {EVENT_GROUPS.map((group) => (
        <div key={group.label}>
          <button
            type="button"
            onClick={() => toggleGroup(group.events)}
            className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 hover:text-gray-700"
          >
            {group.label}
          </button>
          <div className="grid grid-cols-1 gap-1 pl-2">
            {group.events.map((event) => (
              <label key={event} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(event)}
                  onChange={() => toggle(event)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{event.replace(/_/g, ' ')}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Create / Edit dialog ──────────────────────────────────────────────────────

function WebhookDialog({
  existing,
  onClose,
  onSave,
}: {
  existing?: WebhookResponse;
  onClose: () => void;
  onSave: (data: WebhookCreate | WebhookUpdate) => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = useState(existing?.name ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [events, setEvents] = useState<string[]>(existing?.events ?? []);
  const [isActive, setIsActive] = useState(existing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (!url.trim()) { toast.error('URL is required'); return; }
    if (events.length === 0) { toast.error('Select at least one event'); return; }
    setSaving(true);
    try {
      if (existing) {
        await onSave({ name: name.trim(), url: url.trim(), events, is_active: isActive } as WebhookUpdate);
      } else {
        await onSave({ name: name.trim(), url: url.trim(), events } as WebhookCreate);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          {existing ? 'Edit Webhook' : 'Create Webhook'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Slack notifications"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint URL</label>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://hooks.example.com/webhook"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {existing && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsActive((p) => !p)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 cursor-pointer ${
                  isActive ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                  isActive ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </button>
              <span className="text-sm text-gray-700">Active</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Events <span className="text-xs font-normal text-gray-400">({events.length} selected)</span>
            </label>
            <EventSelector selected={events} onChange={setEvents} />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors">
              {saving ? 'Saving…' : existing ? 'Save changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Webhook table ─────────────────────────────────────────────────────────────

function WebhookTable({
  webhooks,
  loading,
  onTest,
  onEdit,
  onDelete,
  onViewDeliveries,
  hideEdit,
}: {
  webhooks: WebhookResponse[];
  loading: boolean;
  onTest: (wh: WebhookResponse) => void;
  onEdit?: (wh: WebhookResponse) => void;
  onDelete: (wh: WebhookResponse) => void;
  onViewDeliveries: (wh: WebhookResponse) => void;
  hideEdit?: boolean;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">URL</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Events</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {loading ? (
            <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading…</td></tr>
          ) : webhooks.length === 0 ? (
            <tr><td colSpan={5} className="text-center py-8 text-gray-400">No webhooks yet.</td></tr>
          ) : webhooks.map((wh) => (
            <tr key={wh.uuid} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{wh.name}</td>
              <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px]">
                <span className="truncate block" title={wh.url}>{wh.url}</span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1 max-w-[200px]">
                  {wh.events.slice(0, 3).map((e) => <EventBadge key={e} event={e} />)}
                  {wh.events.length > 3 && (
                    <span className="text-[10px] text-gray-400">+{wh.events.length - 3} more</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3"><StatusBadge active={wh.is_active} /></td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button type="button" onClick={() => onViewDeliveries(wh)}
                    className="text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 px-2 py-1 rounded transition-colors">
                    Log
                  </button>
                  <button type="button" onClick={() => onTest(wh)}
                    className="text-xs text-blue-600 border border-blue-200 hover:bg-blue-50 px-2 py-1 rounded transition-colors">
                    Test
                  </button>
                  {!hideEdit && onEdit && (
                    <button type="button" onClick={() => onEdit(wh)}
                      className="text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 px-2 py-1 rounded transition-colors">
                      Edit
                    </button>
                  )}
                  <button type="button" onClick={() => onDelete(wh)}
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
  );
}

// ── Personal webhooks tab ─────────────────────────────────────────────────────

function PersonalWebhooksTab() {
  const toast = useToast();
  const [webhooks, setWebhooks] = useState<WebhookResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<WebhookResponse | null>(null);
  const [revealSecret, setRevealSecret] = useState<string | null>(null);
  const [drawerWebhook, setDrawerWebhook] = useState<WebhookResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await webhooksApi.listWebhooks();
      setWebhooks(data);
    } catch {
      toast.error('Failed to load webhooks');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data: Parameters<typeof webhooksApi.createWebhook>[0]) => {
    const { data: created } = await webhooksApi.createWebhook(data);
    setShowCreate(false);
    setRevealSecret((created as WebhookWithSecretResponse).secret);
    load();
  };

  const handleEdit = async (data: WebhookUpdate) => {
    if (!editing) return;
    await webhooksApi.updateWebhook(editing.uuid, data);
    setEditing(null);
    toast.success('Webhook updated');
    load();
  };

  const handleTest = async (wh: WebhookResponse) => {
    try {
      await webhooksApi.testWebhook(wh.uuid);
      toast.success('Test ping enqueued');
    } catch {
      toast.error('Failed to send test');
    }
  };

  const handleDelete = async (wh: WebhookResponse) => {
    if (!confirm(`Delete webhook "${wh.name}"?`)) return;
    try {
      await webhooksApi.deleteWebhook(wh.uuid);
      toast.success('Webhook deleted');
      load();
    } catch {
      toast.error('Failed to delete webhook');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Receive HTTP POST notifications when events occur in your vault.
        </p>
        <button type="button" onClick={() => setShowCreate(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + New Webhook
        </button>
      </div>

      <WebhookTable
        webhooks={webhooks}
        loading={loading}
        onTest={handleTest}
        onEdit={setEditing}
        onDelete={handleDelete}
        onViewDeliveries={setDrawerWebhook}
      />

      {showCreate && (
        <WebhookDialog
          onClose={() => setShowCreate(false)}
          onSave={handleCreate as Parameters<typeof WebhookDialog>[0]['onSave']}
        />
      )}
      {editing && (
        <WebhookDialog
          existing={editing}
          onClose={() => setEditing(null)}
          onSave={handleEdit as Parameters<typeof WebhookDialog>[0]['onSave']}
        />
      )}
      {revealSecret && (
        <SecretModal secret={revealSecret} onClose={() => setRevealSecret(null)} />
      )}
      {drawerWebhook && (
        <DeliveryDrawer
          webhookUuid={drawerWebhook.uuid}
          webhookName={drawerWebhook.name}
          onClose={() => setDrawerWebhook(null)}
        />
      )}
    </div>
  );
}

// ── Org webhooks tab ──────────────────────────────────────────────────────────

function OrgWebhooksTab() {
  const toast = useToast();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [webhooks, setWebhooks] = useState<WebhookResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [revealSecret, setRevealSecret] = useState<string | null>(null);
  const [drawerWebhook, setDrawerWebhook] = useState<WebhookResponse | null>(null);

  useEffect(() => {
    orgsApi.listOrgs()
      .then(({ data }) => {
        const adminOrgs = data.filter((o) => o.my_role === 'owner' || o.my_role === 'admin');
        setOrgs(adminOrgs);
        if (adminOrgs.length > 0) setSelectedOrg(adminOrgs[0].uuid);
      })
      .catch(() => toast.error('Failed to load organizations'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async (orgUuid: string) => {
    if (!orgUuid) return;
    setLoading(true);
    try {
      const { data } = await webhooksApi.listOrgWebhooks(orgUuid);
      setWebhooks(data);
    } catch {
      toast.error('Failed to load org webhooks');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (selectedOrg) load(selectedOrg); }, [load, selectedOrg]);

  if (orgs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        You are not an owner or admin of any organization.
      </div>
    );
  }

  const handleCreate = async (data: Parameters<typeof webhooksApi.createOrgWebhook>[1]) => {
    const { data: created } = await webhooksApi.createOrgWebhook(selectedOrg, data);
    setShowCreate(false);
    setRevealSecret((created as WebhookWithSecretResponse).secret);
    load(selectedOrg);
  };

  const handleTest = async (wh: WebhookResponse) => {
    try {
      await webhooksApi.testOrgWebhook(selectedOrg, wh.uuid);
      toast.success('Test ping enqueued');
    } catch {
      toast.error('Failed to send test');
    }
  };

  const handleDelete = async (wh: WebhookResponse) => {
    if (!confirm(`Delete webhook "${wh.name}"?`)) return;
    try {
      await webhooksApi.deleteOrgWebhook(selectedOrg, wh.uuid);
      toast.success('Webhook deleted');
      load(selectedOrg);
    } catch {
      toast.error('Failed to delete webhook');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Organization</label>
          <select
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {orgs.map((o) => (
              <option key={o.uuid} value={o.uuid}>{o.name}</option>
            ))}
          </select>
        </div>
        <button type="button" onClick={() => setShowCreate(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + New Org Webhook
        </button>
      </div>

      <WebhookTable
        webhooks={webhooks}
        loading={loading}
        onTest={handleTest}
        onDelete={handleDelete}
        onViewDeliveries={setDrawerWebhook}
        hideEdit
      />

      {showCreate && (
        <WebhookDialog
          onClose={() => setShowCreate(false)}
          onSave={handleCreate as Parameters<typeof WebhookDialog>[0]['onSave']}
        />
      )}
      {revealSecret && (
        <SecretModal secret={revealSecret} onClose={() => setRevealSecret(null)} />
      )}
      {drawerWebhook && (
        <DeliveryDrawer
          webhookUuid={drawerWebhook.uuid}
          webhookName={drawerWebhook.name}
          onClose={() => setDrawerWebhook(null)}
        />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'personal' | 'org';

export default function Webhooks() {
  const [tab, setTab] = useState<Tab>('personal');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'personal', label: 'Personal Webhooks' },
    { key: 'org',      label: 'Org Webhooks' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-purple-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
          <p className="text-sm text-gray-500">Event-driven HTTP notifications</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'personal' && <PersonalWebhooksTab />}
      {tab === 'org'      && <OrgWebhooksTab />}
    </div>
  );
}
