import { useState, useCallback } from 'react';
import { DecryptedVaultItem } from '../store/slices/vaultSlice';
import { copyToClipboard, getFaviconUrl } from '../utils/helpers';
import { useToast } from '../components/ui/Toast';

interface Props {
  item: DecryptedVaultItem;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function VaultItemDetail({ item, onEdit, onDelete, onClose }: Props) {
  const toast = useToast();
  const [showPassword, setShowPassword] = useState(false);

  const copy = useCallback(async (value: string, label: string) => {
    await copyToClipboard(value);
    toast.success(`${label} copied — clears in 30s`);
  }, [toast]);

  const data = item.itemData as Record<string, unknown>;
  const faviconUrl = item.type === 'login'
    ? getFaviconUrl((data.uris as Array<{ uri: string }>)?.[0]?.uri)
    : null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-gray-200 shadow-xl flex flex-col z-30">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3 min-w-0">
          {faviconUrl ? (
            <img src={faviconUrl} alt="" className="w-7 h-7 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <div className="w-7 h-7 rounded bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
              {item.name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="font-semibold text-gray-900 truncate">{item.name}</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {item.type === 'login' && (
          <>
            {data.username && (
              <Field
                label="Username"
                value={data.username as string}
                onCopy={() => copy(data.username as string, 'Username')}
              />
            )}
            {data.password && (
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Password</label>
                <div className="flex items-center gap-2">
                  <span className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono">
                    {showPassword ? data.password as string : '••••••••••••'}
                  </span>
                  <button
                    onClick={() => setShowPassword((p) => !p)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => copy(data.password as string, 'Password')}
                    className="p-2 text-gray-400 hover:text-blue-600"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
            {(data.uris as Array<{ uri: string }>)?.[0]?.uri && (
              <Field label="URL" value={(data.uris as Array<{ uri: string }>)[0].uri} />
            )}
          </>
        )}

        {item.type === 'note' && (
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Secure Note</label>
            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-lg p-3">
              {(data.content as string) || ''}
            </p>
          </div>
        )}

        {item.type === 'card' && (
          <>
            {data.cardholderName && <Field label="Cardholder" value={data.cardholderName as string} />}
            {data.number && (
              <Field
                label="Card number"
                value={data.number as string}
                onCopy={() => copy(data.number as string, 'Card number')}
              />
            )}
            {data.expMonth && data.expYear && (
              <Field label="Expiry" value={`${data.expMonth}/${data.expYear}`} />
            )}
            {data.code && (
              <Field label="CVV" value={data.code as string} onCopy={() => copy(data.code as string, 'CVV')} />
            )}
          </>
        )}

        {item.type === 'identity' && (
          <>
            {data.firstName && <Field label="First name" value={data.firstName as string} />}
            {data.lastName && <Field label="Last name" value={data.lastName as string} />}
            {data.email && <Field label="Email" value={data.email as string} />}
            {data.phone && <Field label="Phone" value={data.phone as string} />}
            {data.address1 && <Field label="Address" value={data.address1 as string} />}
          </>
        )}

        {item.notes && (
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Notes</label>
            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-lg p-3">
              {item.notes}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-200 flex gap-2">
        <button
          onClick={onEdit}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="px-4 py-2 text-red-600 border border-red-200 hover:bg-red-50 text-sm font-medium rounded-lg transition-colors"
        >
          Trash
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <span className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 break-all">
          {value}
        </span>
        {onCopy && (
          <button onClick={onCopy} className="p-2 text-gray-400 hover:text-blue-600 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
