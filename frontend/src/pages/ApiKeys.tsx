import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { useToast } from '../components/ui/Toast';
import {
  apiKeysApi,
  ApiKeyResponse,
  ApiKeyCreatedResponse,
  OrgApiKeyResponse,
  OrgApiKeyCreatedResponse,
} from '../api/apiKeysApi';
import { orgsApi, OrgSummary } from '../api/orgsApi';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString();
}

function ScopeBadge({ scope }: { scope: string }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${
      scope === 'write' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
    }`}>
      {scope}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
      active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
    }`}>
      {active ? 'Active' : 'Revoked'}
    </span>
  );
}

// ── Reveal modal (shown once after create/rotate) ─────────────────────────────

function RevealModal({
  fullKey,
  onClose,
}: {
  fullKey: string;
  onClose: () => void;
}) {
  const toast = useToast();

  const copy = async () => {
    await navigator.clipboard.writeText(fullKey);
    toast.success('API key copied to clipboard');
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
            <h2 className="text-base font-semibold text-gray-900">Your new API key</h2>
            <p className="text-sm text-red-600 mt-0.5 font-medium">
              Store this key now — it will never be shown again.
            </p>
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 font-mono text-xs text-gray-800 break-all select-all">
          {fullKey}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={copy}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            Copy to clipboard
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50"
          >
            I've saved it
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create key dialog ─────────────────────────────────────────────────────────

function CreateKeyDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (fullKey: string) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read']);
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleScope = (scope: string) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (scopes.length === 0) { toast.error('Select at least one scope'); return; }
    setSaving(true);
    try {
      const { data } = await apiKeysApi.createKey({
        name: name.trim(),
        scopes,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      onCreated(data.full_key);
    } catch {
      toast.error('Failed to create API key');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Create API Key</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CI/CD pipeline"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Scopes</label>
            <div className="flex gap-4">
              {['read', 'write'].map((scope) => (
                <label key={scope} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 capitalize">{scope}</span>
                  <span className="text-xs text-gray-400">
                    {scope === 'read' ? '(GET only)' : '(all methods)'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Expiry <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors">
              {saving ? 'Creating…' : 'Create Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Personal keys tab ─────────────────────────────────────────────────────────

function PersonalKeysTab() {
  const toast = useToast();
  const [keys, setKeys] = useState<ApiKeyResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiKeysApi.listKeys();
      setKeys(data);
    } catch {
      toast.error('Failed to load API keys');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRevoke = async (uuid: string, name: string) => {
    if (!confirm(`Revoke key "${name}"? This cannot be undone.`)) return;
    try {
      await apiKeysApi.revokeKey(uuid);
      toast.success('Key revoked');
      load();
    } catch {
      toast.error('Failed to revoke key');
    }
  };

  const handleRotate = async (uuid: string) => {
    if (!confirm('Rotate this key? The current key will stop working immediately.')) return;
    try {
      const { data } = await apiKeysApi.rotateKey(uuid);
      setRevealKey(data.full_key);
      load();
    } catch {
      toast.error('Failed to rotate key');
    }
  };

  const handleCreated = (fullKey: string) => {
    setShowCreate(false);
    setRevealKey(fullKey);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Use <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">Authorization: ApiKey ovk_…</code> in API requests.
        </p>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New Key
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prefix</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Scopes</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Expires</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Used</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">Loading…</td></tr>
            ) : keys.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">No API keys yet.</td></tr>
            ) : keys.map((k) => (
              <tr key={k.uuid} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{k.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{k.key_prefix}…</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {k.scopes.map((s) => <ScopeBadge key={s} scope={s} />)}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(k.expires_at)}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(k.last_used_at)}</td>
                <td className="px-4 py-3"><StatusBadge active={k.is_active} /></td>
                <td className="px-4 py-3">
                  {k.is_active && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleRotate(k.uuid)}
                        className="text-xs text-blue-600 border border-blue-200 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                      >
                        Rotate
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevoke(k.uuid, k.name)}
                        className="text-xs text-red-600 border border-red-200 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateKeyDialog onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
      {revealKey && (
        <RevealModal fullKey={revealKey} onClose={() => setRevealKey(null)} />
      )}
    </div>
  );
}

// ── Org key create dialog ─────────────────────────────────────────────────────

function CreateOrgKeyDialog({
  orgUuid,
  onClose,
  onCreated,
}: {
  orgUuid: string;
  onClose: () => void;
  onCreated: (fullKey: string) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read']);
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleScope = (scope: string) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (scopes.length === 0) { toast.error('Select at least one scope'); return; }
    setSaving(true);
    try {
      const { data } = await apiKeysApi.createOrgKey(orgUuid, {
        name: name.trim(),
        scopes,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      onCreated(data.full_key);
    } catch {
      toast.error('Failed to create org API key');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Create Org API Key</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Automation token"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Scopes</label>
            <div className="flex gap-4">
              {['read', 'write'].map((scope) => (
                <label key={scope} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 capitalize">{scope}</span>
                  <span className="text-xs text-gray-400">
                    {scope === 'read' ? '(GET only)' : '(all methods)'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Expiry <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors">
              {saving ? 'Creating…' : 'Create Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Org keys tab ──────────────────────────────────────────────────────────────

function OrgKeysTab() {
  const toast = useToast();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [keys, setKeys] = useState<OrgApiKeyResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);

  useEffect(() => {
    orgsApi.listOrgs()
      .then(({ data }) => {
        const adminOrgs = data.filter(
          (o) => o.my_role === 'owner' || o.my_role === 'admin'
        );
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
      const { data } = await apiKeysApi.listOrgKeys(orgUuid);
      setKeys(data);
    } catch {
      toast.error('Failed to load org API keys');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (selectedOrg) load(selectedOrg); }, [load, selectedOrg]);

  const handleRevoke = async (keyUuid: string, name: string) => {
    if (!confirm(`Revoke key "${name}"?`)) return;
    try {
      await apiKeysApi.revokeOrgKey(selectedOrg, keyUuid);
      toast.success('Key revoked');
      load(selectedOrg);
    } catch {
      toast.error('Failed to revoke key');
    }
  };

  const handleRotate = async (keyUuid: string) => {
    if (!confirm('Rotate this key? The current key will stop working immediately.')) return;
    try {
      const { data } = await apiKeysApi.rotateOrgKey(selectedOrg, keyUuid);
      setRevealKey(data.full_key);
      load(selectedOrg);
    } catch {
      toast.error('Failed to rotate key');
    }
  };

  if (orgs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        You are not an owner or admin of any organization.
      </div>
    );
  }

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
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New Org Key
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prefix</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Scopes</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Expires</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Used</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">Loading…</td></tr>
            ) : keys.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">No org API keys yet.</td></tr>
            ) : keys.map((k) => (
              <tr key={k.uuid} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{k.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{k.key_prefix}…</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {k.scopes.map((s) => <ScopeBadge key={s} scope={s} />)}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(k.expires_at)}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(k.last_used_at)}</td>
                <td className="px-4 py-3"><StatusBadge active={k.is_active} /></td>
                <td className="px-4 py-3">
                  {k.is_active && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleRotate(k.uuid)}
                        className="text-xs text-blue-600 border border-blue-200 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                      >
                        Rotate
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevoke(k.uuid, k.name)}
                        className="text-xs text-red-600 border border-red-200 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateOrgKeyDialog
          orgUuid={selectedOrg}
          onClose={() => setShowCreate(false)}
          onCreated={(fullKey) => {
            setShowCreate(false);
            setRevealKey(fullKey);
            load(selectedOrg);
          }}
        />
      )}
      {revealKey && (
        <RevealModal fullKey={revealKey} onClose={() => setRevealKey(null)} />
      )}
    </div>
  );
}

// ── CLI Setup tab ─────────────────────────────────────────────────────────────

function CodeLine({ children }: { children: string }) {
  const toast = useToast();
  const copy = async () => {
    await navigator.clipboard.writeText(children);
    toast.success('Copied!');
  };
  return (
    <div className="flex items-center justify-between bg-gray-900 text-green-400 font-mono text-xs rounded-lg px-4 py-2.5 gap-3">
      <span className="truncate">{children}</span>
      <button type="button" onClick={copy}
        className="text-gray-400 hover:text-white transition-colors flex-shrink-0 text-[10px] border border-gray-600 px-1.5 py-0.5 rounded">
        copy
      </button>
    </div>
  );
}

function CliSetupTab() {
  const toast = useToast();
  const [cliKey, setCliKey] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const serverUrl = (import.meta.env?.VITE_API_URL ?? 'http://178.105.94.101:8080').replace('/api/v1', '');

  const generateCliKey = async () => {
    setGenerating(true);
    try {
      const { data } = await apiKeysApi.createKey({
        name: 'CLI',
        scopes: ['read', 'write'],
        expires_at: null,
      });
      setCliKey(data.full_key);
    } catch {
      toast.error('Failed to generate CLI token');
    } finally {
      setGenerating(false);
    }
  };

  const copyKey = async () => {
    if (!cliKey) return;
    await navigator.clipboard.writeText(cliKey);
    toast.success('API key copied');
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Installation */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-3">Installation</h3>
        <div className="space-y-2">
          <p className="text-xs text-gray-500 mb-3">Install the CLI globally via npm, or build from source:</p>
          <CodeLine>npm install -g opsvault-cli</CodeLine>
          <p className="text-xs text-gray-400 mt-1 mb-1">— or build from source —</p>
          <CodeLine>cd cli && npm install && npm run build && npm link</CodeLine>
        </div>
      </div>

      {/* Generate CLI token */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-1">CLI Token</h3>
        <p className="text-sm text-gray-500 mb-4">
          Generate a dedicated API key for the CLI. You'll use it with <code className="bg-gray-100 px-1 rounded text-xs">ovault login --key</code> to skip the key-creation step.
        </p>

        {cliKey ? (
          <div className="space-y-3">
            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 font-mono text-xs text-gray-700 break-all select-all">
              {cliKey}
            </div>
            <p className="text-sm font-medium text-gray-700">Run this to log in:</p>
            <CodeLine>{`ovault login --server ${serverUrl} --key ${cliKey}`}</CodeLine>
            <div className="flex gap-2">
              <button type="button" onClick={copyKey}
                className="text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                Copy key
              </button>
              <p className="text-xs text-amber-700 self-center">
                Store this key now — it won't be shown again.
              </p>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={generateCliKey}
            disabled={generating}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {generating ? 'Generating…' : 'Generate CLI Token'}
          </button>
        )}
      </div>

      {/* Quick start */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-3">Quick Start</h3>
        <div className="space-y-2">
          {[
            ['List all vault items',         'ovault list'],
            ['Search by name',               'ovault list --search github'],
            ['Show item details',            'ovault get "GitHub"'],
            ['Copy password to clipboard',   'ovault copy "GitHub"'],
            ['Add new item (interactive)',   'ovault add'],
            ['Generate a strong password',   'ovault generate --length 32'],
            ['Export vault to JSON',         'ovault export --output backup.json'],
          ].map(([desc, cmd]) => (
            <div key={cmd}>
              <p className="text-xs text-gray-400 mb-0.5"># {desc}</p>
              <CodeLine>{cmd}</CodeLine>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'personal' | 'org' | 'cli';

export default function ApiKeys() {
  const [tab, setTab] = useState<Tab>('personal');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'personal', label: 'Personal Keys' },
    { key: 'org',      label: 'Org Keys' },
    { key: 'cli',      label: 'CLI Setup' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="text-sm text-gray-500">Manage programmatic access to OPSVAULT</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'personal' && <PersonalKeysTab />}
      {tab === 'org'      && <OrgKeysTab />}
      {tab === 'cli'      && <CliSetupTab />}
    </div>
  );
}
