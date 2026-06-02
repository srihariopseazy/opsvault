import { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store';
import { DecryptedVaultItem, setItems } from '../store/slices/vaultSlice';
import { vaultApi } from '../api/vaultApi';
import { decryptWithKey } from '../crypto/cryptoEngine';
import { useToast } from '../components/ui/Toast';
import { getItemSubtitle, getFaviconUrl } from '../utils/helpers';
import { ViewItemModal } from '../components/vault/ViewItemModal';

export default function Trash() {
  const dispatch = useDispatch<AppDispatch>();
  const toast = useToast();
  const symmetricKey = useSelector((s: RootState) => s.vault.symmetricKey);
  const allItems = useSelector((s: RootState) => s.vault.items);

  const [trashItems, setTrashItems] = useState<DecryptedVaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DecryptedVaultItem | null>(null);
  const [purging, setPurging] = useState(false);

  const loadTrash = useCallback(async () => {
    if (!symmetricKey) return;
    setLoading(true);
    try {
      const { data } = await vaultApi.getTrash();
      const decrypted: DecryptedVaultItem[] = (
        await Promise.all(
          data.map(async (item) => {
            try {
              const nameStr = await decryptWithKey(item.name, symmetricKey);
              const notesStr = item.notes ? await decryptWithKey(item.notes, symmetricKey) : undefined;
              const dataStr = await decryptWithKey(item.item_data as string, symmetricKey);
              return {
                uuid: item.uuid,
                type: item.type as DecryptedVaultItem['type'],
                name: nameStr,
                notes: notesStr,
                favorite: item.favorite,
                folderId: (item as { folder_id?: string }).folder_id || undefined,
                itemData: JSON.parse(dataStr),
                reprompt: item.reprompt,
                deletedAt: item.deleted_at,
                createdAt: item.created_at,
                updatedAt: item.updated_at,
              };
            } catch {
              return null;
            }
          })
        )
      ).filter(Boolean) as DecryptedVaultItem[];

      setTrashItems(decrypted.sort((a, b) =>
        new Date(b.deletedAt || 0).getTime() - new Date(a.deletedAt || 0).getTime()
      ));
    } catch {
      toast.error('Failed to load trash');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symmetricKey]);

  useEffect(() => { loadTrash(); }, [loadTrash]);

  const handleRestore = useCallback(async (item: DecryptedVaultItem) => {
    try {
      await vaultApi.restoreItem(item.uuid);
      setTrashItems((p) => p.filter((i) => i.uuid !== item.uuid));
      // Also update Redux store — mark as not deleted
      const restoredItem = { ...item, deletedAt: undefined };
      dispatch(setItems([...allItems.filter(i => i.uuid !== item.uuid), restoredItem]));
      setSelected(null);
      toast.success('Item restored');
    } catch {
      toast.error('Restore failed');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, dispatch]);

  const handlePermanentDelete = useCallback(async (item: DecryptedVaultItem) => {
    try {
      await vaultApi.permanentDelete(item.uuid);
      setTrashItems((p) => p.filter((i) => i.uuid !== item.uuid));
      dispatch(setItems(allItems.filter((i) => i.uuid !== item.uuid)));
      setSelected(null);
      toast.success('Permanently deleted');
    } catch {
      toast.error('Delete failed');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, dispatch]);

  const handlePurge = useCallback(async () => {
    if (!confirm('Permanently delete ALL items in trash? This cannot be undone.')) return;
    setPurging(true);
    try {
      await vaultApi.purgeTrash();
      const trashUuids = new Set(trashItems.map((i) => i.uuid));
      dispatch(setItems(allItems.filter((i) => !trashUuids.has(i.uuid))));
      setTrashItems([]);
      toast.success('Trash emptied');
    } catch {
      toast.error('Failed to empty trash');
    } finally {
      setPurging(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trashItems, allItems, dispatch]);

  const typeColors: Record<string, string> = {
    login:    'bg-blue-100 text-blue-700',
    note:     'bg-green-100 text-green-700',
    card:     'bg-purple-100 text-purple-700',
    identity: 'bg-orange-100 text-orange-700',
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trash</h1>
          <p className="text-gray-500 text-sm mt-1">
            {trashItems.length} item{trashItems.length !== 1 ? 's' : ''} in trash
          </p>
        </div>
        {trashItems.length > 0 && (
          <button
            onClick={handlePurge}
            disabled={purging}
            className="flex items-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            {purging ? 'Emptying…' : 'Empty trash'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : trashItems.length === 0 ? (
        <div className="text-center py-20">
          <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <p className="text-gray-400 text-sm">Trash is empty</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {trashItems.map((item) => {
            const subtitle = getItemSubtitle(item.type, item.itemData as Record<string, unknown>);
            const faviconUrl = item.type === 'login'
              ? getFaviconUrl((item.itemData as Record<string, Array<{ uri: string }>>).uris?.[0]?.uri)
              : null;

            return (
              <div
                key={item.uuid}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 cursor-pointer group"
                onClick={() => setSelected(item)}
              >
                <div className="flex-shrink-0">
                  {faviconUrl ? (
                    <img src={faviconUrl} alt="" className="w-8 h-8 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 text-sm font-bold">
                      {item.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">{item.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeColors[item.type] || 'bg-gray-100 text-gray-600'}`}>
                      {item.type}
                    </span>
                  </div>
                  {subtitle && <p className="text-xs text-gray-400 truncate">{subtitle}</p>}
                  {item.deletedAt && (
                    <p className="text-xs text-gray-400">
                      Deleted {new Date(item.deletedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRestore(item); }}
                    className="px-2.5 py-1.5 text-xs font-medium text-green-600 border border-green-200 hover:bg-green-50 rounded-lg"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handlePermanentDelete(item); }}
                    className="px-2.5 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ViewItemModal
        open={!!selected}
        item={selected}
        onClose={() => setSelected(null)}
        onEdit={() => {}}
        onDelete={handlePermanentDelete}
        onRestore={handleRestore}
      />
    </div>
  );
}

