import { useState, useMemo } from 'react';
import SearchBar from '../components/SearchBar';
import MatchedItems, { ItemRow } from '../components/MatchedItems';
import type { DecryptedVaultItem } from '../../shared/types';

interface Props {
  items: DecryptedVaultItem[];
  currentTabUrl: string;
  email: string;
  onSelectItem: (item: DecryptedVaultItem) => void;
  onLock: () => void;
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  login:    { bg: '#dbeafe', text: '#1d4ed8' },
  note:     { bg: '#dcfce7', text: '#15803d' },
  card:     { bg: '#f3e8ff', text: '#7e22ce' },
  identity: { bg: '#ffedd5', text: '#c2410c' },
};

export default function VaultPage({ items, currentTabUrl, email, onSelectItem, onLock }: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 600 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', borderBottom: '1px solid #e5e7eb', background: '#fff',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 22, height: 22, background: '#2563eb', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>OPSVAULT</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>{email}</span>
          <button
            type="button"
            onClick={onLock}
            title="Lock vault"
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, borderRadius: 4, display: 'flex' }}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 10 }}>
        {/* Matched items for current tab */}
        <MatchedItems items={items} currentTabUrl={currentTabUrl} onSelect={onSelectItem} />

        {/* Search */}
        <SearchBar value={search} onChange={setSearch} />

        {/* Section header */}
        <div style={{ padding: '4px 12px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {search ? `Results (${filtered.length})` : `All items (${items.length})`}
          </span>
        </div>

        {/* Item list */}
        <div style={{ padding: '0 12px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '32px 0' }}>
              {search ? 'No items found' : 'Your vault is empty'}
            </div>
          ) : (
            filtered.map((item) => (
              <div key={item.uuid} style={{ marginBottom: 2 }}>
                <ItemRow item={item} onSelect={onSelectItem} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
