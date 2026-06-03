import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { RootState } from '../store';
import { DecryptedVaultItem } from '../store/slices/vaultSlice';
import {
  reportsApi,
  VaultHealthReport,
  BreachResult,
  ComplianceReport,
  ScheduledReport,
  ReportLog,
} from '../api/reportsApi';
import { orgsApi, OrgSummary } from '../api/orgsApi';
import { useToast } from '../components/ui/Toast';
import { computeSHA1, getHashPrefix, isWeakPassword } from '../utils/crypto';
import { ROUTES } from '../utils/constants';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'vault' | 'compliance' | 'scheduled';

interface AnalyzedItem {
  uuid: string;
  name: string;
  type: string;
  password: string;
  updatedAt: string | undefined;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString();
}

function daysSince(s: string | null | undefined): number {
  if (!s) return 9999;
  return Math.floor((Date.now() - new Date(s).getTime()) / 86400_000);
}

function scoreGrade(score: number): { grade: string; color: string; ring: string } {
  if (score >= 80) return { grade: 'A', color: 'text-green-600',  ring: 'stroke-green-500' };
  if (score >= 60) return { grade: 'B', color: 'text-yellow-600', ring: 'stroke-yellow-500' };
  if (score >= 40) return { grade: 'C', color: 'text-orange-600', ring: 'stroke-orange-500' };
  return                   { grade: 'F', color: 'text-red-600',   ring: 'stroke-red-500' };
}

// SVG score ring
function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const { grade, color, ring } = scoreGrade(score);
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="#e5e7eb" strokeWidth={10} />
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={10}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          className={ring} />
      </svg>
      <div className="text-center -mt-2">
        <p className={`text-3xl font-bold ${color}`}>{Math.round(score)}</p>
        <p className={`text-lg font-semibold ${color}`}>{grade}</p>
      </div>
    </div>
  );
}

// Metric card
function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mt-1">{label}</p>
    </div>
  );
}

