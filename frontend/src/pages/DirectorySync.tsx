import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../components/ui/Toast';
import { orgsApi, OrgSummary } from '../api/orgsApi';
import {
  directoryApi,
  DirectoryConfigResponse,
  DirectoryConfigCreate,
  DirectorySyncLogResponse,
  DirectorySyncUserResponse,
  SyncPreviewResponse,
} from '../api/directoryApi';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  return new Date(s).toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: 'bg-green-100 text-green-700',
    partial: 'bg-amber-100 text-amber-700',
    failed:  'bg-red-100  text-red-600',
    active:  'bg-green-100 text-green-700',
    deactivated: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

// ── Preview modal ─────────────────────────────────────────────────────────────

function PreviewModal({ preview, onClose }: { preview: SyncPreviewResponse; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Sync Preview (Dry Run)</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{preview.users_to_add}</p>
            <p className="text-xs text-green-600 mt-1">To Add</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{preview.users_to_update}</p>
            <p className="text-xs text-blue-600 mt-1">To Update</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-red-700">{preview.users_to_deactivate}</p>
            <p className="text-xs text-red-600 mt-1">To Deactivate</p>
          </div>
        </div>
        {preview.sample_adds.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Sample additions</p>
            <ul className="space-y-0.5">
              {preview.sample_adds.map((e) => <li key={e} className="text-sm text-gray-700 font-mono">{e}</li>)}
            </ul>
          </div>
        )}
        {preview.sample_deactivations.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Sample deactivations</p>
            <ul className="space-y-0.5">
              {preview.sample_deactivations.map((e) => <li key={e} className="text-sm text-gray-700 font-mono">{e}</li>)}
            </ul>
          </div>
        )}
        <button type="button" onClick={onClose}
          className="w-full border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
          Close
        </button>
      </div>
    </div>
  );
}

// ── Configuration tab ─────────────────────────────────────────────────────────

