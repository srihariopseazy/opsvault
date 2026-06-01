import { useState, useMemo, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store';
import { DecryptedVaultItem, addItem, updateItem, removeItem, setItems } from '../store/slices/vaultSlice';
import { useCrypto } from '../hooks/useCrypto';
import { vaultApi } from '../api/vaultApi';
import { decryptWithKey } from '../crypto/cryptoEngine';
import { useToast } from '../components/ui/Toast';
import { getFaviconUrl, getItemSubtitle } from '../utils/helpers';
import VaultItemDetail from './VaultItemDetail';
import { Modal } from '../components/ui/Modal';

type FilterSection = 'all' | 'login' | 'note' | 'card' | 'identity' | 'favorites' | 'trash';

const SECTION_LABELS: Record<FilterSection, string> = {
  all: 'All Items',
  login: 'Logins',
  note: 'Secure Notes',
  card: 'Cards',
  identity: 'Identities',
  favorites: 'Favorites',
  trash: 'Trash',
};

interface ItemFormData {
  name: string;
  type: 'login' | 'note' | 'card' | 'identity';
  notes: string;
  favorite: boolean;
  username: string;
  password: string;
  uri: string;
  noteContent: string;
  cardName: string;
  cardNumber: string;
  cardExpMonth: string;
  cardExpYear: string;
  cardCvv: string;
  cardBrand: string;
  idFirstName: string;
  idLastName: string;
  idEmail: string;
  idPhone: string;
  idAddress: string;
}

const defaultForm: ItemFormData = {
  name: '', type: 'login', notes: '', favorite: false,
  username: '', password: '', uri: '',
  noteContent: '',
  cardName: '', cardNumber: '', cardExpMonth: '', cardExpYear: '', cardCvv: '', cardBrand: '',
  idFirstName: '', idLastName: '', idEmail: '', idPhone: '', idAddress: '',
};

function buildItemData(form: ItemFormData): Record<string, unknown> {
  switch (form.type) {
    case 'login':
      return { uris: [{ match: null, uri: form.uri }], username: form.username, password: form.password, totp: null };
    case 'note':
      return { content: form.noteContent };
    case 'card':
      return { cardholderName: form.cardName, brand: form.cardBrand, number: form.cardNumber, expMonth: form.cardExpMonth, expYear: form.cardExpYear, code: form.cardCvv };
    case 'identity':
      return { firstName: form.idFirstName, lastName: form.idLastName, email: form.idEmail, phone: form.idPhone, address1: form.idAddress };
  }
}

function formFromItem(item: DecryptedVaultItem): ItemFormData {
  const d = item.itemData as Record<string, unknown>;
  const base = { ...defaultForm, name: item.name, type: item.type, notes: item.notes || '', favorite: item.favorite };
  switch (item.type) {
    case 'login': return { ...base, username: (d.username as string) || '', password: (d.password as string) || '', uri: (d.uris as Array<{ uri: string }>)?.[0]?.uri || '' };
    case 'note': return { ...base, noteContent: (d.content as string) || '' };
    case 'card': return { ...base, cardName: (d.cardholderName as string) || '', cardBrand: (d.brand as string) || '', cardNumber: (d.number as string) || '', cardExpMonth: (d.expMonth as string) || '', cardExpYear: (d.expYear as string) || '', cardCvv: (d.code as string) || '' };
    case 'identity': return { ...base, idFirstName: (d.firstName as string) || '', idLastName: (d.lastName as string) || '', idEmail: (d.email as string) || '', idPhone: (d.phone as string) || '', idAddress: (d.address1 as string) || '' };
  }
}

export default function Vault() {
  const dispatch = useDispatch<AppDispatch>();
  const toast = useToast();
  const { symmetricKey } = useCrypto();
  const items = useSelector((s: RootState) => s.vault.items);

  const [section, setSection] = useState<FilterSection>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<DecryptedVaultItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DecryptedVaultItem | null>(null);
  const [form, setForm] = useState<ItemFormData>(defaultForm);
  const [saving, setSaving] = useState(false);

  const visibleItems = useMemo(() => {
    let list = items;
    if (section === 'trash') list = items.filter((i) => i.deletedAt);
    else {
      list = items.filter((i) => !i.deletedAt);
      if (section === 'favorites') list = list.filter((i) => i.favorite);
      else if (section !== 'all') list = list.filter((i) => i.type === section);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        getItemSubtitle(i.type, i.itemData as Record<string, unknown>).toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, section, search]);

  const openAdd = useCallback(() => {
    setEditingItem(null);
    setForm(defaultForm);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((item: DecryptedVaultItem) => {
    setEditingItem(item);
    setForm(formFromItem(item));
    setModalOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!symmetricKey) return;
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const itemData = buildItemData(form);
      const encName = await (await import('../crypto/cryptoEngine')).encryptWithKey(form.name, symmetricKey);
      const encNotes = form.notes ? await (await import('../crypto/cryptoEngine')).encryptWithKey(form.notes, symmetricKey) : null;
      const encData = await (await import('../crypto/cryptoEngine')).encryptWithKey(JSON.stringify(itemData), symmetricKey);

      const payload = {
        type: form.type,
        name: encName,
        notes: encNotes || undefined,
        favorite: form.favorite,
        item_data: encData,
        reprompt: false,
      };

      if (editingItem) {
        const { data } = await vaultApi.updateItem(editingItem.uuid, payload);
        const decName = await decryptWithKey(data.name, symmetricKey);
        const decNotes = data.notes ? await decryptWithKey(data.notes, symmetricKey) : undefined;
        const decData = JSON.parse(await decryptWithKey(data.item_data as string, symmetricKey));
        dispatch(updateItem({ ...editingItem, name: decName, notes: decNotes, itemData: decData, favorite: data.favorite }));
        toast.success('Item updated');
      } else {
        const { data } = await vaultApi.createItem(payload);
        const decName = await decryptWithKey(data.name, symmetricKey);
        const decData = JSON.parse(await decryptWithKey(data.item_data as string, symmetricKey));
        dispatch(addItem({
          uuid: data.uuid,
          type: data.type as DecryptedVaultItem['type'],
          name: decName,
          notes: form.notes || undefined,
          favorite: data.favorite,
          itemData: decData,
          reprompt: data.reprompt,
        }));
        toast.success('Item added');
      }
      setModalOpen(false);
    } catch {
      toast.error('Failed to save item');
    } finally {
      setSaving(false);
    }
  }, [form, editingItem, symmetricKey, dispatch, toast]);

  const handleDelete = useCallback(async (item: DecryptedVaultItem) => {
    try {
      if (item.deletedAt) {
        await vaultApi.permanentDelete(item.uuid);
        dispatch(removeItem(item.uuid));
        toast.success('Permanently deleted');
      } else {
        await vaultApi.deleteItem(item.uuid);
        dispatch(updateItem({ ...item, deletedAt: new Date().toISOString() }));
        toast.success('Moved to trash');
      }
      setSelected(null);
    } catch {
      toast.error('Delete failed');
    }
  }, [dispatch, toast]);

  const handleRestore = useCallback(async (item: DecryptedVaultItem) => {
    try {
      await vaultApi.restoreItem(item.uuid);
      dispatch(updateItem({ ...item, deletedAt: undefined }));
      setSelected(null);
      toast.success('Item restored');
    } catch {
      toast.error('Restore failed');
    }
  }, [dispatch, toast]);

  const handlePurgeTrash = useCallback(async () => {
    try {
      await vaultApi.purgeTrash();
      dispatch(setItems(items.filter((i) => !i.deletedAt)));
      toast.success('Trash emptied');
    } catch {
      toast.error('Failed to empty trash');
    }
  }, [items, dispatch, toast]);

  const sf = useCallback((field: keyof ItemFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((p) => ({ ...p, [field]: e.target.value }));
  }, []);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <nav className="flex-1 p-3 space-y-0.5">
          {(['all', 'login', 'note', 'card', 'identity'] as FilterSection[]).map((s) => (
            <SidebarItem key={s} label={SECTION_LABELS[s]} active={section === s} onClick={() => setSection(s)} />
          ))}
          <div className="my-2 border-t border-gray-100" />
          <SidebarItem label="Favorites" active={section === 'favorites'} onClick={() => setSection('favorites')} />
          <SidebarItem label="Trash" active={section === 'trash'} onClick={() => setSection('trash')} />
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
          <input
            type="search"
            placeholder="Search vault…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add item
          </button>
          {section === 'trash' && visibleItems.length > 0 && (
            <button
              onClick={handlePurgeTrash}
              className="text-sm text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
            >
              Empty trash
            </button>
          )}
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            {SECTION_LABELS[section]} ({visibleItems.length})
          </h2>
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
                  active={selected?.uuid === item.uuid}
                  onSelect={() => setSelected(item)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <VaultItemDetail
          item={selected}
          onEdit={() => openEdit(selected)}
          onDelete={() => handleDelete(selected)}
          onClose={() => setSelected(null)}
        />
      )}
      {selected?.deletedAt && (
        <div className="fixed bottom-4 right-4 z-40">
          <button
            onClick={() => handleRestore(selected)}
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg"
          >
            Restore item
          </button>
        </div>
      )}

      {/* Add/Edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingItem ? 'Edit item' : 'Add item'}>
        <div className="space-y-4">
          {/* Type tabs */}
          {!editingItem && (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              {(['login', 'note', 'card', 'identity'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setForm((p) => ({ ...p, type: t }))}
                  className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${form.type === t ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          )}

          <FormInput label="Name" value={form.name} onChange={sf('name')} placeholder="Item name" required />

          {form.type === 'login' && (
            <>
              <FormInput label="Username" value={form.username} onChange={sf('username')} placeholder="username@example.com" />
              <FormInput label="Password" value={form.password} onChange={sf('password')} type="password" placeholder="Password" />
              <FormInput label="URL" value={form.uri} onChange={sf('uri')} placeholder="https://example.com" />
            </>
          )}

          {form.type === 'note' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
              <textarea
                value={form.noteContent}
                onChange={sf('noteContent')}
                rows={5}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Secure note content…"
              />
            </div>
          )}

          {form.type === 'card' && (
            <>
              <FormInput label="Cardholder name" value={form.cardName} onChange={sf('cardName')} placeholder="John Doe" />
              <FormInput label="Card number" value={form.cardNumber} onChange={sf('cardNumber')} placeholder="4111 1111 1111 1111" />
              <div className="grid grid-cols-3 gap-3">
                <FormInput label="Exp month" value={form.cardExpMonth} onChange={sf('cardExpMonth')} placeholder="12" />
                <FormInput label="Exp year" value={form.cardExpYear} onChange={sf('cardExpYear')} placeholder="2027" />
                <FormInput label="CVV" value={form.cardCvv} onChange={sf('cardCvv')} placeholder="123" />
              </div>
            </>
          )}

          {form.type === 'identity' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <FormInput label="First name" value={form.idFirstName} onChange={sf('idFirstName')} placeholder="John" />
                <FormInput label="Last name" value={form.idLastName} onChange={sf('idLastName')} placeholder="Doe" />
              </div>
              <FormInput label="Email" value={form.idEmail} onChange={sf('idEmail')} placeholder="john@example.com" />
              <FormInput label="Phone" value={form.idPhone} onChange={sf('idPhone')} placeholder="+1234567890" />
              <FormInput label="Address" value={form.idAddress} onChange={sf('idAddress')} placeholder="123 Main St" />
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={sf('notes')}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional notes…"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.favorite}
              onChange={(e) => setForm((p) => ({ ...p, favorite: e.target.checked }))}
              className="rounded"
            />
            <span className="text-sm text-gray-700">Mark as favorite</span>
          </label>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setModalOpen(false)}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SidebarItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
    >
      {label}
    </button>
  );
}

function ItemCard({ item, active, onSelect }: { item: DecryptedVaultItem; active: boolean; onSelect: () => void }) {
  const subtitle = getItemSubtitle(item.type, item.itemData as Record<string, unknown>);
  const faviconUrl = item.type === 'login'
    ? getFaviconUrl((item.itemData as Record<string, unknown[]>).uris?.[0] as unknown as string)
    : null;

  const typeColors: Record<string, string> = {
    login: 'bg-blue-100 text-blue-700',
    note: 'bg-green-100 text-green-700',
    card: 'bg-purple-100 text-purple-700',
    identity: 'bg-orange-100 text-orange-700',
  };

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${active ? 'border-blue-300 bg-blue-50' : 'border-transparent hover:border-gray-200 hover:bg-gray-50'}`}
    >
      <div className="flex-shrink-0">
        {faviconUrl ? (
          <img src={faviconUrl} alt="" className="w-8 h-8 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-500 text-sm font-bold">
            {item.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{item.name}</div>
        {subtitle && <div className="text-xs text-gray-400 truncate">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {item.favorite && (
          <svg className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        )}
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeColors[item.type] || 'bg-gray-100 text-gray-600'}`}>
          {item.type}
        </span>
      </div>
    </button>
  );
}

function FormInput({
  label, value, onChange, type = 'text', placeholder, required,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );
}
