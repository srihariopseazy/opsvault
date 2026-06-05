import type { DecryptedVaultItem, LoginItemData } from '../../shared/types';
import { extractDomain, uriMatchesDomain } from '../../shared/crypto';

interface Props {
  items: DecryptedVaultItem[];
  currentTabUrl: string;
  onSelect: (item: DecryptedVaultItem) => void;
}

export default function MatchedItems({ items, currentTabUrl, onSelect }: Props) {
  if (!currentTabUrl) return null;

  const tabDomain = extractDomain(currentTabUrl);
  const matched   = items.filter((item) => {
    if (item.type !== 'login') return false;
    const d = item.itemData as LoginItemData;
    return d.uris?.some((u) => uriMatchesDomain(u.uri, tabDomain)) ?? false;
  });

  if (matched.length === 0) return null;

  return (
    <div style={{ margin: '0 12px 8px' }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        Matches for {tabDomain}
      </p>
      {matched.map((item) => (
        <ItemRow key={item.uuid} item={item} onSelect={onSelect} highlighted />
      ))}
    </div>
  );
}

export function ItemRow({
  item,
  onSelect,
  highlighted = false,
}: {
  item: DecryptedVaultItem;
  onSelect: (item: DecryptedVaultItem) => void;
  highlighted?: boolean;
}) {
  const d = item.itemData as LoginItemData;
  const initial = item.name.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        border: highlighted ? '1px solid #bfdbfe' : '1px solid transparent',
        borderRadius: 8,
        background: highlighted ? '#eff6ff' : '#fff',
        cursor: 'pointer',
        textAlign: 'left',
        marginBottom: 4,
        transition: 'background .1s',
      }}
      onMouseEnter={(e) => { if (!highlighted) (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'; }}
      onMouseLeave={(e) => { if (!highlighted) (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 6, flexShrink: 0,
        background: '#e0e7ff', color: '#3730a3',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 13,
      }}>
        {initial}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.name}
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {d.username ?? '—'}
        </div>
      </div>
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
