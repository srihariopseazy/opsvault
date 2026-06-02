import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { orgsApi, OrgSummary, PendingInvite } from '../api/orgsApi';
import { useToast } from '../components/ui/Toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  owner:  'bg-purple-100 text-purple-700',
  admin:  'bg-blue-100 text-blue-700',
  member: 'bg-gray-100 text-gray-600',
};

function roleBadge(role: string) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-600'}`}>
      {role}
    </span>
  );
}

// ── Create org modal ──────────────────────────────────────────────────────────

function CreateOrgModal({
  open,
  onClose,
  onCreate,
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
        <h2 className="text-base font-semibold text-gray-900 mb-4">Create organization</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Organization name</label>
            <input
              type="text"
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Acme Corp"
            />
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Organizations() {
  const navigate = useNavigate();
  const toast = useToast();

  const [orgs, setOrgs]       = useState<OrgSummary[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [respondingUuid, setRespondingUuid] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orgsRes, invitesRes] = await Promise.all([
        orgsApi.listOrgs(),
        orgsApi.listPendingInvites(),
      ]);
      setOrgs(orgsRes.data);
      setInvites(invitesRes.data);
    } catch {
      toast.error('Failed to load organizations');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = useCallback(async (name: string) => {
    try {
      const { data } = await orgsApi.createOrg({ name });
      setOrgs((prev) => [data, ...prev]);
      toast.success(`Organization "${data.name}" created`);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Failed to create organization';
      toast.error(msg);
      throw err;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAccept = useCallback(async (inviteUuid: string) => {
    setRespondingUuid(inviteUuid);
    try {
      await orgsApi.acceptInvite(inviteUuid);
      toast.success('Invite accepted');
      await load();
    } catch {
      toast.error('Failed to accept invite');
    } finally {
      setRespondingUuid(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const handleReject = useCallback(async (inviteUuid: string) => {
    setRespondingUuid(inviteUuid);
    try {
      await orgsApi.rejectInvite(inviteUuid);
      setInvites((prev) => prev.filter((i) => i.uuid !== inviteUuid));
      toast.success('Invite rejected');
    } catch {
      toast.error('Failed to reject invite');
    } finally {
      setRespondingUuid(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
          <p className="text-gray-500 text-sm mt-1">Collaborate with your team.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New organization
        </button>
      </div>

      {/* Pending invites banner */}
      {invites.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-800">
            You have {invites.length} pending invite{invites.length !== 1 ? 's' : ''}
          </p>
          {invites.map((inv) => (
            <div key={inv.uuid} className="flex items-center justify-between gap-4 bg-white border border-amber-100 rounded-lg px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{inv.org_name}</p>
                <p className="text-xs text-gray-400">
                  Role: <span className="capitalize">{inv.role}</span>
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  disabled={respondingUuid === inv.uuid}
                  onClick={() => handleAccept(inv.uuid)}
                  className="text-xs font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
                >
                  Accept
                </button>
                <button
                  type="button"
                  disabled={respondingUuid === inv.uuid}
                  onClick={() => handleReject(inv.uuid)}
                  className="text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Org list */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : orgs.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No organizations yet.{' '}
          <button onClick={() => setCreateOpen(true)} className="text-blue-600 hover:underline">
            Create one
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {orgs.map((org) => (
            <button
              key={org.uuid}
              type="button"
              onClick={() => navigate(`/organizations/${org.uuid}`)}
              className="text-left bg-white border border-gray-200 hover:border-blue-300 hover:shadow-sm rounded-xl p-5 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{org.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {org.member_count} member{org.member_count !== 1 ? 's' : ''}
                  </p>
                </div>
                {roleBadge(org.my_role)}
              </div>
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

      <CreateOrgModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}