// Expandable item list
function ItemList({
  title, items, emptyMsg, accent,
}: {
  title: string;
  items: { uuid: string; name: string; info?: string }[];
  emptyMsg: string;
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={`text-sm font-semibold ${accent}`}>{title}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            items.length > 0 ? `${accent} bg-opacity-10 bg-current` : 'bg-gray-100 text-gray-400'
          }`}>{items.length}</span>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {items.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400">{emptyMsg}</p>
          ) : items.map((item) => (
            <div key={item.uuid} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{item.name}</p>
                {item.info && <p className="text-xs text-gray-400">{item.info}</p>}
              </div>
              <button
                type="button"
                onClick={() => navigate(`${ROUTES.VAULT}`)}
                className="text-xs text-blue-600 border border-blue-200 hover:bg-blue-50 px-2.5 py-1 rounded-lg transition-colors"
              >
                Update
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab 1: Vault Health ───────────────────────────────────────────────────────

function VaultHealthTab() {
  const toast = useToast();
  const allItems = useSelector((s: RootState) => s.vault.items);
  const [serverReport, setServerReport] = useState<VaultHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [breachResults, setBreachResults] = useState<Map<string, number>>(new Map());
  const [breachLoading, setBreachLoading] = useState(false);
  const [score, setScore] = useState(100);

  // Only login items have passwords
  const loginItems = allItems.filter(
    (i): i is DecryptedVaultItem => i.type === 'login' && !i.deletedAt
  );

  // Extract password from itemData (the decrypted data structure)
  const getPassword = (item: DecryptedVaultItem): string => {
    const d = item.itemData as Record<string, unknown>;
    return (d.password as string) ?? '';
  };

  // Client-side analysis
  const weakItems = loginItems.filter((i) => {
    const pw = getPassword(i);
    return pw && isWeakPassword(pw);
  });

  // Reused passwords
  const pwMap = new Map<string, DecryptedVaultItem[]>();
  for (const item of loginItems) {
    const pw = getPassword(item);
    if (!pw) continue;
    const existing = pwMap.get(pw) ?? [];
    existing.push(item);
    pwMap.set(pw, existing);
  }
  const reusedGroups = [...pwMap.values()].filter((g) => g.length > 1);
  const reusedItems  = reusedGroups.flat();

  // Old passwords: not updated in >180 days
  const oldItems = allItems.filter(
    (i) => !i.deletedAt && daysSince(i.updatedAt ?? i.revisionDate) > 180
  );

  // Breached items
  const breachedItems = loginItems.filter(
    (i) => (breachResults.get(i.uuid) ?? 0) > 0
  );

  // Compute health score
  useEffect(() => {
    const deductions =
      weakItems.length * 2 +
      reusedItems.length * 2 +
      oldItems.length * 2 +
      breachedItems.length * 5;
    setScore(Math.max(0, 100 - deductions));
  }, [weakItems.length, reusedItems.length, oldItems.length, breachedItems.length]);

  useEffect(() => {
    reportsApi.getVaultHealthReport()
      .then(({ data }) => setServerReport(data))
      .catch(() => toast.error('Failed to load server-side report'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBreachCheck = useCallback(async () => {
    if (loginItems.length === 0) return;
    setBreachLoading(true);
    try {
      // Compute SHA-1 prefixes client-side for k-anonymity
      const items = await Promise.all(
        loginItems.map(async (item) => {
          const pw = getPassword(item);
          if (!pw) return null;
          const hash = await computeSHA1(pw);
          return { uuid: item.uuid, password_hash_prefix: getHashPrefix(hash) };
        })
      );
      const valid = items.filter((x): x is NonNullable<typeof x> => x !== null);
      if (!valid.length) return;

      const { data } = await reportsApi.checkBreaches(valid);
      const map = new Map<string, number>();
      for (const r of data.results) {
        map.set(r.uuid, r.pwned_count);
      }
      setBreachResults(map);
      if (data.breached === 0) {
        toast.success('No breached passwords found');
      } else {
        toast.error(`${data.breached} password(s) found in known data breaches`);
      }
    } catch {
      toast.error('Breach check failed — HIBP may be unavailable');
    } finally {
      setBreachLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginItems]);

  const handleExport = useCallback(() => {
    const report = {
      generated_at: new Date().toISOString(),
      score,
      total_items: allItems.filter((i) => !i.deletedAt).length,
      weak_passwords: weakItems.length,
      reused_passwords: reusedItems.length,
      old_passwords: oldItems.length,
      breached_passwords: breachedItems.length,
      server_stats: serverReport,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'vault-health-report.json'; a.click();
    URL.revokeObjectURL(url);
  }, [score, allItems, weakItems, reusedItems, oldItems, breachedItems, serverReport]);

  if (loading) return <div className="text-center py-16 text-gray-400 text-sm">Loading report…</div>;

  return (
    <div className="space-y-6">
      {/* Score + metrics */}
      <div className="flex flex-col sm:flex-row gap-6 items-center">
        <div className="flex flex-col items-center gap-1">
          <ScoreRing score={score} />
          <p className="text-xs text-gray-500 text-center mt-1">Overall Health Score</p>
        </div>
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
          <MetricCard label="Weak"     value={weakItems.length}     color="text-orange-600" />
          <MetricCard label="Reused"   value={reusedItems.length}   color="text-amber-600" />
          <MetricCard label="Old"      value={oldItems.length}       color="text-blue-600" />
          <MetricCard label="Exposed"  value={breachedItems.length}  color="text-red-600" />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={handleBreachCheck} disabled={breachLoading || loginItems.length === 0}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {breachLoading ? 'Checking breaches…' : 'Check for Breaches'}
        </button>
        <button type="button" onClick={handleExport}
          className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export Report
        </button>
      </div>

      {/* Server stats */}
      {serverReport && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          {Object.entries(serverReport.items_by_type).map(([type, count]) => (
            <div key={type}>
              <p className="text-lg font-bold text-gray-800">{count}</p>
              <p className="text-xs text-gray-500 capitalize">{type}s</p>
            </div>
          ))}
        </div>
      )}

      {/* Expandable sections */}
      <div className="space-y-3">
        <ItemList
          title="Weak Passwords"
          items={weakItems.map((i) => ({
            uuid: i.uuid,
            name: i.name,
            info: 'Too short, missing uppercase, digit, or special character',
          }))}
          emptyMsg="No weak passwords detected."
          accent="text-orange-600"
        />
        <ItemList
          title="Reused Passwords"
          items={reusedItems.map((i) => ({
            uuid: i.uuid,
            name: i.name,
            info: `Shared with ${(reusedGroups.find((g) => g.some((x) => x.uuid === i.uuid))?.length ?? 1) - 1} other item(s)`,
          }))}
          emptyMsg="No reused passwords detected."
          accent="text-amber-600"
        />
        <ItemList
          title="Old Passwords (>180 days)"
          items={oldItems.map((i) => ({
            uuid: i.uuid,
            name: i.name,
            info: `Last updated ${daysSince(i.updatedAt ?? i.revisionDate)} days ago`,
          }))}
          emptyMsg="All passwords updated within 180 days."
          accent="text-blue-600"
        />
        <ItemList
          title="Exposed Passwords (HIBP)"
          items={breachedItems.map((i) => ({
            uuid: i.uuid,
            name: i.name,
            info: `Found in ${breachResults.get(i.uuid)?.toLocaleString()} known breach records`,
          }))}
          emptyMsg={breachResults.size === 0
            ? 'Click "Check for Breaches" to scan against known data breaches.'
            : 'No breached passwords found.'}
          accent="text-red-600"
        />
      </div>
    </div>
  );
}

// ── Tab 2: Compliance ─────────────────────────────────────────────────────────

function ComplianceTab() {
  const toast = useToast();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [orgsLoading, setOrgsLoading] = useState(true);

  useEffect(() => {
    orgsApi.listOrgs()
      .then(({ data }) => {
        const adminOrgs = data.filter((o) => o.my_role === 'owner' || o.my_role === 'admin');
        setOrgs(adminOrgs);
        if (adminOrgs.length > 0) setSelectedOrg(adminOrgs[0].uuid);
      })
      .catch(() => toast.error('Failed to load organizations'))
      .finally(() => setOrgsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedOrg) return;
    setLoading(true);
    reportsApi.getComplianceReport(selectedOrg)
      .then(({ data }) => setReport(data))
      .catch(() => toast.error('Failed to load compliance report'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrg]);

  if (orgsLoading) return <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>;

  if (orgs.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        <p>Compliance reports require org owner or admin access.</p>
        <p className="mt-1">You are not an admin in any organization.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Org selector */}
      {orgs.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Organization:</label>
          <select value={selectedOrg} onChange={(e) => setSelectedOrg(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {orgs.map((o) => (
              <option key={o.uuid} value={o.uuid}>{o.name}</option>
            ))}
          </select>
        </div>
      )}

      {loading && <div className="text-center py-16 text-gray-400 text-sm">Generating report…</div>}

      {!loading && report && (
        <div className="space-y-6">
          {/* Score + header */}
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="flex flex-col items-center gap-1">
              <ScoreRing score={report.compliance_score} />
              <p className="text-xs text-gray-500 text-center mt-1">Compliance Score</p>
            </div>
            <div className="flex-1 space-y-2">
              <h2 className="text-xl font-bold text-gray-900">{report.org_name}</h2>
              <p className="text-sm text-gray-500">{report.total_members} accepted member{report.total_members !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {/* 2FA adoption */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700">Two-Factor Authentication</p>
              <span className="text-sm font-bold text-blue-600">{report.two_fa_adoption_pct}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${report.two_fa_adoption_pct}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {report.members_with_2fa} of {report.total_members} members have 2FA enabled
            </p>
          </div>

          {/* Active policies */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">
              Active Policies <span className="text-gray-400 font-normal">({report.policy_count} / 6)</span>
            </p>
            {report.active_policies.length === 0 ? (
              <p className="text-sm text-gray-400">No policies enabled for this organization.</p>
            ) : (
              <div className="space-y-1.5">
                {report.active_policies.map((p) => (
                  <div key={p} className="flex items-center gap-2 text-sm text-gray-700">
                    <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Collections */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MetricCard label="Total Collections" value={report.total_collections} color="text-blue-600" />
            <MetricCard label="Inactive Members (30d)" value={report.inactive_members.length} color="text-amber-600" />
          </div>

          {/* Inactive members */}
          {report.inactive_members.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700">Inactive Members (&gt;30 days)</p>
              </div>
              <div className="divide-y divide-gray-50">
                {report.inactive_members.map((m) => (
                  <div key={m.user_uuid} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold flex-shrink-0">
                      {m.user_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{m.user_name}</p>
                      <p className="text-xs text-gray-400 truncate">{m.user_email}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-500 capitalize">{m.role}</p>
                      <p className="text-xs text-gray-400">
                        {m.last_login_at ? `Last: ${fmtDate(m.last_login_at)}` : 'Never logged in'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Scheduled Reports ──────────────────────────────────────────────────

const REPORT_TYPES = [
  { value: 'vault_health',   label: 'Vault Health' },
  { value: 'breach_check',   label: 'Breach Check' },
  { value: 'inactive_users', label: 'Inactive Users' },
  { value: 'full_audit',     label: 'Full Audit' },
];

const FREQUENCIES = [
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const STATUS_COLORS: Record<string, string> = {
  generated: 'bg-blue-100 text-blue-700',
  sent:      'bg-green-100 text-green-700',
  failed:    'bg-red-100 text-red-600',
};

function NewReportModal({
  open,
  defaultEmail,
  onClose,
  onCreate,
}: {
  open: boolean;
  defaultEmail: string;
  onClose: () => void;
  onCreate: (type: string, freq: string, email: string) => Promise<void>;
}) {
  const [type, setType]   = useState('vault_health');
  const [freq, setFreq]   = useState('weekly');
  const [email, setEmail] = useState(defaultEmail);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await onCreate(type, freq, email); onClose(); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">New scheduled report</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Report type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {REPORT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
            <select value={freq} onChange={(e) => setFreq(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recipient email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors">
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ScheduledTab({ userEmail }: { userEmail: string }) {
  const toast = useToast();
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [logs, setLogs] = useState<ReportLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [rRes, lRes] = await Promise.all([
        reportsApi.getScheduledReports(),
        reportsApi.getReportLogs(),
      ]);
      setReports(rRes.data);
      setLogs(lRes.data);
    } catch {
      toast.error('Failed to load scheduled reports');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = useCallback(async (r: ScheduledReport) => {
    try {
      await reportsApi.updateScheduledReport(r.uuid, { enabled: !r.enabled });
      await load();
    } catch {
      toast.error('Failed to update report');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const handleCreate = useCallback(async (type: string, freq: string, email: string) => {
    try {
      await reportsApi.createScheduledReport({ report_type: type, frequency: freq, recipient_email: email });
      toast.success('Scheduled report created');
      await load();
    } catch {
      toast.error('Failed to create report');
      throw new Error('failed');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const handleDelete = useCallback(async (uuid: string) => {
    try {
      await reportsApi.deleteScheduledReport(uuid);
      toast.success('Report deleted');
      setConfirm(null);
      await load();
    } catch {
      toast.error('Failed to delete report');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const freqBadge = (f: string) => ({
    daily: 'bg-blue-100 text-blue-700',
    weekly: 'bg-purple-100 text-purple-700',
    monthly: 'bg-teal-100 text-teal-700',
  }[f] ?? 'bg-gray-100 text-gray-600');

  if (loading) return <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="space-y-8">
      {/* Scheduled reports list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Scheduled Reports</h3>
          <button type="button" onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New report
          </button>
        </div>

        {reports.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl px-6 py-10 text-center text-sm text-gray-400">
            No scheduled reports yet. Create one to receive automated reports by email.
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div key={r.uuid} className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => handleToggle(r)}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent
                    transition-colors duration-200 cursor-pointer focus:outline-none
                    ${r.enabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow
                    transition duration-200 ${r.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">
                      {REPORT_TYPES.find((t) => t.value === r.report_type)?.label ?? r.report_type}
                    </p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${freqBadge(r.frequency)}`}>
                      {r.frequency}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {r.recipient_email}
                    {r.last_sent_at ? ` · Last sent ${fmtDate(r.last_sent_at)}` : ' · Never sent'}
                    {r.next_send_at ? ` · Next: ${fmtDate(r.next_send_at)}` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => setConfirm(r.uuid)}
                  className="flex-shrink-0 text-xs text-red-600 border border-red-200 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors">
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Report logs */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Report Log</h3>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {logs.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-gray-400">No report logs yet.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {logs.map((l) => (
                <div key={l.uuid} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {REPORT_TYPES.find((t) => t.value === l.report_type)?.label ?? l.report_type}
                    </p>
                    {l.error_message && (
                      <p className="text-xs text-red-500 truncate">{l.error_message}</p>
                    )}
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[l.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {l.status}
                  </span>
                  <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                    {fmtDate(l.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirm(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6">
            <p className="text-sm text-gray-700 mb-6">Delete this scheduled report?</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirm(null)}
                className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={() => handleDelete(confirm)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 rounded-lg transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      <NewReportModal
        open={modalOpen}
        defaultEmail={userEmail}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Reports() {
  const user = useSelector((s: RootState) => s.auth.user);
  const [tab, setTab] = useState<Tab>('vault');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'vault',      label: 'Vault Health' },
    { key: 'compliance', label: 'Compliance' },
    { key: 'scheduled',  label: 'Scheduled Reports' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500">Security analysis, compliance, and scheduled reports</p>
        </div>
      </div>

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

      {tab === 'vault'      && <VaultHealthTab />}
      {tab === 'compliance' && <ComplianceTab />}
      {tab === 'scheduled'  && <ScheduledTab userEmail={user?.email ?? ''} />}
    </div>
  );
}
