import { useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { DecryptedVaultItem } from '../store/slices/vaultSlice';

interface ExportLoginItem {
  uuid: string;
  name: string;
  type: string;
  username: string;
  password: string;
  url: string;
  totp: string;
  notes: string;
  favorite: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface ExportItem {
  uuid: string;
  name: string;
  type: string;
  notes: string;
  favorite: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

function itemToExportShape(item: DecryptedVaultItem): ExportItem {
  const d = item.itemData as Record<string, unknown>;
  const base: ExportItem = {
    uuid: item.uuid,
    name: item.name,
    type: item.type,
    notes: item.notes || '',
    favorite: item.favorite,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };

  switch (item.type) {
    case 'login':
      return {
        ...base,
        username: (d.username as string) || '',
        password: (d.password as string) || '',
        url: (d.uris as Array<{ uri: string }>)?.[0]?.uri || '',
        totp: (d.totp as string) || '',
      };
    case 'note':
      return { ...base, content: (d.content as string) || '' };
    case 'card':
      return {
        ...base,
        cardholderName: (d.cardholderName as string) || '',
        brand: (d.brand as string) || '',
        number: (d.number as string) || '',
        expMonth: (d.expMonth as string) || '',
        expYear: (d.expYear as string) || '',
        cvv: (d.code as string) || '',
      };
    case 'identity':
      return {
        ...base,
        firstName: (d.firstName as string) || '',
        lastName: (d.lastName as string) || '',
        email: (d.email as string) || '',
        phone: (d.phone as string) || '',
        address: (d.address1 as string) || '',
        city: (d.city as string) || '',
        country: (d.country as string) || '',
      };
    default:
      return base;
  }
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Export() {
  const items = useSelector((s: RootState) => s.vault.items);
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [includeTrash, setIncludeTrash] = useState(false);

  const activeItems = items.filter((i) => !i.deletedAt);
  const exportable = includeTrash ? items : activeItems;

  const handleExport = useCallback(() => {
    const now = new Date().toISOString();
    const filename = `opsvault-export-${now.slice(0, 10)}`;

    if (format === 'json') {
      const payload = {
        version: 'opsvault-1.0',
        exportedAt: now,
        totalItems: exportable.length,
        items: exportable.map(itemToExportShape),
      };
      downloadBlob(
        JSON.stringify(payload, null, 2),
        `${filename}.json`,
        'application/json'
      );
    } else {
      // CSV — flat columns covering all item types
      const headers = [
        'name', 'type', 'username', 'password', 'url', 'totp',
        'notes', 'favorite', 'createdAt',
      ];
      const rows = exportable.map((item) => {
        const shaped = itemToExportShape(item) as unknown as ExportLoginItem;
        return headers
          .map((h) => escapeCsvField(String((shaped as unknown as Record<string, unknown>)[h] ?? '')))
          .join(',');
      });
      downloadBlob(
        [headers.join(','), ...rows].join('\n'),
        `${filename}.csv`,
        'text/csv'
      );
    }
  }, [format, exportable]);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Export Vault</h1>
        <p className="text-gray-500 text-sm mt-1">
          Download a copy of your decrypted vault data.
        </p>
      </div>

      {/* Warning */}
      <div className="flex gap-3 bg-amber-50 border border-amber-300 rounded-xl p-4">
        <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-amber-800">Security warning</p>
          <p className="text-sm text-amber-700 mt-0.5">
            This export contains <strong>unencrypted</strong> passwords and sensitive data.
            Store it securely and delete it when no longer needed.
          </p>
        </div>
      </div>

      {/* Options */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Format</p>
          <div className="flex gap-3">
            {(['json', 'csv'] as const).map((f) => (
              <label key={f} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  value={f}
                  checked={format === f}
                  onChange={() => setFormat(f)}
                  className="accent-blue-600"
                />
                <span className="text-sm font-medium text-gray-700 uppercase">{f}</span>
                <span className="text-xs text-gray-400">
                  {f === 'json' ? '— full structured data' : '— flat spreadsheet-friendly'}
                </span>
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeTrash}
            onChange={(e) => setIncludeTrash(e.target.checked)}
            className="rounded border-gray-300 accent-blue-600"
          />
          <span className="text-sm text-gray-700">Include items in trash</span>
        </label>

        <div className="pt-1 border-t border-gray-100 text-sm text-gray-500">
          <span className="font-semibold text-gray-700">{exportable.length}</span> item
          {exportable.length !== 1 ? 's' : ''} will be exported
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={exportable.length === 0}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          Download {format.toUpperCase()} export
        </button>
      </div>
    </div>
  );
}
