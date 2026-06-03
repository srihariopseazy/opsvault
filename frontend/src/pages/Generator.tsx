import { useState, useCallback, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { copyToClipboard } from '../utils/helpers';
import { encryptWithKey, decryptWithKey } from '../crypto/cryptoEngine';
import { generatorHistoryApi, GeneratorHistoryEntry } from '../api/generatorHistoryApi';
import {
  generatePassword,
  getPasswordStrength,
  saveToGeneratorHistory,
  getGeneratorHistory,
  GeneratorOptions,
  DEFAULT_GENERATOR_OPTIONS,
} from '../utils/passwordUtils';

// ─── Shared generator UI ────────────────────────────────────────────────────

interface GeneratorUIProps {
  onUse?: (password: string) => void;
  compact?: boolean;
  onGenerate?: (password: string) => void;
}

function GeneratorUI({ onUse, compact = false, onGenerate }: GeneratorUIProps) {
  const toast = useToast();
  const [opts, setOpts] = useState<GeneratorOptions>(DEFAULT_GENERATOR_OPTIONS);
  const [password, setPassword] = useState(() => generatePassword(DEFAULT_GENERATOR_OPTIONS));
  const [history, setHistory] = useState<string[]>(() => getGeneratorHistory());

  const generate = useCallback(() => {
    const pw = generatePassword(opts);
    setPassword(pw);
    saveToGeneratorHistory(pw);
    setHistory(getGeneratorHistory());
    onGenerate?.(pw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts, onGenerate]);

  const handleCopy = useCallback(async () => {
    await copyToClipboard(password);
    toast.success('Password copied — clears in 30s');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password]);

  const strength = getPasswordStrength(password);

  const toggle = (key: keyof Omit<GeneratorOptions, 'length'>) => {
    setOpts((p) => ({ ...p, [key]: !p[key] }));
  };

  return (
    <div className="space-y-4">
      {/* Generated password */}
      <div>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={password}
            className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm text-gray-800 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="p-2.5 border border-gray-200 rounded-lg text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-colors"
            title="Copy"
          >
            <CopyIcon />
          </button>
          <button
            type="button"
            onClick={generate}
            className="p-2.5 border border-gray-200 rounded-lg text-gray-500 hover:text-green-600 hover:border-green-300 transition-colors"
            title="Regenerate"
          >
            <RefreshIcon />
          </button>
        </div>
        {/* Strength meter */}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
              style={{ width: `${strength.pct}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 w-20 text-right font-medium">{strength.label}</span>
        </div>
      </div>

      {/* Length slider */}
      <div>
        <div className="flex justify-between text-sm text-gray-700 mb-1">
          <span className="font-medium">Length</span>
          <span className="font-bold text-blue-600">{opts.length}</span>
        </div>
        <input
          type="range"
          min={8}
          max={128}
          value={opts.length}
          onChange={(e) => setOpts((p) => ({ ...p, length: Number(e.target.value) }))}
          className="w-full accent-blue-600"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-0.5">
          <span>8</span>
          <span>128</span>
        </div>
      </div>

      {/* Character toggles */}
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            { key: 'uppercase', label: 'A–Z uppercase' },
            { key: 'lowercase', label: 'a–z lowercase' },
            { key: 'numbers',   label: '0–9 numbers' },
            { key: 'symbols',   label: '!@# symbols' },
          ] as Array<{ key: keyof Omit<GeneratorOptions, 'length'>; label: string }>
        ).map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={opts[key]}
              onChange={() => toggle(key)}
              className="rounded border-gray-300 accent-blue-600"
            />
            <span className="text-sm text-gray-700">{label}</span>
          </label>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={generate}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
        >
          Generate
        </button>
        {onUse && (
          <button
            type="button"
            onClick={() => onUse(password)}
            className="flex-1 border border-blue-600 text-blue-600 hover:bg-blue-50 text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            Use this password
          </button>
        )}
      </div>

      {/* Local history (compact shows nothing) */}
      {!compact && history.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Recent (local)</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {history.map((pw, i) => {
              const s = getPasswordStrength(pw);
              return (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                  <span className="flex-1 font-mono text-xs text-gray-700 truncate">{pw}</span>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.color}`} title={s.label} />
                  <button
                    type="button"
                    onClick={async () => { await copyToClipboard(pw); toast.success('Copied'); }}
                    className="text-gray-400 hover:text-blue-600 flex-shrink-0"
                  >
                    <CopyIcon />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Password Generator Modal (exported for use in AddItemModal) ─────────────

export interface PasswordGeneratorModalProps {
  open: boolean;
  onClose: () => void;
  onUse: (password: string) => void;
}

export function PasswordGeneratorModal({ open, onClose, onUse }: PasswordGeneratorModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Password generator">
      <GeneratorUI onUse={onUse} compact />
    </Modal>
  );
}

// ─── Server-side history tab ──────────────────────────────────────────────────

function HistoryTab({ symmetricKey }: { symmetricKey: string | null }) {
  const toast = useToast();
  const [entries, setEntries] = useState<GeneratorHistoryEntry[]>([]);
  const [decrypted, setDecrypted] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [clearingAll, setClearingAll] = useState(false);
  const [deletingUuid, setDeletingUuid] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await generatorHistoryApi.list();
      setEntries(data);
      // Decrypt all entries
      if (symmetricKey) {
        const dec: Record<string, string> = {};
        await Promise.all(
          data.map(async (e) => {
            try {
              dec[e.uuid] = await decryptWithKey(e.password, symmetricKey);
            } catch {
              dec[e.uuid] = '[cannot decrypt]';
            }
          })
        );
        setDecrypted(dec);
      }
    } catch {
      toast.error('Failed to load history');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symmetricKey]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = useCallback(async (uuid: string) => {
    setDeletingUuid(uuid);
    try {
      await generatorHistoryApi.deleteEntry(uuid);
      setEntries((prev) => prev.filter((e) => e.uuid !== uuid));
    } catch {
      toast.error('Failed to delete entry');
    } finally {
      setDeletingUuid(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClearAll = useCallback(async () => {
    setClearingAll(true);
    try {
      await generatorHistoryApi.clearAll();
      setEntries([]);
      setDecrypted({});
      toast.success('History cleared');
    } catch {
      toast.error('Failed to clear history');
    } finally {
      setClearingAll(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="py-8 text-center text-sm text-gray-400">Loading…</div>;

  return (
    <div className="space-y-3">
      {entries.length > 0 && (
        <div className="flex justify-end">
          <button type="button" onClick={handleClearAll} disabled={clearingAll}
            className="text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors">
            {clearingAll ? 'Clearing…' : 'Clear all'}
          </button>
        </div>
      )}
      {entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">No history yet. Generate a password to start tracking.</p>
      ) : (
        <div className="space-y-1">
          {entries.map((e) => {
            const pw = decrypted[e.uuid] ?? '…';
            const s = getPasswordStrength(pw);
            return (
              <div key={e.uuid} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg">
                <span className="flex-1 font-mono text-xs text-gray-700 truncate">{pw}</span>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.color}`} title={s.label} />
                <span className="text-[10px] text-gray-400 flex-shrink-0">
                  {e.created_at ? new Date(e.created_at).toLocaleDateString() : ''}
                </span>
                <button type="button"
                  onClick={async () => { await copyToClipboard(pw); toast.success('Copied'); }}
                  className="text-gray-400 hover:text-blue-600 flex-shrink-0" title="Copy">
                  <CopyIcon />
                </button>
                <button type="button"
                  onClick={() => handleDelete(e.uuid)}
                  disabled={deletingUuid === e.uuid}
                  className="text-gray-300 hover:text-red-500 flex-shrink-0 disabled:opacity-50" title="Delete">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Full Generator Page (default export) ────────────────────────────────────

type PageTab = 'generator' | 'history';

export default function Generator() {
  const toast = useToast();
  const symmetricKey = useSelector((s: RootState) => s.vault.symmetricKey);
  const [pageTab, setPageTab] = useState<PageTab>('generator');

  const handleGenerate = useCallback(async (pw: string) => {
    if (!symmetricKey) return;
    try {
      const enc = await encryptWithKey(pw, symmetricKey);
      await generatorHistoryApi.save(enc);
    } catch { /* fire-and-forget, don't block UX */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symmetricKey]);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Password Generator</h1>
        <p className="text-gray-500 text-sm mt-1">
          Generate strong, random passwords using a cryptographically secure source.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-5">
        {([['generator', 'Generator'], ['history', 'History']] as [PageTab, string][]).map(([t, label]) => (
          <button key={t} type="button" onClick={() => setPageTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              pageTab === t ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        {pageTab === 'generator' ? (
          <GeneratorUI onGenerate={handleGenerate} />
        ) : (
          <HistoryTab symmetricKey={symmetricKey} />
        )}
      </div>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
