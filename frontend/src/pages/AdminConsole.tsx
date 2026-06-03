import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { RootState } from '../store';
import { adminApi, AdminUser, AdminOrg, PlatformEvent, PlatformStats } from '../api/adminApi';
import { smtpApi, SmtpConfig, SmtpConfigUpdate, EmailLog } from '../api/smtpApi';
import { apiKeysApi, AdminOrgApiKey } from '../api/apiKeysApi';
import { useToast } from '../components/ui/Toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString();
}

function fmtDateShort(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString();
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color = 'blue' }: { label: string; value: number; color?: string }) {
  const colors: Record<string, string> = {
    blue:   'bg-blue-50 text-blue-700',
    green:  'bg-green-50 text-green-700',
    red:    'bg-red-50 text-red-700',
    purple: 'bg-purple-50 text-purple-700',
    amber:  'bg-amber-50 text-amber-700',
    gray:   'bg-gray-50 text-gray-700',
    teal:   'bg-teal-50 text-teal-700',
  };
  return (
    <div className={`rounded-xl p-5 ${colors[color] ?? colors.blue}`}>
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
      <p className="text-xs font-medium mt-1 opacity-80 uppercase tracking-wide">{label}</p>
    </div>
  );
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({
  open, message, onConfirm, onCancel,
}: {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6">
        <p className="text-sm text-gray-700 mb-6">{message}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel}
            className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={onConfirm}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 rounded-lg transition-colors">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ stats }: { stats: PlatformStats | null }) {
  if (!stats) return <div className="text-center py-10 text-gray-400 text-sm">Loading stats…</div>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      <StatCard label="Total Users"      value={stats.total_users}      color="blue" />
      <StatCard label="Active Users"     value={stats.active_users}     color="green" />
      <StatCard label="Disabled Users"   value={stats.disabled_users}   color="red" />
      <StatCard label="Total Orgs"       value={stats.total_orgs}       color="purple" />
      <StatCard label="Vault Items"      value={stats.total_vault_items} color="teal" />
      <StatCard label="Active Sessions"  value={stats.active_sessions}  color="amber" />
      <StatCard label="Collections"      value={stats.total_collections} color="gray" />
      <StatCard label="Send Items"       value={stats.total_sends}       color="blue" />
    </div>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab() {
  const toast = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [skip, setSkip] = useState(0);
  const [confirm, setConfirm] = useState<{ msg: string; fn: () => Promise<void> } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string, offset: number) => {
    setLoading(true);
    try {
      const { data } = await adminApi.listUsers({ search: q || undefined, skip: offset, limit: 50 });
      setUsers(data);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(search, skip), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, skip]);

  const withConfirm = (msg: string, fn: () => Promise<void>) =>
    setConfirm({ msg, fn });

  const action = async (fn: () => Promise<void>) => {
    try { await fn(); await load(search, skip); }
    catch { toast.error('Action failed'); }
  };

  return (
    <div className="space-y-4">
      <input type="search" placeholder="Search by name or email…" value={search}
        onChange={(e) => { setSearch(e.target.value); setSkip(0); }}
        className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">2FA</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Orgs</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Login</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">No users found.</td></tr>
            ) : users.map((u) => (
              <tr key={u.uuid} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900 truncate max-w-[180px]">{u.name}</p>
                  <p className="text-xs text-gray-400 truncate max-w-[180px]">{u.email}</p>
                  {u.is_superuser && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">superuser</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${u.totp_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {u.totp_enabled ? 'On' : 'Off'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{u.org_memberships.length}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{fmtDateShort(u.last_login_at)}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {u.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {u.is_active ? (
                      <button type="button" onClick={() => withConfirm(`Disable ${u.email}?`, async () => { await adminApi.disableUser(u.uuid); await action(async () => {}); })}
                        className="text-xs text-amber-600 border border-amber-200 hover:bg-amber-50 px-2 py-1 rounded transition-colors">
                        Disable
                      </button>
                    ) : (
                      <button type="button" onClick={() => action(async () => { await adminApi.enableUser(u.uuid); })}
                        className="text-xs text-green-700 border border-green-200 hover:bg-green-50 px-2 py-1 rounded transition-colors">
                        Enable
                      </button>
                    )}
                    <button type="button" onClick={() => action(async () => { await adminApi.forceLogout(u.uuid); toast.success('Sessions terminated'); })}
                      className="text-xs text-gray-600 border border-gray-200 hover:bg-gray-50 px-2 py-1 rounded transition-colors">
                      Logout
                    </button>
                    <button type="button" onClick={() => action(async () => {
                        const { data } = await adminApi.impersonateUser(u.uuid);
                        await navigator.clipboard.writeText(data.temp_token);
                        toast.success(`Impersonation token copied (${data.expires_in / 60}m)`);
                      })}
                      className="text-xs text-blue-600 border border-blue-200 hover:bg-blue-50 px-2 py-1 rounded transition-colors">
                      Impersonate
                    </button>
                    <button type="button" onClick={() => withConfirm(`Permanently delete ${u.email}? This cannot be undone.`, async () => { await adminApi.deleteUser(u.uuid); await load(search, skip); })}
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

      {users.length === 50 && (
        <div className="flex gap-2">
          {skip > 0 && (
            <button type="button" onClick={() => setSkip((p) => Math.max(0, p - 50))}
              className="text-sm text-blue-600 hover:underline">← Prev</button>
          )}
          <button type="button" onClick={() => setSkip((p) => p + 50)}
            className="text-sm text-blue-600 hover:underline">Next →</button>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        message={confirm?.msg ?? ''}
        onConfirm={async () => {
          if (confirm) { await confirm.fn(); }
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

// ── Organizations tab ─────────────────────────────────────────────────────────

function OrgsTab() {
  const toast = useToast();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [skip, setSkip] = useState(0);
  const [confirm, setConfirm] = useState<{ msg: string; fn: () => Promise<void> } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string, offset: number) => {
    setLoading(true);
    try {
      const { data } = await adminApi.listOrgs({ search: q || undefined, skip: offset, limit: 50 });
      setOrgs(data);
    } catch {
      toast.error('Failed to load organizations');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(search, skip), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, skip]);

  const action = async (fn: () => Promise<void>) => {
    try { await fn(); await load(search, skip); }
    catch { toast.error('Action failed'); }
  };

  return (
    <div className="space-y-4">
      <input type="search" placeholder="Search by name…" value={search}
        onChange={(e) => { setSearch(e.target.value); setSkip(0); }}
        className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Owner</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Members</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Collections</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">Loading…</td></tr>
            ) : orgs.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">No organizations found.</td></tr>
            ) : orgs.map((org) => (
              <tr key={org.uuid} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{org.name}</td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px] truncate">{org.owner_email}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{org.member_count}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{org.collection_count}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{fmtDateShort(org.created_at)}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${org.is_suspended ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                    {org.is_suspended ? 'Suspended' : 'Active'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {org.is_suspended ? (
                      <button type="button" onClick={() => action(async () => { await adminApi.reactivateOrg(org.uuid); toast.success('Reactivated'); })}
                        className="text-xs text-green-700 border border-green-200 hover:bg-green-50 px-2 py-1 rounded transition-colors">
                        Reactivate
                      </button>
                    ) : (
                      <button type="button" onClick={() => setConfirm({ msg: `Suspend "${org.name}"?`, fn: async () => { await adminApi.suspendOrg(org.uuid); await load(search, skip); } })}
                        className="text-xs text-red-600 border border-red-200 hover:bg-red-50 px-2 py-1 rounded transition-colors">
                        Suspend
                      </button>
                    )}
                    <button type="button" onClick={() => navigate(`/admin/orgs/${org.uuid}`)}
                      className="text-xs text-blue-600 border border-blue-200 hover:bg-blue-50 px-2 py-1 rounded transition-colors">
                      View
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {orgs.length === 50 && (
        <div className="flex gap-2">
          {skip > 0 && (
            <button type="button" onClick={() => setSkip((p) => Math.max(0, p - 50))}
              className="text-sm text-blue-600 hover:underline">← Prev</button>
          )}
          <button type="button" onClick={() => setSkip((p) => p + 50)}
            className="text-sm text-blue-600 hover:underline">Next →</button>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        message={confirm?.msg ?? ''}
        onConfirm={async () => { if (confirm) { await confirm.fn(); } setConfirm(null); }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

// ── Event Log tab ─────────────────────────────────────────────────────────────

const EVENT_TYPE_COLORS: Record<string, string> = {
  user_login:         'bg-green-100 text-green-700',
  user_logout:        'bg-gray-100 text-gray-600',
  user_created:       'bg-blue-100 text-blue-700',
  user_deleted:       'bg-red-100 text-red-600',
  user_disabled:      'bg-amber-100 text-amber-700',
  user_enabled:       'bg-green-100 text-green-700',
  org_created:        'bg-blue-100 text-blue-700',
  org_suspended:      'bg-red-100 text-red-600',
  org_reactivated:    'bg-green-100 text-green-700',
  vault_item_created: 'bg-teal-100 text-teal-700',
  vault_item_deleted: 'bg-red-100 text-red-600',
  policy_changed:     'bg-purple-100 text-purple-700',
  admin_impersonate:  'bg-orange-100 text-orange-700',
  admin_login:        'bg-blue-100 text-blue-700',
};

function EventLogTab() {
  const toast = useToast();
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [skip, setSkip] = useState(0);
  const [filterType, setFilterType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    try {
      const { data } = await adminApi.getPlatformEvents({
        event_type: filterType || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        skip: offset,
        limit: 50,
      });
      setEvents(data);
    } catch {
      toast.error('Failed to load events');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, dateFrom, dateTo]);

  useEffect(() => { load(skip); }, [load, skip]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setSkip(0); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">All event types</option>
          {Object.keys(EVENT_TYPE_COLORS).map((et) => (
            <option key={et} value={et}>{et.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <input type="datetime-local" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setSkip(0); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="datetime-local" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setSkip(0); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Timestamp</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Event</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actor</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading…</td></tr>
            ) : events.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No events found.</td></tr>
            ) : events.map((e) => (
              <tr key={e.uuid} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(e.created_at)}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${EVENT_TYPE_COLORS[e.event_type] ?? 'bg-gray-100 text-gray-600'}`}>
                    {e.event_type.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px] truncate">
                  {e.actor_email ?? e.actor_uuid ?? '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px] truncate">
                  {e.target_user_email ?? e.target_org_name ?? e.target_user_uuid ?? '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{e.ip_address ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(events.length === 50 || skip > 0) && (
        <div className="flex gap-2">
          {skip > 0 && (
            <button type="button" onClick={() => setSkip((p) => Math.max(0, p - 50))}
              className="text-sm text-blue-600 hover:underline">← Prev</button>
          )}
          {events.length === 50 && (
            <button type="button" onClick={() => setSkip((p) => p + 50)}
              className="text-sm text-blue-600 hover:underline">Next →</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Email Settings tab ────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  sent:    'bg-green-100 text-green-700',
  failed:  'bg-red-100 text-red-600',
  skipped: 'bg-gray-100 text-gray-500',
};

function Toggle({
  checked, onChange, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent
        transition-colors duration-200 cursor-pointer focus:outline-none disabled:opacity-50
        ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200
        ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
}

function EmailSettingsTab() {
  const toast = useToast();
  const [cfg, setCfg] = useState<SmtpConfig | null>(null);
  const [form, setForm] = useState<SmtpConfigUpdate>({});
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logSkip, setLogSkip] = useState(0);
  const [logStatus, setLogStatus] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    smtpApi.getSmtpConfig()
      .then(({ data }) => { setCfg(data); setForm({}); })
      .catch(() => toast.error('Failed to load SMTP config'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLogs = useCallback(async (skip: number, status: string) => {
    setLogsLoading(true);
    try {
      const { data } = await smtpApi.getEmailLogs({
        status: status || undefined, skip, limit: 50,
      });
      setLogs(data.items);
      setLogsTotal(data.total);
    } catch {
      toast.error('Failed to load email logs');
    } finally {
      setLogsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadLogs(logSkip, logStatus); }, [loadLogs, logSkip, logStatus]);

  const merge = (patch: SmtpConfigUpdate) => setForm((f) => ({ ...f, ...patch }));

  const val = <K extends keyof SmtpConfig>(key: K): SmtpConfig[K] =>
    ((form as Record<string, unknown>)[key] !== undefined
      ? (form as Record<string, unknown>)[key]
      : cfg
        ? cfg[key]
        : undefined) as SmtpConfig[K];

  const handleSave = async () => {
    if (Object.keys(form).length === 0) return;
    setSaving(true);
    try {
      const { data } = await smtpApi.updateSmtpConfig(form);
      setCfg(data);
      setForm({});
      toast.success('SMTP configuration saved');
    } catch {
      toast.error('Failed to save SMTP config');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail.trim()) { toast.error('Enter a recipient email'); return; }
    setTesting(true);
    try {
      const { data } = await smtpApi.testSmtp(testEmail.trim());
      if (data.success) toast.success(data.message);
      else toast.error(data.message);
    } catch {
      toast.error('Test failed');
    } finally {
      setTesting(false);
    }
  };

  if (!cfg) return <div className="text-center py-10 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="space-y-8">
      {/* SMTP Configuration */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        <h3 className="text-base font-semibold text-gray-900 border-b border-gray-100 pb-3">SMTP Configuration</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
            <input value={val('host') as string} onChange={(e) => merge({ host: e.target.value })}
              placeholder="smtp.gmail.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
            <input type="number" value={val('port') as number} onChange={(e) => merge({ port: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input value={val('username') as string} onChange={(e) => merge({ username: e.target.value })}
              placeholder="user@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" value={(form.password !== undefined ? form.password : '')}
              onChange={(e) => merge({ password: e.target.value })}
              placeholder={cfg.password ? '••••••••' : 'Not set'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
            <input value={val('from_email') as string} onChange={(e) => merge({ from_email: e.target.value })}
              placeholder="noreply@opsvault.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Name</label>
            <input value={val('from_name') as string} onChange={(e) => merge({ from_name: e.target.value })}
              placeholder="OPSVAULT"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="flex flex-wrap gap-6 pt-1">
          <div className="flex items-center gap-3">
            <Toggle checked={val('use_tls') as boolean} onChange={(v) => merge({ use_tls: v })} />
            <span className="text-sm text-gray-700">Use TLS (STARTTLS)</span>
          </div>
          <div className="flex items-center gap-3">
            <Toggle checked={val('use_ssl') as boolean} onChange={(v) => merge({ use_ssl: v })} />
            <span className="text-sm text-gray-700">Use SSL</span>
          </div>
          <div className="flex items-center gap-3">
            <Toggle checked={val('enabled') as boolean} onChange={(v) => merge({ enabled: v })} />
            <span className="text-sm text-gray-700">Enable SMTP</span>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="button" onClick={handleSave} disabled={saving || Object.keys(form).length === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
            {saving ? 'Saving…' : 'Save Configuration'}
          </button>
        </div>

        {/* Test email */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Send test email</p>
          <div className="flex gap-2 max-w-sm">
            <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)}
              placeholder="recipient@example.com"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="button" onClick={handleTest} disabled={testing || !testEmail.trim()}
              className="bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap">
              {testing ? 'Sending…' : 'Send Test'}
            </button>
          </div>
        </div>
      </div>

      {/* Email Log */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <h3 className="text-base font-semibold text-gray-900 flex-1">Email Log</h3>
          <select value={logStatus} onChange={(e) => { setLogStatus(e.target.value); setLogSkip(0); }}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="skipped">Skipped</option>
          </select>
          <span className="text-xs text-gray-400">{logsTotal} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Timestamp</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">To</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Subject</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Template</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logsLoading ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No email logs yet.</td></tr>
              ) : logs.map((log) => (
                <tr key={log.uuid} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 max-w-[160px] truncate">{log.to_email}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px] truncate" title={log.subject}>{log.subject}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{log.template}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${STATUS_COLORS[log.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-red-500 max-w-[180px] truncate" title={log.error_message ?? ''}>
                    {log.error_message ? log.error_message.split('\n')[0] : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {logsTotal > 50 && (
          <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
            {logSkip > 0 && (
              <button type="button" onClick={() => setLogSkip((p) => Math.max(0, p - 50))}
                className="text-sm text-blue-600 hover:underline">← Prev</button>
            )}
            {logs.length === 50 && (
              <button type="button" onClick={() => setLogSkip((p) => p + 50)}
                className="text-sm text-blue-600 hover:underline">Next →</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Admin API Keys tab ────────────────────────────────────────────────────────

function AdminApiKeysTab() {
  const toast = useToast();
  const [keys, setKeys] = useState<AdminOrgApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<{ msg: string; fn: () => Promise<void> } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiKeysApi.adminListAllOrgKeys();
      setKeys(data);
    } catch {
      toast.error('Failed to load org API keys');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRevoke = (orgUuid: string, keyUuid: string, name: string) => {
    setConfirm({
      msg: `Revoke key "${name}"? This cannot be undone.`,
      fn: async () => {
        await apiKeysApi.revokeOrgKey(orgUuid, keyUuid);
        toast.success('Key revoked');
        await load();
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Org</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Key Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prefix</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Scopes</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Used</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created By</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Loading…</td></tr>
            ) : keys.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">No org API keys found.</td></tr>
            ) : keys.map((k) => (
              <tr key={k.uuid} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs text-gray-700 font-medium">{k.org_name}</td>
                <td className="px-4 py-3 text-xs text-gray-900">{k.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{k.key_prefix}…</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {k.scopes.map((s) => (
                      <span key={s} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                        s === 'write' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                      }`}>{s}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(k.last_used_at)}</td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px] truncate">{k.created_by_email}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    k.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                  }`}>
                    {k.is_active ? 'Active' : 'Revoked'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {k.is_active && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(k.org_id, k.uuid, k.name)}
                      className="text-xs text-red-600 border border-red-200 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!confirm}
        message={confirm?.msg ?? ''}
        onConfirm={async () => { if (confirm) { await confirm.fn(); } setConfirm(null); }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'users' | 'organizations' | 'events' | 'email' | 'apikeys';

export default function AdminConsole() {
  const navigate = useNavigate();
  const user = useSelector((s: RootState) => s.auth.user);
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<PlatformStats | null>(null);

  useEffect(() => {
    if (user && !user.is_superuser) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (tab === 'overview') {
      adminApi.getStats().then(({ data }) => setStats(data)).catch(() => {});
    }
  }, [tab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview',      label: 'Overview' },
    { key: 'users',         label: 'Users' },
    { key: 'organizations', label: 'Organizations' },
    { key: 'events',        label: 'Event Log' },
    { key: 'email',         label: 'Email Settings' },
    { key: 'apikeys',       label: 'API Keys' },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Console</h1>
          <p className="text-sm text-gray-500">Platform administration</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview'      && <OverviewTab stats={stats} />}
      {tab === 'users'         && <UsersTab />}
      {tab === 'organizations' && <OrgsTab />}
      {tab === 'events'        && <EventLogTab />}
      {tab === 'email'         && <EmailSettingsTab />}
      {tab === 'apikeys'       && <AdminApiKeysTab />}
    </div>
  );
}
