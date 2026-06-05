import { useState, useMemo, useCallback, useEffect } from 'react';
import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { RootState, AppDispatch } from '../store';
import {
  DecryptedVaultItem,
  addItem,
  updateItem,
  removeItem,
  setItems,
} from '../store/slices/vaultSlice';
import { useCrypto } from '../hooks/useCrypto';
import { decryptWithKey } from '../crypto/cryptoEngine';
import { vaultApi } from '../api/vaultApi';
import { foldersApi, FolderResponse } from '../api/foldersApi';
import { useToast } from '../components/ui/Toast';
import { getFaviconUrl, getItemSubtitle } from '../utils/helpers';
import { AddItemModal } from '../components/vault/AddItemModal';
import { ViewItemModal } from '../components/vault/ViewItemModal';
import { ShareItemModal } from '../components/vault/ShareItemModal';
import { generateTOTP, getTimeRemaining } from '../utils/totp';
import { useOfflineSync } from '../hooks/useOfflineSync';

// ─── Types ───────────────────────────────────────────────────────────────────

type SectionFilter = 'all' | 'login' | 'note' | 'card' | 'identity' | 'favorites';
type SortBy = 'name-asc' | 'name-desc' | 'created' | 'modified';

const SECTION_LABELS: Record<SectionFilter, string> = {
  all:       'All Items',
  login:     'Logins',
  note:      'Secure Notes',
  card:      'Cards',
  identity:  'Identities',
  favorites: 'Favorites',
};

const TYPE_COLORS: Record<string, string> = {
  login:    'bg-blue-100 text-blue-700',
  note:     'bg-green-100 text-green-700',
  card:     'bg-purple-100 text-purple-700',
  identity: 'bg-orange-100 text-orange-700',
};

// ─── Main component ──────────────────────────────────────────────────────────

