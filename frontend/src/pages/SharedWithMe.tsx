import { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { sharingApi, VaultShareResponse, SharedItemResponse } from '../api/sharingApi';
import { loadPrivateKey, decryptSharedItem } from '../utils/keyExchange';
import { useToast } from '../components/ui/Toast';

type Tab = 'with-me' | 'by-me';

const STATUS_COLORS: Record<string, string> = {
  pending:  'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired:  'bg-gray-100 text-gray-500',
  revoked:  'bg-red-50 text-red-500',
};

function relativeDate(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}

function expiryLabel(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const now = new Date();
  if (d < now) return 'Expired';
  const diff = Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
  return `${diff}d left`;
}

// ─── Decrypted item viewer modal ──────────────────────────────────────────────

function ItemViewModal({
  data,
  onClose,
}: {
  data: { name: string; type: string; itemData: Record<string, unknown>; notes?: string } | null;
  onClose: () => void;
}) {
  const toast = useToast();
  if (!data) return null;

  const fields = data.itemData;

  const copyField = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900 truncate">{data.name}</h2>
            <span className="text-xs text-gray-400 capitalize">{data.type}</span>
          </div>
          <button type="button" onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {data.type === 'login' && (
            <>
              {fields.username && (
                <Field label="Username" value={String(fields.username)} onCopy={() => copyField(String(fields.username), 'Username')} />
              )}
              {fields.password && (
                <Field label="Password" value={String(fields.password)} secret onCopy={() => copyField(String(fields.password), 'Password')} />
              )}
              {Array.isArray(fields.uris) && fields.uris[0] && (
                <Field label="URL" value={String((fields.uris[0] as { uri: string }).uri)} />
              )}
            </>
          )}
          {data.type === 'card' && (
            <>
              {fields.cardholderName && <Field label="Cardholder" value={String(fields.cardholderName)} />}
              {fields.number && <Field label="Number" value={String(fields.number)} secret onCopy={() => copyField(String(fields.number), 'Card number')} />}
              {fields.expMonth && fields.expYear && (
                <Field label="Expires" value={`${fields.expMonth}/${fields.expYear}`} />
              )}
              {fields.code && <Field label="CVV" value={String(fields.code)} secret onCopy={() => copyField(String(fields.code), 'CVV')} />}
            </>
          )}
          {data.type === 'identity' && Object.entries(fields).map(([k, v]) =>
            v ? <Field key={k} label={k} value={String(v)} /> : null
          )}
          {data.type === 'note' && fields.content && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">{String(fields.content)}</div>
          )}
          {data.notes && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, secret, onCopy,
}: {
  label: string;
  value: string;
  secret?: boolean;
  onCopy?: () => void;
}) {
  const [show, setShow] = useState(!secret);
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-800 font-mono flex-1 truncate">
          {show ? value : '••••••••'}
        </span>
        {secret && (
          <button type="button" onClick={() => setShow((p) => !p)}
            className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
            {show ? 'Hide' : 'Show'}
          </button>
        )}
        {onCopy && (
          <button type="button" onClick={onCopy}
            className="text-xs text-blue-500 hover:text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
            Copy
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SharedWithMe() {
  const toast = useToast();
  const symmetricKey = useSelector((s: RootState) => s.vault.symmetricKey);

  const [tab, setTab] = useState<Tab>('with-me');
  const [withMe, setWithMe] = useState<VaultShareResponse[]>([]);
  const [byMe, setByMe]     = useState<VaultShareResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewData, setViewData] = useState<{ name: string; type: string; itemData: Record<string, unknown>; notes?: string } | null>(null);
  const [viewing, setViewing]   = useState(false);
  const [viewLoading, setViewLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        sharingApi.sharedWithMe(),
        sharingApi.sharedByMe(),
      ]);
      setWithMe(r1.data);
      setByMe(r2.data);
    } catch {
      toast.error('Failed to load shares');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleAccept = useCallback(async (uuid: string) => {
    try {
      await sharingApi.acceptShare(uuid);
      toast.success('Share accepted');
      reload();
    } catch {
      toast.error('Failed to accept share');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const handleDecline = useCallback(async (uuid: string) => {
    try {
      await sharingApi.declineShare(uuid);
      toast.success('Share declined');
      reload();
    } catch {
      toast.error('Failed to decline share');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const handleRevoke = useCallback(async (uuid: string) => {
    try {
      await sharingApi.revokeShare(uuid);
      toast.success('Share revoked');
      reload();
    } catch {
      toast.error('Failed to revoke share');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const handleView = useCallback(async (share: VaultShareResponse) => {
    if (!symmetricKey) { toast.error('Vault is locked'); return; }
    setViewLoading(true);
    setViewing(true);
    try {
      const { data } = await sharingApi.getSharedItem(share.uuid);
      const privateKey = await loadPrivateKey(symmetricKey);
      if (!privateKey) throw new Error('Share keys not set up on this device');
      const decrypted = await decryptSharedItem(
        data.encrypted_item_data,
        data.encrypted_item_key,
        privateKey,
      );
      setViewData(decrypted);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to decrypt item';
      toast.error(msg);
      setViewing(false);
    } finally {
      setViewLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symmetricKey]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-5">Shared Vault Items</h1>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-5">
        {([
          { id: 'with-me' as Tab, label: 'Shared With Me' },
          { id: 'by-me'   as Tab, label: 'Shared By Me'   },
        ] as const).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : tab === 'with-me' ? (
        withMe.length === 0 ? (
          <EmptyState text="No items have been shared with you yet." />
        ) : (
          <div className="space-y-2">
            {withMe.map((share) => (
              <div key={share.uuid}
                className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[share.status] || 'bg-gray-100 text-gray-500'}`}>
                      {share.status}
                    </span>
                    <span className="text-xs text-gray-400 capitalize">{share.permissions} access</span>
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-400">Expires: {expiryLabel(share.expires_at)}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mt-1 truncate">
                    From: {share.sharer_email || '—'}
                  </p>
                  {share.message && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">"{share.message}"</p>
                  )}
                  <p className="text-[10px] text-gray-400 mt-1">Received {relativeDate(share.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {share.status === 'pending' && (
                    <>
                      <button type="button" onClick={() => handleDecline(share.uuid)}
                        className="text-xs border border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                        Decline
                      </button>
                      <button type="button" onClick={() => handleAccept(share.uuid)}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                        Accept
                      </button>
                    </>
                  )}
                  {share.status === 'accepted' && (
                    <>
                      <button type="button" onClick={() => handleView(share)}
                        disabled={viewLoading}
                        className="text-xs bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg transition-colors">
                        {viewLoading ? 'Decrypting…' : 'View item'}
                      </button>
                      <button type="button" onClick={() => handleDecline(share.uuid)}
                        className="text-xs border border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        byMe.length === 0 ? (
          <EmptyState text="You haven't shared any items yet." />
        ) : (
          <div className="space-y-2">
            {byMe.map((share) => (
              <div key={share.uuid}
                className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[share.status] || 'bg-gray-100 text-gray-500'}`}>
                      {share.status}
                    </span>
                    <span className="text-xs text-gray-400 capitalize">{share.permissions} access</span>
                    <span className="text-xs text-gray-300">·</span>
                    <span className="text-xs text-gray-400">Expires: {expiryLabel(share.expires_at)}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mt-1 truncate">
                    To: {share.recipient_email}
                  </p>
                  {share.message && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">"{share.message}"</p>
                  )}
                  <p className="text-[10px] text-gray-400 mt-1">Shared {relativeDate(share.created_at)}</p>
                </div>
                {(share.status === 'pending' || share.status === 'accepted') && (
                  <button type="button" onClick={() => handleRevoke(share.uuid)}
                    className="flex-shrink-0 text-xs border border-red-200 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Decrypted item viewer */}
      {viewing && (
        <ItemViewModal
          data={viewData}
          onClose={() => { setViewing(false); setViewData(null); }}
        />
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-16">
      <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
      </svg>
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  );
}
