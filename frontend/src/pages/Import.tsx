import { useState, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store';
import { addItem, DecryptedVaultItem } from '../store/slices/vaultSlice';
import { vaultApi } from '../api/vaultApi';
import { encryptWithKey, decryptWithKey } from '../crypto/cryptoEngine';
import { useToast } from '../components/ui/Toast';

type ImportFormat = 'opsvault' | 'bitwarden' | 'csv';
type ItemType = 'login' | 'note' | 'card' | 'identity';

interface ParsedItem {
  name: string;
  type: ItemType;
  username?: string;
  password?: string;
  url?: string;
  totp?: string;
  notes?: string;
  favorite?: boolean;
  // note/card/identity fields
  content?: string;
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): ParsedItem[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/['"]/g, '').trim());
  const idx = (name: string) => headers.findIndex((h) => h === name || h.includes(name));
  const get = (cols: string[], name: string) => cols[idx(name)]?.replace(/^"(.*)"$/, '$1') || '';

  return lines.slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const cols = parseCSVLine(line);
      return {
        name: get(cols, 'name') || 'Imported item',
        type: 'login' as ItemType,
        username: get(cols, 'username') || get(cols, 'login') || get(cols, 'email'),
        password: get(cols, 'password'),
        url: get(cols, 'url') || get(cols, 'uri') || get(cols, 'website'),
        notes: get(cols, 'notes') || get(cols, 'note'),
        favorite: false,
      };
    });
}

function parseBitwarden(text: string): ParsedItem[] {
  const data = JSON.parse(text);
  const TYPE_MAP: Record<number, ItemType> = { 1: 'login', 2: 'note', 3: 'card', 4: 'identity' };
  return (data.items || []).map((item: Record<string, unknown>) => ({
    name: (item.name as string) || 'Imported item',
    type: TYPE_MAP[(item.type as number)] || 'login',
    username: (item.login as Record<string, string>)?.username || '',
    password: (item.login as Record<string, string>)?.password || '',
    url: ((item.login as Record<string, Array<{ uri: string }>>)?.uris || [])[0]?.uri || '',
    totp: (item.login as Record<string, string>)?.totp || '',
    notes: (item.notes as string) || '',
    favorite: !!(item.favorite),
    content: (item.secureNote as Record<string, string>)?.type?.toString() || (item.notes as string) || '',
  }));
}

function parseOPSVAULT(text: string): ParsedItem[] {
  const data = JSON.parse(text);
  const items = data.items || data;
  return (Array.isArray(items) ? items : []).map((item: Record<string, unknown>) => ({
    name: (item.name as string) || 'Imported item',
    type: ((item.type as string) || 'login') as ItemType,
    username: (item.username as string) || '',
    password: (item.password as string) || '',
    url: (item.url as string) || '',
    totp: (item.totp as string) || '',
    notes: (item.notes as string) || '',
    favorite: !!(item.favorite),
    content: (item.content as string) || '',
  }));
}