export default function Vault() {
  const dispatch = useDispatch<AppDispatch>();
  const toast = useToast();
  const { symmetricKey } = useCrypto();
  const items = useSelector((s: RootState) => s.vault.items);
  const personalVaultDisabled = useSelector((s: RootState) => s.ui?.personalVaultDisabled ?? false);
  const [searchParams] = useSearchParams();
  const { isOnline } = useOfflineSync();

  // State
  const [section, setSection] = useState<SectionFilter>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('name-asc');
  const [folders, setFolders] = useState<FolderResponse[]>([]);
  const [isStale, setIsStale] = useState(false);

  // Modal state
  const [viewItem, setViewItem] = useState<DecryptedVaultItem | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DecryptedVaultItem | null>(null);
  const [shareItem, setShareItem] = useState<DecryptedVaultItem | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  // Folder filter from URL query param (?folder=<uuid>)
  const folderParam = searchParams.get('folder');

  // Fetch folders for AddItemModal and folder display
  useEffect(() => {
    foldersApi.listFolders()
      .then((r) => setFolders(r.data))
      .catch(() => {});
  }, []);

  // Background sync: refresh vault from API and cache; fall back to IndexedDB when offline
  useEffect(() => {
    if (!symmetricKey) return;
    let cancelled = false;

    async function refresh() {
      try {
        const { data, fromCache } = await vaultApi.syncWithCache();
        if (cancelled) return;
        const decrypted = (
          await Promise.all(
            data.items.map(async (item) => {
              try {
                const nameStr  = await decryptWithKey(item.name, symmetricKey!);
                const notesStr = item.notes ? await decryptWithKey(item.notes, symmetricKey!) : undefined;
                const dataStr  = await decryptWithKey(item.item_data as string, symmetricKey!);
                return {
                  uuid: item.uuid,
                  type: item.type as DecryptedVaultItem['type'],
                  name: nameStr,
                  notes: notesStr,
                  favorite: item.favorite,
                  folderId: item.folder_id,
                  itemData: JSON.parse(dataStr),
                  customFields: item.custom_fields,
                  passwordHistory: item.password_history,
                  reprompt: item.reprompt,
                  deletedAt: item.deleted_at,
                  createdAt: item.created_at,
                  updatedAt: item.updated_at,
                  revisionDate: item.revision_date,
                } as DecryptedVaultItem;
              } catch {
                return null;
              }
            })
          )
        ).filter(Boolean) as DecryptedVaultItem[];
        if (!cancelled) {
          dispatch(setItems(decrypted));
          setIsStale(fromCache);
        }
      } catch {
        if (!cancelled) setIsStale(true);
      }
    }

    refresh();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symmetricKey]);

  // ── Filtered + sorted item list ──────────────────────────────────────────

  const visibleItems = useMemo(() => {
    // Start from non-deleted items only
    let list = items.filter((i) => !i.deletedAt);

    // Section filter
    if (section === 'favorites') {
      list = list.filter((i) => i.favorite);
    } else if (section !== 'all') {
      list = list.filter((i) => i.type === section);
    }

    // Folder filter (from URL param)
    if (folderParam) {
      list = list.filter((i) => i.folderId === folderParam);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        getItemSubtitle(i.type, i.itemData as Record<string, unknown>).toLowerCase().includes(q)
      );
    }

    // Sort
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':  return a.name.localeCompare(b.name);
        case 'name-desc': return b.name.localeCompare(a.name);
        case 'created':   return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        case 'modified':  return new Date(b.revisionDate || b.updatedAt || 0).getTime() - new Date(a.revisionDate || a.updatedAt || 0).getTime();
        default: return 0;
      }
    });

    return list;
  }, [items, section, search, sortBy, folderParam]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const openAdd = useCallback(() => {
    setEditingItem(null);
    setAddOpen(true);
  }, []);

  const openEdit = useCallback((item: DecryptedVaultItem) => {
    setViewOpen(false);
    setEditingItem(item);
    setAddOpen(true);
  }, []);

  const handleSaved = useCallback((item: DecryptedVaultItem, isNew: boolean) => {
    if (isNew) {
      dispatch(addItem(item));
    } else {
      dispatch(updateItem(item));
      // Keep view in sync
      setViewItem((prev) => (prev?.uuid === item.uuid ? item : prev));
    }
  }, [dispatch]);

  const handleItemClick = useCallback((item: DecryptedVaultItem) => {
    setViewItem(item);
    setViewOpen(true);
  }, []);

  const handleDelete = useCallback(async (item: DecryptedVaultItem) => {
    try {
      await vaultApi.deleteItem(item.uuid);
      dispatch(updateItem({ ...item, deletedAt: new Date().toISOString() }));
      setViewOpen(false);
      toast.success('Moved to trash');
    } catch {
      toast.error('Delete failed');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const handleRestore = useCallback(async (item: DecryptedVaultItem) => {
    try {
      await vaultApi.restoreItem(item.uuid);
      dispatch(updateItem({ ...item, deletedAt: undefined }));
      setViewOpen(false);
      toast.success('Item restored');
    } catch {
      toast.error('Restore failed');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);


  // Unused but kept for backward compatibility with any external callers
  const handlePermanentDelete = useCallback(async (item: DecryptedVaultItem) => {
    try {
      await vaultApi.permanentDelete(item.uuid);
      dispatch(removeItem(item.uuid));
      setViewOpen(false);
      toast.success('Permanently deleted');
    } catch {
      toast.error('Delete failed');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const handleToggleFavorite = useCallback(async (item: DecryptedVaultItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { data } = await vaultApi.toggleFavorite(item.uuid);
      dispatch(updateItem({ ...item, favorite: data.favorite }));
    } catch {
      toast.error('Failed to update favorite');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const folderName = folderParam ? folders.find((f) => f.uuid === folderParam)?.name : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">
      {/* Left filter sidebar — hidden on mobile, visible on sm+ */}
      <aside className="hidden sm:flex w-52 flex-shrink-0 border-r border-gray-200 bg-white flex-col">
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {(['all', 'login', 'note', 'card', 'identity'] as SectionFilter[]).map((s) => (
            <SidebarBtn
              key={s}
              label={SECTION_LABELS[s]}
              active={section === s && !folderParam}
              onClick={() => {
                setSection(s);
                // Clear folder param by navigating without it (keep search params clean)
                window.history.replaceState({}, '', window.location.pathname);
              }}
            />
          ))}
          <div className="my-2 border-t border-gray-100" />
          <SidebarBtn
            label="Favorites"
            active={section === 'favorites' && !folderParam}
            onClick={() => {
              setSection('favorites');
              window.history.replaceState({}, '', window.location.pathname);
            }}
          />
       

          {/* Inline folder list */}
          {folders.length > 0 && (
            <>
              <div className="my-2 border-t border-gray-100" />
              <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Folders</p>
              {folders.map((f) => (
                <SidebarBtn
                  key={f.uuid}
                  label={f.name}
                  active={folderParam === f.uuid}
                  onClick={() => {
                    window.history.replaceState({}, '', `${window.location.pathname}?folder=${f.uuid}`);
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }}
                  icon={
                    <svg className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M10 4H4c-1.11 0-2 .89-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8c0-1.11-.89-2-2-2h-8l-2-2z" />
                    </svg>
                  }
                />
              ))}
            </>
          )}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Policy banner */}
        {personalVaultDisabled && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-amber-800">Personal vault is disabled by your organization policy.</p>
          </div>
        )}

        {/* Stale / offline data indicator */}
        {(isStale || !isOnline) && (
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-blue-700">Showing cached vault — changes will sync when back online.</p>
          </div>
        )}

        {/* Mobile filter row — visible only on mobile (sidebar is hidden) */}
        <div className="sm:hidden flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-white overflow-x-auto">
          {(['all', 'login', 'note', 'card', 'identity', 'favorites'] as SectionFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSection(s);
                window.history.replaceState({}, '', window.location.pathname);
              }}
              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                section === s && !folderParam
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {SECTION_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Top bar */}
        <div className="flex items-center gap-2 px-3 sm:px-4 py-3 border-b border-gray-200 bg-white flex-wrap">
          {/* Search */}
          <input
            type="search"
            placeholder="Search vault…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-36 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Sort dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="name-asc">A → Z</option>
            <option value="name-desc">Z → A</option>
            <option value="created">Newest first</option>
            <option value="modified">Recently edited</option>
          </select>

          {/* Add button */}
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add item
          </button>

       
        </div>

        {/* Section heading */}
        <div className="px-4 pt-4 pb-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            {folderName ? `📁 ${folderName}` : SECTION_LABELS[section]}{' '}
            <span className="font-normal normal-case">({visibleItems.length})</span>
          </h2>
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {visibleItems.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              {search ? 'No results match your search' : 'No items here yet'}
            </div>
          ) : (
            <div className="space-y-1.5">
              {visibleItems.map((item) => (
                <ItemCard
                  key={item.uuid}
                  item={item}
                  active={viewItem?.uuid === item.uuid && viewOpen}
                  onSelect={() => handleItemClick(item)}
                  onToggleFavorite={handleToggleFavorite}
                  onShare={(it) => { setShareItem(it); setShareOpen(true); }}
                  folders={folders}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* View item modal */}
      <ViewItemModal
        open={viewOpen}
        item={viewItem}
        onClose={() => setViewOpen(false)}
        onEdit={openEdit}
        onDelete={handleDelete}
        onRestore={handleRestore}
        folders={folders}
      />

      {/* Add / Edit modal */}
      <AddItemModal
        open={addOpen}
        onClose={() => { setAddOpen(false); setEditingItem(null); }}
        onSaved={handleSaved}
        editingItem={editingItem}
        symmetricKey={symmetricKey}
        folders={folders}
      />

      {/* Share item modal */}
      <ShareItemModal
        open={shareOpen}
        item={shareItem}
        onClose={() => { setShareOpen(false); setShareItem(null); }}
      />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SidebarBtn({
  label, active, onClick, icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
        active
          ? 'bg-blue-50 text-blue-700 font-medium'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

// ── TOTP badge (updates every second) ────────────────────────────────────────

function TotpBadge({ secret }: { secret: string }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [secsLeft, setSecsLeft] = useState(30);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const c = await generateTOTP(secret);
      if (!cancelled) { setCode(c); setSecsLeft(getTimeRemaining()); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [secret]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(code);
    toast.success('TOTP code copied');
  };

  if (!code) return null;
  const urgent = secsLeft <= 7;

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copy TOTP (${secsLeft}s remaining)`}
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono font-semibold tabular-nums flex-shrink-0 transition-colors ${
        urgent
          ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
          : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
      }`}
    >
      {code}
      <span className={`text-[9px] font-normal ${urgent ? 'text-red-400' : 'text-green-500'}`}>
        {secsLeft}s
      </span>
    </button>
  );
}

function ItemCard({
  item, active, onSelect, onToggleFavorite, onShare, folders,
}: {
  item: DecryptedVaultItem;
  active: boolean;
  onSelect: () => void;
  onToggleFavorite: (item: DecryptedVaultItem, e: React.MouseEvent) => void;
  onShare: (item: DecryptedVaultItem) => void;
  folders: FolderResponse[];
}) {
  const subtitle = getItemSubtitle(item.type, item.itemData as Record<string, unknown>);
  const faviconUrl = item.type === 'login'
    ? getFaviconUrl(
        (item.itemData as Record<string, Array<{ uri: string }>>).uris?.[0]?.uri
      )
    : null;
  const folderName = item.folderId ? folders.find((f) => f.uuid === item.folderId)?.name : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
        active
          ? 'border-blue-300 bg-blue-50'
          : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
      }`}
    >
      {/* Icon */}
      <div className="flex-shrink-0">
        {faviconUrl ? (
          <img
            src={faviconUrl}
            alt=""
            className="w-8 h-8 rounded"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-500 text-sm font-bold">
            {item.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{item.name}</div>
        <div className="flex items-center gap-1.5 min-w-0">
          {subtitle && <span className="text-xs text-gray-400 truncate">{subtitle}</span>}
          {folderName && (
            <span className="text-xs text-amber-500 flex-shrink-0">· {folderName}</span>
          )}
        </div>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {item.totpSecret && (
          <TotpBadge secret={item.totpSecret} />
        )}
        {/* Share button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onShare(item); }}
          title="Share item"
          className="p-0.5 rounded hover:bg-blue-50 transition-colors text-gray-200 hover:text-blue-400"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={(e) => onToggleFavorite(item, e)}
          title={item.favorite ? 'Remove from favorites' : 'Add to favorites'}
          className="p-0.5 rounded hover:bg-amber-50 transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 transition-colors ${item.favorite ? 'text-amber-400' : 'text-gray-200 hover:text-amber-300'}`}
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[item.type] || 'bg-gray-100 text-gray-600'}`}>
          {item.type}
        </span>
      </div>
    </button>
  );
}