function ConfigTab({ orgUuid, cfg, onSaved }: {
  orgUuid: string;
  cfg: DirectoryConfigResponse | null;
  onSaved: (c: DirectoryConfigResponse) => void;
}) {
  const toast = useToast();
  const [syncType, setSyncType] = useState<DirectoryConfigCreate['sync_type']>(cfg?.sync_type ?? 'ldap');
  const [isActive, setIsActive] = useState(cfg?.is_active ?? false);
  const [saving, setSaving] = useState(false);

  // LDAP fields
  const [ldapHost, setLdapHost] = useState(cfg?.ldap_host ?? '');
  const [ldapPort, setLdapPort] = useState(String(cfg?.ldap_port ?? 389));
  const [ldapBindDn, setLdapBindDn] = useState(cfg?.ldap_bind_dn ?? '');
  const [ldapBindPw, setLdapBindPw] = useState('');
  const [ldapBaseDn, setLdapBaseDn] = useState(cfg?.ldap_base_dn ?? '');
  const [ldapFilter, setLdapFilter] = useState(cfg?.ldap_user_filter ?? '(objectClass=person)');
  const [ldapSsl, setLdapSsl] = useState(cfg?.ldap_use_ssl ?? false);

  // Azure fields
  const [azureTenantId, setAzureTenantId] = useState(cfg?.azure_tenant_id ?? '');
  const [azureClientId, setAzureClientId] = useState(cfg?.azure_client_id ?? '');
  const [azureClientSecret, setAzureClientSecret] = useState('');
  const [azureGroupFilter, setAzureGroupFilter] = useState(cfg?.azure_group_filter ?? '');

  // Google fields
  const [googleDomain, setGoogleDomain] = useState(cfg?.google_domain ?? '');
  const [googleAdminEmail, setGoogleAdminEmail] = useState(cfg?.google_admin_email ?? '');

  // Interval
  const [intervalHours, setIntervalHours] = useState(String(cfg?.sync_interval_hours ?? 24));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: DirectoryConfigCreate = {
        sync_type: syncType,
        is_active: isActive,
        sync_interval_hours: Number(intervalHours) || 24,
        ...(syncType === 'ldap' && {
          ldap_host: ldapHost, ldap_port: Number(ldapPort), ldap_bind_dn: ldapBindDn,
          ldap_bind_password: ldapBindPw || undefined, ldap_base_dn: ldapBaseDn,
          ldap_user_filter: ldapFilter, ldap_use_ssl: ldapSsl,
        }),
        ...(syncType === 'azure_ad' && {
          azure_tenant_id: azureTenantId, azure_client_id: azureClientId,
          azure_client_secret: azureClientSecret || undefined, azure_group_filter: azureGroupFilter,
        }),
        ...(syncType === 'google_workspace' && {
          google_domain: googleDomain, google_admin_email: googleAdminEmail,
        }),
      };
      const { data } = await directoryApi.upsertConfig(orgUuid, payload);
      onSaved(data);
      toast.success('Configuration saved');
    } catch {
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-5 max-w-lg">
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sync type</label>
          <select value={syncType}
            onChange={(e) => setSyncType(e.target.value as DirectoryConfigCreate['sync_type'])}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="ldap">LDAP / Active Directory</option>
            <option value="azure_ad">Azure AD</option>
            <option value="google_workspace">Google Workspace</option>
            <option value="csv">CSV Upload</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setIsActive((p) => !p)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ${isActive ? 'bg-blue-600' : 'bg-gray-200'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${isActive ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
          <span className="text-sm text-gray-700">{isActive ? 'Enabled' : 'Disabled'}</span>
        </div>
      </div>

      {syncType === 'ldap' && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">LDAP Settings</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
              <input value={ldapHost} onChange={(e) => setLdapHost(e.target.value)} placeholder="ldap.example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
              <input type="number" value={ldapPort} onChange={(e) => setLdapPort(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bind DN</label>
            <input value={ldapBindDn} onChange={(e) => setLdapBindDn(e.target.value)} placeholder="cn=admin,dc=example,dc=com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bind password</label>
            <input type="password" value={ldapBindPw} onChange={(e) => setLdapBindPw(e.target.value)}
              placeholder={cfg?.ldap_bind_dn ? '••••••••' : 'Password'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Base DN</label>
            <input value={ldapBaseDn} onChange={(e) => setLdapBaseDn(e.target.value)} placeholder="dc=example,dc=com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">User filter</label>
            <input value={ldapFilter} onChange={(e) => setLdapFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={ldapSsl} onChange={(e) => setLdapSsl(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-gray-700">Use SSL/TLS</span>
          </label>
        </div>
      )}

      {syncType === 'azure_ad' && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Azure AD Settings</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tenant ID</label>
            <input value={azureTenantId} onChange={(e) => setAzureTenantId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
            <input value={azureClientId} onChange={(e) => setAzureClientId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client secret</label>
            <input type="password" value={azureClientSecret} onChange={(e) => setAzureClientSecret(e.target.value)}
              placeholder={cfg?.azure_client_id ? '••••••••' : 'Secret'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Group filter <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input value={azureGroupFilter} onChange={(e) => setAzureGroupFilter(e.target.value)}
              placeholder="e.g. OPSVAULT-Users"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      )}

      {syncType === 'google_workspace' && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Google Workspace Settings</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
            <input value={googleDomain} onChange={(e) => setGoogleDomain(e.target.value)} placeholder="example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin email</label>
            <input type="email" value={googleAdminEmail} onChange={(e) => setGoogleAdminEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      )}

      {syncType === 'csv' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          CSV sync doesn't require configuration here. Upload a CSV from the Sync tab.
          <br />
          Required columns: <code className="font-mono">email</code>, optional: <code className="font-mono">display_name</code>, <code className="font-mono">external_id</code>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Sync interval (hours)</label>
        <input type="number" min={1} max={168} value={intervalHours}
          onChange={(e) => setIntervalHours(e.target.value)}
          className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <button type="submit" disabled={saving}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
        {saving ? 'Saving…' : 'Save Configuration'}
      </button>
    </form>
  );
}

// ── Sync tab ──────────────────────────────────────────────────────────────────

function SyncTab({ orgUuid, cfg }: { orgUuid: string; cfg: DirectoryConfigResponse | null }) {
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<SyncPreviewResponse | null>(null);
  const [logs, setLogs] = useState<DirectorySyncLogResponse[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [lastLog, setLastLog] = useState<DirectorySyncLogResponse | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const { data } = await directoryApi.getLogs(orgUuid);
      setLogs(data);
    } catch {
      toast.error('Failed to load sync logs');
    } finally {
      setLogsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgUuid]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data } = await directoryApi.triggerSync(orgUuid);
      setLastLog(data);
      toast.success(`Sync complete — ${data.users_added} added, ${data.users_updated} updated, ${data.users_deactivated} deactivated`);
      loadLogs();
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const { data } = await directoryApi.previewSync(orgUuid);
      setPreview(data);
    } catch {
      toast.error('Preview failed');
    } finally {
      setPreviewing(false);
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSyncing(true);
    try {
      const { data } = await directoryApi.uploadCsv(orgUuid, file);
      setLastLog(data);
      toast.success(`CSV sync complete — ${data.users_added} added`);
      loadLogs();
    } catch {
      toast.error('CSV sync failed');
    } finally {
      setSyncing(false);
      if (csvRef.current) csvRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Last synced */}
      {cfg?.last_synced_at && (
        <p className="text-sm text-gray-500">
          Last synced: <span className="font-medium text-gray-700">{fmtDate(cfg.last_synced_at)}</span>
        </p>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        {cfg?.sync_type !== 'csv' && (
          <>
            <button type="button" onClick={handleSync} disabled={syncing}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {syncing ? 'Syncing…' : 'Run Sync Now'}
            </button>
            <button type="button" onClick={handlePreview} disabled={previewing}
              className="border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {previewing ? 'Loading…' : 'Preview Sync'}
            </button>
          </>
        )}
        {cfg?.sync_type === 'csv' && (
          <div>
            <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
            <button type="button" disabled={syncing}
              onClick={() => csvRef.current?.click()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {syncing ? 'Uploading…' : 'Upload CSV'}
            </button>
          </div>
        )}
      </div>

      {/* Last sync result */}
      {lastLog && (
        <div className={`p-4 rounded-lg border text-sm ${
          lastLog.status === 'success' ? 'bg-green-50 border-green-200 text-green-800'
          : lastLog.status === 'partial' ? 'bg-amber-50 border-amber-200 text-amber-800'
          : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <span className="font-semibold capitalize">{lastLog.status}</span>
          {' — '}{lastLog.users_added} added, {lastLog.users_updated} updated, {lastLog.users_deactivated} deactivated
          {lastLog.errors && Array.isArray(lastLog.errors) && lastLog.errors.length > 0 && (
            <p className="mt-1 text-xs opacity-80">{(lastLog.errors as string[]).slice(0, 3).join('; ')}</p>
          )}
        </div>
      )}

      {/* Sync logs */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Sync History</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Started</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Added</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Updated</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Deactivated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {logsLoading ? (
              <tr><td colSpan={5} className="text-center py-6 text-gray-400">Loading…</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-6 text-gray-400">No sync history yet.</td></tr>
            ) : logs.map((log) => (
              <tr key={log.uuid} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(log.started_at)}</td>
                <td className="px-4 py-3"><StatusBadge status={log.status} /></td>
                <td className="px-4 py-3 text-xs text-gray-700">{log.users_added}</td>
                <td className="px-4 py-3 text-xs text-gray-700">{log.users_updated}</td>
                <td className="px-4 py-3 text-xs text-gray-700">{log.users_deactivated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview && <PreviewModal preview={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab({ orgUuid }: { orgUuid: string }) {
  const toast = useToast();
  const [users, setUsers] = useState<DirectorySyncUserResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    directoryApi.getUsers(orgUuid)
      .then(({ data }) => setUsers(data))
      .catch(() => toast.error('Failed to load directory users'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgUuid]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Display Name</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">External ID</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Linked</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Seen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {loading ? (
            <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading…</td></tr>
          ) : users.length === 0 ? (
            <tr><td colSpan={6} className="text-center py-8 text-gray-400">No directory users synced yet.</td></tr>
          ) : users.map((u) => (
            <tr key={u.uuid} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm text-gray-900">{u.email}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{u.display_name || '—'}</td>
              <td className="px-4 py-3 font-mono text-xs text-gray-500 max-w-[140px] truncate">{u.external_id}</td>
              <td className="px-4 py-3">
                {u.user_id
                  ? <span className="text-[10px] bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">Linked</span>
                  : <span className="text-[10px] bg-gray-100 text-gray-500 font-semibold px-2 py-0.5 rounded-full">Unlinked</span>
                }
              </td>
              <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
              <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(u.last_seen_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'configuration' | 'sync' | 'users';

export default function DirectorySync() {
  const toast = useToast();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [cfg, setCfg] = useState<DirectoryConfigResponse | null>(null);
  const [tab, setTab] = useState<Tab>('configuration');

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

  useEffect(() => {
    if (!selectedOrg) return;
    directoryApi.getConfig(selectedOrg)
      .then(({ data }) => setCfg(data))
      .catch(() => setCfg(null));
  }, [selectedOrg]);

  if (orgs.length === 0) {
    return (
      <div className="p-6 text-center text-gray-400 text-sm">
        You are not an owner or admin of any organization.
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'configuration', label: 'Configuration' },
    { key: 'sync',          label: 'Sync' },
    { key: 'users',         label: 'Users' },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-indigo-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Directory Sync</h1>
          <p className="text-sm text-gray-500">Sync users from LDAP, Azure AD, Google Workspace, or CSV</p>
        </div>
      </div>

      {/* Org selector */}
      {orgs.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Organization</label>
          <select value={selectedOrg} onChange={(e) => setSelectedOrg(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {orgs.map((o) => <option key={o.uuid} value={o.uuid}>{o.name}</option>)}
          </select>
        </div>
      )}

      {/* Tabs */}
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

      {tab === 'configuration' && <ConfigTab orgUuid={selectedOrg} cfg={cfg} onSaved={setCfg} />}
      {tab === 'sync'          && <SyncTab   orgUuid={selectedOrg} cfg={cfg} />}
      {tab === 'users'         && <UsersTab  orgUuid={selectedOrg} />}
    </div>
  );
}