function buildItemData(item: ParsedItem): Record<string, unknown> {
  switch (item.type) {
    case 'login':
      return {
        uris: item.url ? [{ match: null, uri: item.url }] : [],
        username: item.username || '',
        password: item.password || '',
        totp: item.totp || null,
      };
    case 'note':
      return { content: item.content || item.notes || '' };
    case 'card':
      return { cardholderName: '', brand: '', number: '', expMonth: '', expYear: '', code: '' };
    case 'identity':
      return { firstName: '', lastName: '', email: '', phone: '', address1: '' };
    default:
      return {};
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const FORMAT_LABELS: Record<ImportFormat, string> = {
  opsvault: 'OPSVAULT JSON',
  bitwarden: 'Bitwarden JSON',
  csv: 'CSV',
};

export default function Import() {
  const dispatch = useDispatch<AppDispatch>();
  const toast = useToast();
  const symmetricKey = useSelector((s: RootState) => s.vault.symmetricKey);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<ImportFormat>('opsvault');
  const [parsed, setParsed] = useState<ParsedItem[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [progress, setProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<{ imported: number; failed: number } | null>(null);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    setParseError('');
    setParsed(null);
    setSummary(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        let items: ParsedItem[];
        if (format === 'csv') items = parseCSV(text);
        else if (format === 'bitwarden') items = parseBitwarden(text);
        else items = parseOPSVAULT(text);
        setParsed(items);
      } catch (err) {
        setParseError(`Failed to parse file: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleImport = useCallback(async () => {
    if (!parsed || !symmetricKey) return;
    setImporting(true);
    setProgress(0);
    setSummary(null);

    let imported = 0;
    let failed = 0;

    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      try {
        const itemData = buildItemData(item);
        const encName = await encryptWithKey(item.name, symmetricKey);
        const encNotes = item.notes ? await encryptWithKey(item.notes, symmetricKey) : undefined;
        const encData = await encryptWithKey(JSON.stringify(itemData), symmetricKey);

        const { data } = await vaultApi.createItem({
          type: item.type,
          name: encName,
          notes: encNotes,
          favorite: item.favorite ?? false,
          item_data: encData,
          reprompt: false,
        });

        // Decrypt the response and add to Redux store
        const decName = await decryptWithKey(data.name, symmetricKey);
        const decData = JSON.parse(await decryptWithKey(data.item_data as string, symmetricKey));
        const decNotes = data.notes ? await decryptWithKey(data.notes, symmetricKey) : undefined;

        const newItem: DecryptedVaultItem = {
          uuid: data.uuid,
          type: data.type as DecryptedVaultItem['type'],
          name: decName,
          notes: decNotes,
          favorite: data.favorite,
          itemData: decData,
          reprompt: data.reprompt,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
        dispatch(addItem(newItem));
        imported++;
      } catch {
        failed++;
      }

      setProgress(Math.round(((i + 1) / parsed.length) * 100));
    }

    setImporting(false);
    setSummary({ imported, failed });
    if (imported > 0) {
      toast.success(`Imported ${imported} item${imported !== 1 ? 's' : ''} successfully`);
    }
    if (failed > 0) {
      toast.error(`${failed} item${failed !== 1 ? 's' : ''} failed to import`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, symmetricKey, dispatch]);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Import Vault</h1>
        <p className="text-gray-500 text-sm mt-1">
          Import passwords from another password manager or a previous OPSVAULT export.
        </p>
      </div>

      {/* Format selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">File format</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(FORMAT_LABELS) as ImportFormat[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => { setFormat(f); setParsed(null); setFileName(''); setParseError(''); setSummary(null); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${format === f ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-blue-400'}`}
              >
                {FORMAT_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
        >
          <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <p className="text-sm text-gray-500">
            {fileName
              ? <><span className="font-medium text-blue-600">{fileName}</span> — click to change</>
              : <>Drop your file here or <span className="text-blue-600 font-medium">browse</span></>}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {format === 'csv' ? '.csv files' : '.json files'}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={format === 'csv' ? '.csv,text/csv' : '.json,application/json'}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>

        {parseError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            {parseError}
          </p>
        )}
      </div>

      {/* Preview */}
      {parsed && parsed.length > 0 && !summary && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <p className="font-semibold text-gray-900 text-sm">
              Preview — {parsed.length} item{parsed.length !== 1 ? 's' : ''}
            </p>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
            >
              {importing ? 'Importing…' : `Import ${parsed.length} items`}
            </button>
          </div>

          {/* Progress bar */}
          {importing && (
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Encrypting and saving…</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
            {parsed.slice(0, 100).map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                  item.type === 'login' ? 'bg-blue-100 text-blue-700'
                  : item.type === 'note' ? 'bg-green-100 text-green-700'
                  : item.type === 'card' ? 'bg-purple-100 text-purple-700'
                  : 'bg-orange-100 text-orange-700'
                }`}>{item.type}</span>
                <span className="text-sm text-gray-800 truncate flex-1">{item.name}</span>
                {item.username && (
                  <span className="text-xs text-gray-400 truncate max-w-32">{item.username}</span>
                )}
              </div>
            ))}
            {parsed.length > 100 && (
              <p className="px-5 py-2 text-xs text-gray-400">…and {parsed.length - 100} more items</p>
            )}
          </div>
        </div>
      )}

      {parsed && parsed.length === 0 && !parseError && (
        <p className="text-sm text-gray-400 text-center py-8">No items found in this file.</p>
      )}

      {/* Summary */}
      {summary && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
          <h3 className="font-semibold text-gray-900">Import complete</h3>
          <div className="flex gap-4">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {summary.imported} imported successfully
            </div>
            {summary.failed > 0 && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                {summary.failed} failed
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setParsed(null); setFileName(''); setSummary(null); }}
            className="text-sm text-blue-600 hover:underline"
          >
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}
