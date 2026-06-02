import { useState, useCallback } from 'react';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { copyToClipboard } from '../utils/helpers';
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
}

function GeneratorUI({ onUse, compact = false }: GeneratorUIProps) {
  const toast = useToast();
  const [opts, setOpts] = useState<GeneratorOptions>(DEFAULT_GENERATOR_OPTIONS);
  const [password, setPassword] = useState(() => generatePassword(DEFAULT_GENERATOR_OPTIONS));
  const [history, setHistory] = useState<string[]>(() => getGeneratorHistory());

  const generate = useCallback(() => {
    const pw = generatePassword(opts);
    setPassword(pw);
    saveToGeneratorHistory(pw);
    setHistory(getGeneratorHistory());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts]);

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

      {/* History */}
      {!compact && history.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Recent history</p>
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

// ─── Full Generator Page (default export) ────────────────────────────────────

export default function Generator() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Password Generator</h1>
        <p className="text-gray-500 text-sm mt-1">
          Generate strong, random passwords using a cryptographically secure source.
        </p>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <GeneratorUI />
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
