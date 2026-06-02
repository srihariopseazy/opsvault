import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { orgsApi, OrgDetail as OrgDetailData, OrgMemberInfo } from '../api/orgsApi';
import { collectionsApi } from '../api/collectionsApi';
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

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'members' | 'collections';

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
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(['members', 'collections'] as Tab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t}
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
