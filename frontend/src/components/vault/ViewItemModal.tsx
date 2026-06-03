import { useState, useCallback, useEffect } from 'react';
import { DecryptedVaultItem, CustomField } from '../../store/slices/vaultSlice';
import { FolderResponse } from '../../api/foldersApi';
import { useToast } from '../ui/Toast';
import { copyToClipboard, getFaviconUrl } from '../../utils/helpers';
import { ItemTypeFields, formFromDecryptedItem } from './ItemTypeFields';
import { ITEM_TYPES } from '../../utils/constants';
import { generateTOTP, isValidTOTPSecret, TOTPResult } from '../../utils/totpUtils';

interface Props {
  open: boolean;
  item: DecryptedVaultItem | null;
  onClose: () => void;
  onEdit: (item: DecryptedVaultItem) => void;
  onDelete: (item: DecryptedVaultItem) => void;
  onRestore?: (item: DecryptedVaultItem) => void;
  folders?: FolderResponse[];
}

interface HistoryEntry {
  password: string;
  changedAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  login:    'bg-blue-100 text-blue-700',
  note:     'bg-green-100 text-green-700',
  card:     'bg-purple-100 text-purple-700',
  identity: 'bg-orange-100 text-orange-700',
};

// ─── TOTP live ticker ─────────────────────────────────────────────────────────

function TOTPDisplay({ secret }: { secret: string }) {
  const toast = useToast();
  const [totp, setTotp] = useState<TOTPResult>(() => generateTOTP(secret));

  useEffect(() => {
    const tick = () => setTotp(generateTOTP(secret));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [secret]);

  const handleCopy = useCallback(async () => {
    await copyToClipboard(totp.code);
    toast.success('TOTP code copied — clears in 30s');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totp.code]);

  const pct = (totp.secondsRemaining / 30) * 100;
  const barColor = totp.secondsRemaining > 10 ? 'bg-green-500' : totp.secondsRemaining > 5 ? 'bg-amber-400' : 'bg-red-500';

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
        TOTP / 2FA code
      </label>
      <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
        <span className="flex-1 font-mono text-2xl font-bold tracking-widest text-gray-800">
          {totp.code}
        </span>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-gray-400">{totp.secondsRemaining}s</span>
          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
          title="Copy TOTP code"
        >
          <CopyIcon />
        </button>
      </div>
    </div>
  );
}

// ─── Password history ─────────────────────────────────────────────────────────

