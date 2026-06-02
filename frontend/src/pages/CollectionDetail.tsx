import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { collectionsApi, CollectionDetail as CollectionDetailData } from '../api/collectionsApi';
import { orgsApi, OrgMemberInfo } from '../api/orgsApi';
import { decryptWithKey } from '../crypto/cryptoEngine';
import { useToast } from '../components/ui/Toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACCESS_COLORS: Record<string, string> = {
  write: 'bg-blue-100 text-blue-700',
  read:  'bg-gray-100 text-gray-500',
  admin: 'bg-purple-100 text-purple-700',
};

const TYPE_COLORS: Record<string, string> = {
  login:    'bg-blue-100 text-blue-700',
  note:     'bg-green-100 text-green-700',
  card:     'bg-purple-100 text-purple-700',
  identity: 'bg-orange-100 text-orange-700',
};

// ── Add member modal ──────────────────────────────────────────────────────────

function AddMemberModal({
  open, orgMembers, onClose, onAdd,
}: {
  open: boolean;
  orgMembers: OrgMemberInfo[];
  onClose: () => void;
  onAdd: (userUuid: string, access: string) => Promise<void>;
}) {
  const [userUuid, setUserUuid] = useState('');
  const [access, setAccess]     = useState('read');
  const [saving, setSaving]     = useState(false);

  const accepted = orgMembers.filter((m) => m.status === 'accepted');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userUuid) return;
    setSaving(true);
    try { await onAdd(userUuid, access); setUserUuid(''); setAccess('read'); onClose(); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Add member to collection</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Member</label>
            <select value={userUuid} onChange={(e) => setUserUuid(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="" disabled>Select a member</option>
              {accepted.map((m) => (
                <option key={m.user_uuid} value={m.user_uuid}>
                  {m.user_name} ({m.user_email})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Access level</label>
            <select value={access} onChange={(e) => setAccess(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="read">Read</option>
              <option value="write">Write</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || !userUuid}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors">
              {saving ? 'Adding…' : 'Add member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Add item modal ────────────────────────────────────────────────────────────

function AddItemModal({
  open, onClose, onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (itemUuid: string) => Promise<void>;
}) {
  const [itemUuid, setItemUuid] = useState('');
  const [saving, setSaving]     = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemUuid.trim()) return;
    setSaving(true);
    try { await onAdd(itemUuid.trim()); setItemUuid(''); onClose(); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Add vault item to collection</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vault item UUID</label>
            <input type="text" autoFocus required value={itemUuid}
              onChange={(e) => setItemUuid(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            <p className="text-xs text-gray-400 mt-1">Find the UUID in your vault item details.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || !itemUuid.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors">
              {saving ? 'Adding…' : 'Add item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Decrypted item name ───────────────────────────────────────────────────────

function DecryptedItemName({
  encryptedName, symmetricKey,
}: {
  encryptedName: string;
  symmetricKey: string | null;
}) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!symmetricKey || !encryptedName) {
      setName(null);
      return;
    }
    decryptWithKey(encryptedName, symmetricKey)
      .then(setName)
      .catch(() => setName(null));
  }, [encryptedName, symmetricKey]);

  if (name !== null) return <span className="text-sm font-medium text-gray-900 truncate">{name}</span>;
  return <span className="text-sm text-gray-400 font-mono truncate text-xs">[encrypted]</span>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'items' | 'members';

export default function CollectionDetail() {
  const { uuid, colUuid } = useParams<{ uuid: string; colUuid: string }>();
  const navigate           = useNavigate();
  const toast              = useToast();
  const symmetricKey       = useSelector((s: RootState) => s.vault.symmetricKey);

  const [detail, setDetail]           = useState<CollectionDetailData | null>(null);
  const [orgMembers, setOrgMembers]   = useState<OrgMemberInfo[]>([]);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState<Tab>('items');
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addItemOpen, setAddItemOpen]     = useState(false);
  const [removingUuid, setRemovingUuid]   = useState<string | null>(null);

  const canManage = detail?.my_access === 'admin';
  const canWrite  = detail?.my_access === 'write' || canManage;

  const load = useCallback(async () => {
    if (!colUuid || !uuid) return;
    setLoading(true);
    try {
      const [detailRes, orgRes] = await Promise.all([
        collectionsApi.getCollection(colUuid),
        orgsApi.getOrg(uuid),
      ]);
      setDetail(detailRes.data);
      setOrgMembers(orgRes.data.members);
    } catch {
      toast.error('Failed to load collection');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colUuid, uuid]);

  useEffect(() => { load(); }, [load]);

  const handleAddMember = useCallback(async (userUuid: string, access: string) => {
    if (!colUuid) return;
    try {
      await collectionsApi.addMember(colUuid, { user_uuid: userUuid, access });
      toast.success('Member added');
      await load();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Failed to add member';
      toast.error(msg);
      throw err;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colUuid, load]);

  const handleRemoveMember = useCallback(async (memberUuid: string) => {
    if (!colUuid) return;
    setRemovingUuid(memberUuid);
    try {
      await collectionsApi.removeMember(colUuid, memberUuid);
      toast.success('Member removed');
      await load();
    } catch {
      toast.error('Failed to remove member');
    } finally {
      setRemovingUuid(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colUuid, load]);

  const handleAddItem = useCallback(async (itemUuid: string) => {
    if (!colUuid) return;
    try {
      await collectionsApi.addItem(colUuid, { item_uuid: itemUuid });
      toast.success('Item added to collection');
      await load();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Failed to add item';
      toast.error(msg);
      throw err;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colUuid, load]);

  const handleRemoveItem = useCallback(async (itemUuid: string) => {
    if (!colUuid) return;
    setRemovingUuid(itemUuid);
    try {
      await collectionsApi.removeItem(colUuid, itemUuid);
      toast.success('Item removed from collection');
      await load();
    } catch {
      toast.error('Failed to remove item');
    } finally {
      setRemovingUuid(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colUuid, load]);

  if (loading) {
    return <div className="p-6 text-center text-gray-400 text-sm">Loading…</div>;
  }
  if (!detail) {
    return <div className="p-6 text-center text-gray-400 text-sm">Collection not found.</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button type="button" onClick={() => navigate(`/organizations/${uuid}`)}
          className="text-xs text-gray-400 hover:text-gray-600 mb-1">
          ← Organization
        </button>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">{detail.name}</h1>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${ACCESS_COLORS[detail.my_access] ?? 'bg-gray-100 text-gray-600'}`}>
            {detail.my_access}
          </span>
        </div>
        <p className="text-gray-500 text-sm mt-1">
          {detail.items.length} item{detail.items.length !== 1 ? 's' : ''} · {detail.members.length} member{detail.members.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(['items', 'members'] as Tab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Items tab ─────────────────────────────────────────────────────────── */}
      {tab === 'items' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {canWrite && (
            <div className="px-6 py-3 border-b border-gray-100 flex justify-end">
              <button type="button" onClick={() => setAddItemOpen(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add item
              </button>
            </div>
          )}
          {detail.items.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">No items in this collection yet.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {detail.items.map((item) => (
                <div key={item.uuid} className="flex items-center gap-3 px-6 py-3">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${TYPE_COLORS[item.item_type] ?? 'bg-gray-100 text-gray-600'}`}>
                    {item.item_type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <DecryptedItemName encryptedName={item.item_name} symmetricKey={symmetricKey} />
                    <p className="text-[10px] text-gray-300 font-mono mt-0.5">{item.item_uuid}</p>
                  </div>
                  {canWrite && (
                    <button type="button"
                      onClick={() => handleRemoveItem(item.item_uuid)}
                      disabled={removingUuid === item.item_uuid}
                      className="flex-shrink-0 text-xs text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 px-2.5 py-1 rounded-lg transition-colors">
                      {removingUuid === item.item_uuid ? '…' : 'Remove'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Members tab ───────────────────────────────────────────────────────── */}
      {tab === 'members' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {canManage && (
            <div className="px-6 py-3 border-b border-gray-100 flex justify-end">
              <button type="button" onClick={() => setAddMemberOpen(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add member
              </button>
            </div>
          )}
          {detail.members.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">No members assigned yet.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {detail.members.map((m) => (
                <div key={m.uuid} className="flex items-center gap-3 px-6 py-4">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold flex-shrink-0">
                    {m.user_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.user_name}</p>
                    <p className="text-xs text-gray-400 truncate">{m.user_email}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize flex-shrink-0 ${ACCESS_COLORS[m.access] ?? 'bg-gray-100 text-gray-600'}`}>
                    {m.access}
                  </span>
                  {canManage && (
                    <button type="button" onClick={() => handleRemoveMember(m.uuid)}
                      disabled={removingUuid === m.uuid}
                      className="flex-shrink-0 text-xs text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 px-2.5 py-1 rounded-lg transition-colors">
                      {removingUuid === m.uuid ? '…' : 'Remove'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AddMemberModal
        open={addMemberOpen}
        orgMembers={orgMembers}
        onClose={() => setAddMemberOpen(false)}
        onAdd={handleAddMember}
      />
      <AddItemModal
        open={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        onAdd={handleAddItem}
      />
    </div>
  );
}
