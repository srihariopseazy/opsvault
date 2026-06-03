import { useCallback, useEffect, useState } from 'react';
import { emergencyApi, EmergencyAccessInfo } from '../api/emergencyApi';
import { useToast } from '../components/ui/Toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  invited:            'Pending',
  accepted:           'Active',
  rejected:           'Rejected',
  recovery_initiated: 'Recovery in progress',
  recovery_approved:  'Access granted',
};

const STATUS_COLORS: Record<string, string> = {
  invited:            'bg-amber-100 text-amber-700',
  accepted:           'bg-green-100 text-green-700',
  rejected:           'bg-red-100 text-red-600',
  recovery_initiated: 'bg-blue-100 text-blue-700',
  recovery_approved:  'bg-purple-100 text-purple-700',
};

// ── Invite modal ──────────────────────────────────────────────────────────────

function InviteModal({
  open, onClose, onInvite,
}: {
  open: boolean;
  onClose: () => void;
  onInvite: (email: string, type: string, days: number) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [type, setType]   = useState('view');
  const [days, setDays]   = useState(7);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    try { await onInvite(email.trim(), type, days); setEmail(''); setType('view'); setDays(7); onClose(); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Add trusted contact</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Their email address</label>
            <input type="email" autoFocus required value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="contact@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Access type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="view">View — read-only access to vault</option>
              <option value="takeover">Takeover — full account access</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Wait period: <span className="font-bold text-blue-600">{days} day{days !== 1 ? 's' : ''}</span>
            </label>
            <input type="range" min={1} max={90} value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full accent-blue-600" />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>1 day</span><span>90 days</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              You have this many days to reject a recovery request after it's initiated.
            </p>
          </div>
          <div className="flex gap-2 pt-1">
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

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'trusted' | 'trusting';

export default function EmergencyAccess() {
  const toast = useToast();
  const [records, setRecords] = useState<EmergencyAccessInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('trusted');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [actingUuid, setActingUuid] = useState<string | null>(null);

  // The current user's UUID is embedded in the record as grantor_uuid or grantee_uuid
  // We determine "my side" by checking who initiated

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await emergencyApi.list();
      setRecords(data);
    } catch {
      toast.error('Failed to load emergency access records');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleInvite = useCallback(async (email: string, type: string, days: number) => {
    try {
      await emergencyApi.invite({ email, type, wait_time_days: days });
      toast.success('Emergency access invite sent');
      await load();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Failed to send invite';
      toast.error(msg);
      throw err;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const act = useCallback(async (
    uuid: string,
    action: () => Promise<unknown>,
    successMsg: string,
  ) => {
    setActingUuid(uuid);
    try {
      await action();
      toast.success(successMsg);
      await load();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Action failed';
      toast.error(msg);
    } finally {
      setActingUuid(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // Partition: trusted = records where I'm grantor; trusting = records where I'm grantee
  // We detect by checking if grantor_uuid is in localStorage (current user) — but we don't
  // easily have the current user UUID here. Instead we infer from a side flag.
  // Since the API returns records for both sides, we can use a heuristic:
  // If grantee_uuid === grantor_uuid, it's ambiguous. We split by checking if the record
  // has grantor_email that matches the current user.
  // Simplest: split into two tabs by trusting whether grantee_email is not null (I'm grantor)
  // Actually, the API returns both roles for the user. We'll split based on the tab label.
  // For now: "People I trust" = I'm the grantor. "Trusting me" = I'm the grantee.
  // We'll show all records under both tabs and label them appropriately.

  const granted  = records.filter((r) => r.grantee_uuid !== null && r.grantee_name !== null);
  const grantedTo = records.filter((r) => r.grantor_uuid !== null && r.grantor_name !== null);

  // Since records can appear in both (the API returns both sides), let's be smarter:
  // If I'm the grantor → show in "trusted" tab
  // If I'm the grantee → show in "trusting" tab
  // The API always returns grantor/grantee info. I'm the grantor when grantor_uuid corresponds
  // to me. We don't have the user's uuid here easily. Let's just show all records in both tabs
  // and filter by whether grantee or grantor fields are non-null which they always will be.
  // Better approach: show all in "People I trust" (grantor) where the record has my side as grantor.
  // Since the backend returns records where user is EITHER grantor or grantee, we need to
  // determine which role the current user plays. We can check the existing auth store for user UUID.

  const currentUserEmail = (() => {
    try {
      const auth = JSON.parse(localStorage.getItem('opsvault_auth') || '{}') as { user?: { email?: string } };
      return auth?.user?.email ?? '';
    } catch { return ''; }
  })();

  const myGranted   = records.filter((r) => r.grantor_email === currentUserEmail);
  const trustedByOthers = records.filter((r) => r.grantee_email === currentUserEmail);

  const visible = tab === 'trusted' ? myGranted : trustedByOthers;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Emergency Access</h1>
          <p className="text-gray-500 text-sm mt-1">
            Allow trusted contacts to access your vault in emergencies.
          </p>
        </div>
        {tab === 'trusted' && (
          <button type="button" onClick={() => setInviteOpen(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add trusted contact
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {([['trusted', 'People I trust'], ['trusting', 'Trusting me']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Records */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">
            {tab === 'trusted'
              ? 'No trusted contacts yet. Add someone to give them emergency access.'
              : 'Nobody has designated you as their emergency contact yet.'}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {visible.map((r) => {
              const contact = tab === 'trusted'
                ? { name: r.grantee_name, email: r.grantee_email }
                : { name: r.grantor_name, email: r.grantor_email };
              const busy = actingUuid === r.uuid;
              return (
                <div key={r.uuid} className="px-6 py-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-sm font-bold flex-shrink-0">
                    {(contact.name ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
                    <p className="text-xs text-gray-400 truncate">{contact.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5 capitalize">
                      Type: {r.type} · Wait: {r.wait_time_days}d
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>

                  {/* Grantee actions */}
                  {tab === 'trusting' && r.status === 'invited' && (
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button type="button" disabled={busy} onClick={() => act(r.uuid, () => emergencyApi.accept(r.uuid), 'Invite accepted')}
                        className="text-xs font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-2.5 py-1 rounded-lg transition-colors">
                        Accept
                      </button>
                      <button type="button" disabled={busy} onClick={() => act(r.uuid, () => emergencyApi.reject(r.uuid), 'Invite rejected')}
                        className="text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 px-2.5 py-1 rounded-lg transition-colors">
                        Reject
                      </button>
                    </div>
                  )}
                  {tab === 'trusting' && r.status === 'accepted' && (
                    <button type="button" disabled={busy} onClick={() => act(r.uuid, () => emergencyApi.initiate(r.uuid), 'Recovery request initiated')}
                      className="flex-shrink-0 text-xs font-medium bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-2.5 py-1 rounded-lg transition-colors">
                      {busy ? '…' : 'Request access'}
                    </button>
                  )}

                  {/* Grantor actions */}
                  {tab === 'trusted' && r.status === 'recovery_initiated' && (
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button type="button" disabled={busy} onClick={() => act(r.uuid, () => emergencyApi.approve(r.uuid), 'Access approved')}
                        className="text-xs font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-2.5 py-1 rounded-lg transition-colors">
                        Approve
                      </button>
                      <button type="button" disabled={busy} onClick={() => act(r.uuid, () => emergencyApi.rejectRecovery(r.uuid), 'Recovery rejected')}
                        className="text-xs font-medium border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 px-2.5 py-1 rounded-lg transition-colors">
                        Deny
                      </button>
                    </div>
                  )}
                  {tab === 'trusted' && (
                    <button type="button" disabled={busy} onClick={() => act(r.uuid, () => emergencyApi.remove(r.uuid), 'Access removed')}
                      className="flex-shrink-0 text-xs text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 px-2.5 py-1 rounded-lg transition-colors">
                      {busy ? '…' : 'Remove'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} onInvite={handleInvite} />
    </div>
  );
}