function PasswordHistorySection({ history }: { history: HistoryEntry[] }) {
  const toast = useToast();
  const [revealedIdx, setRevealedIdx] = useState<number | null>(null);

  const handleCopy = useCallback(async (pw: string) => {
    await copyToClipboard(pw);
    toast.success('Old password copied — clears in 30s');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
        Password history ({history.length})
      </label>
      <div className="space-y-1.5">
        {history.map((entry, idx) => (
          <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
            <span className="flex-1 font-mono text-sm text-gray-700">
              {revealedIdx === idx ? entry.password : '••••••••••••'}
            </span>
            <span className="text-xs text-gray-400 flex-shrink-0">
              {new Date(entry.changedAt).toLocaleDateString()}
            </span>
            <button
              type="button"
              onClick={() => setRevealedIdx(revealedIdx === idx ? null : idx)}
              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
              title={revealedIdx === idx ? 'Hide' : 'Reveal'}
            >
              {revealedIdx === idx ? <EyeOffIcon /> : <EyeIcon />}
            </button>
            <button
              type="button"
              onClick={() => handleCopy(entry.password)}
              className="text-gray-400 hover:text-blue-600 flex-shrink-0"
              title="Copy"
            >
              <CopyIcon />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Custom fields display ────────────────────────────────────────────────────

function CustomFieldsDisplay({
  fields,
  onCopy,
}: {
  fields: CustomField[];
  onCopy: (value: string) => void;
}) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const toggle = (idx: number) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
        Custom fields ({fields.length})
      </label>
      <div className="space-y-1.5">
        {fields.map((field, idx) => (
          <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
            <span className="text-[10px] font-semibold text-gray-400 uppercase w-14 flex-shrink-0 truncate">
              {field.name || 'Field'}
            </span>
            {field.type === 'boolean' ? (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-1 ${
                field.value === 'true' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {field.value === 'true' ? 'Enabled' : 'Disabled'}
              </span>
            ) : (
              <>
                <span className="flex-1 font-mono text-sm text-gray-700 min-w-0 truncate">
                  {field.type === 'hidden' && !revealed.has(idx)
                    ? '••••••••'
                    : field.value}
                </span>
                {field.type === 'hidden' && (
                  <button type="button" onClick={() => toggle(idx)}
                    className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                    {revealed.has(idx) ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                )}
                {field.value && (
                  <button type="button" onClick={() => onCopy(field.value)}
                    className="text-gray-400 hover:text-blue-600 flex-shrink-0">
                    <CopyIcon />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function ViewItemModal({ open, item, onClose, onEdit, onDelete, onRestore, folders = [] }: Props) {
  const toast = useToast();

  const handleCopy = useCallback(async (value: string, label: string) => {
    await copyToClipboard(value);
    toast.success(`${label} copied — clears in 30s`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open || !item) return null;

  const form = formFromDecryptedItem(item);
  const faviconUrl = item.type === 'login'
    ? getFaviconUrl((item.itemData as Record<string, Array<{ uri: string }>>).uris?.[0]?.uri)
    : null;
  const folderName = folders.find((f) => f.uuid === item.folderId)?.name;
  const typelabel = ITEM_TYPES[item.type] ?? item.type;

  // Password history — stored inside decrypted itemData
  const passwordHistory: HistoryEntry[] = item.type === 'login'
    ? ((item.itemData as Record<string, unknown>).password_history as HistoryEntry[]) || []
    : [];

  // TOTP secret — prefer the dedicated column, fall back to item_data.totp
  const totpSecret = item.type === 'login'
    ? (item.totpSecret || ((item.itemData as Record<string, unknown>).totp as string) || '')
    : '';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex-shrink-0">
            {faviconUrl ? (
              <img src={faviconUrl} alt="" className="w-8 h-8 rounded"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-sm">
                {item.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900 truncate">{item.name}</h2>
              {item.favorite && (
                <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[item.type] || 'bg-gray-100 text-gray-600'}`}>
                {typelabel}
              </span>
              {folderName && <span className="text-xs text-gray-400">📁 {folderName}</span>}
              {item.deletedAt && (
                <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">Trash</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Quick-copy row for logins */}
          {item.type === 'login' && (
            <div className="flex gap-2 flex-wrap">
              {form.username && (
                <button type="button" onClick={() => handleCopy(form.username, 'Username')}
                  className="flex-1 min-w-28 flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                  <CopyIcon /> Copy username
                </button>
              )}
              {form.password && (
                <button type="button" onClick={() => handleCopy(form.password, 'Password')}
                  className="flex-1 min-w-28 flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                  <CopyIcon /> Copy password
                </button>
              )}
              {form.uri && (
                <a href={form.uri.startsWith('http') ? form.uri : `https://${form.uri}`}
                  target="_blank" rel="noopener noreferrer"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Open
                </a>
              )}
            </div>
          )}

          {/* Field display */}
          <ItemTypeFields form={form} onChange={() => {}} readOnly />

          {/* TOTP live code */}
          {totpSecret && isValidTOTPSecret(totpSecret) && (
            <TOTPDisplay secret={totpSecret} />
          )}

          {/* Notes */}
          {item.notes && (
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notes</label>
              <p className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">
                {item.notes}
              </p>
            </div>
          )}

          {/* Custom fields */}
          {item.customFields && item.customFields.length > 0 && (
            <CustomFieldsDisplay fields={item.customFields} onCopy={(v) => handleCopy(v, 'Field')} />
          )}

          {/* Password history */}
          {passwordHistory.length > 0 && (
            <PasswordHistorySection history={passwordHistory} />
          )}

          {/* Metadata */}
          {item.createdAt && (
            <div className="text-xs text-gray-400 space-y-0.5 pt-2 border-t border-gray-100">
              <div>Created: {new Date(item.createdAt).toLocaleString()}</div>
              {item.updatedAt && <div>Modified: {new Date(item.updatedAt).toLocaleString()}</div>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex gap-2 flex-shrink-0">
          {item.deletedAt ? (
            <>
              {onRestore && (
                <button type="button" onClick={() => onRestore(item)}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-lg transition-colors">
                  Restore
                </button>
              )}
              <button type="button" onClick={() => onDelete(item)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 rounded-lg transition-colors">
                Delete permanently
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => onEdit(item)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors">
                Edit
              </button>
              <button type="button" onClick={() => onDelete(item)}
                className="px-4 py-2 text-red-600 border border-red-200 hover:bg-red-50 text-sm font-medium rounded-lg transition-colors">
                Move to trash
              </button>
            </>
          )}
          <button type="button" onClick={onClose}
            className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium rounded-lg transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}
