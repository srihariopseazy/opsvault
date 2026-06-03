import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
// sendDisabled policy flag is read from ui slice below
import { sendApi, SendInfo } from '../api/sendApi';
import { encryptWithKey, decryptWithKey } from '../crypto/cryptoEngine';
import { useToast } from '../components/ui/Toast';
import CryptoJS from 'crypto-js';

// ── Key generation for sends ──────────────────────────────────────────────────

function generateSendKey(): string {
  return CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex);
}

function buildShareUrl(accessId: string, key: string): string {
  return `${window.location.origin}/send/${accessId}#key=${key}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function isExpired(send: SendInfo): boolean {
  if (send.expiration_at && new Date(send.expiration_at) < new Date()) return true;
  if (new Date(send.deletion_at) < new Date()) return true;
  return false;
}

// ── Create send modal ─────────────────────────────────────────────────────────

function CreateSendModal({
  open, symmetricKey, onClose, onCreate,
}: {
  open: boolean;
  symmetricKey: string | null;
  onClose: () => void;
  onCreate: (name: string, content: string, sendKey: string, opts: CreateOpts) => Promise<void>;
}) {
  const [name, setName]         = useState('');
  const [content, setContent]   = useState('');
  const [password, setPassword] = useState('');
  const [maxAccess, setMaxAccess] = useState('');
  const [deleteDays, setDeleteDays] = useState(7);
  const [expiryDays, setExpiryDays] = useState('');
  const [hideContent, setHideContent] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim() || !symmetricKey) return;
    setSaving(true);
    const sendKey = generateSendKey();
    try {
      await onCreate(name.trim(), content.trim(), sendKey, {
        password: password || undefined,
        maxAccess: maxAccess ? Number(maxAccess) : undefined,
        deleteDays,
        expiryDays: expiryDays ? Number(expiryDays) : undefined,
        hideContent,
      });
      setName(''); setContent(''); setPassword(''); setMaxAccess(''); setDeleteDays(7); setExpiryDays(''); setHideContent(false);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 overflow-y-auto max-h-[90vh]">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Create send</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
            <input type="text" autoFocus required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. WiFi password" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content <span className="text-red-500">*</span></label>
            <textarea required rows={4} value={content} onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              placeholder="Text to share securely…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delete after (days) <span className="text-red-500">*</span></label>
              <input type="number" min={1} max={365} value={deleteDays} onChange={(e) => setDeleteDays(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expire after (days)</label>
              <input type="number" min={1} max={365} value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)}
                placeholder="No expiry"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max access count</label>
              <input type="number" min={1} value={maxAccess} onChange={(e) => setMaxAccess(e.target.value)}
                placeholder="Unlimited"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password (optional)</label>
              <input type="text" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="No password"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={hideContent} onChange={(e) => setHideContent(e.target.checked)} className="rounded border-gray-300 accent-blue-600" />
            <span className="text-sm text-gray-700">Hide content on access page</span>
          </label>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || !name.trim() || !content.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors">
              {saving ? 'Creating…' : 'Create send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CreateOpts {
  password?: string;
  maxAccess?: number;
  deleteDays: number;
  expiryDays?: number;
  hideContent: boolean;
}

// ── Main page ─────────────────────────────────────────────────────────────────

function SendItemRow({
  send, symmetricKey, onDelete, onCopyLink,
}: {
  send: SendInfo;
  symmetricKey: string | null;
  onDelete: (uuid: string) => void;
  onCopyLink: (send: SendInfo) => void;
}) {
  const [decryptedName, setDecryptedName] = useState<string>('');

  useEffect(() => {
    if (!symmetricKey) return;
    decryptWithKey(send.name, symmetricKey).then(setDecryptedName).catch(() => setDecryptedName('[encrypted]'));
  }, [send.name, symmetricKey]);

  const expired = isExpired(send);

  return (
    <div className={`flex items-center gap-4 px-6 py-4 ${expired ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">{decryptedName || '…'}</p>
          {expired && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">Expired</span>}
          {send.password_protected && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">🔒</span>}
          {send.disabled && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">Disabled</span>}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          {send.access_count} access{send.access_count !== 1 ? 'es' : ''}
          {send.max_access_count ? ` / ${send.max_access_count}` : ''}
          {' · '}Deletes {formatDate(send.deletion_at)}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {!expired && (
          <button type="button" onClick={() => onCopyLink(send)}
            className="text-xs font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 px-2.5 py-1 rounded-lg transition-colors">
            Copy link
          </button>
        )}
        <button type="button" onClick={() => onDelete(send.uuid)}
          className="text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors">
          Delete
        </button>
      </div>
    </div>
  );
}

export default function SendItems() {
  const toast = useToast();
  const symmetricKey = useSelector((s: RootState) => s.vault.symmetricKey);
  const sendDisabled = useSelector((s: RootState) => s.ui?.sendDisabled ?? false);

  const [sends, setSends] = useState<SendInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  // Store send keys keyed by access_id so we can rebuild share URLs
  const [sendKeys, setSendKeys] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await sendApi.listSends();
      setSends(data);
    } catch {
      toast.error('Failed to load sends');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = useCallback(async (
    name: string,
    content: string,
    sendKey: string,
    opts: CreateOpts,
  ) => {
    if (!symmetricKey) return;
    try {
      const encName    = await encryptWithKey(name, symmetricKey);
      const encContent = await encryptWithKey(content, sendKey);

      const now = new Date();
      const deletionAt = new Date(now.getTime() + opts.deleteDays * 86400_000).toISOString();
      const expirationAt = opts.expiryDays
        ? new Date(now.getTime() + opts.expiryDays * 86400_000).toISOString()
        : undefined;

      const { data } = await sendApi.createSend({
        type: 'text',
        name: encName,
        content: encContent,
        deletion_at: deletionAt,
        expiration_at: expirationAt,
        max_access_count: opts.maxAccess,
        password: opts.password,
        hide_content: opts.hideContent,
      });

      // Store the key so we can give the share URL
      setSendKeys((prev) => ({ ...prev, [data.access_id]: sendKey }));

      const shareUrl = buildShareUrl(data.access_id, sendKey);
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Send created — share link copied to clipboard!');
      await load();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Failed to create send';
      toast.error(msg);
      throw err;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symmetricKey, load]);

  const handleDelete = useCallback(async (uuid: string) => {
    try {
      await sendApi.deleteSend(uuid);
      setSends((prev) => prev.filter((s) => s.uuid !== uuid));
      toast.success('Send deleted');
    } catch {
      toast.error('Failed to delete send');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopyLink = useCallback(async (send: SendInfo) => {
    const key = sendKeys[send.access_id];
    if (!key) {
      toast.error('Share key not found — please recreate this send to get a link.');
      return;
    }
    const url = buildShareUrl(send.access_id, key);
    await navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendKeys]);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {sendDisabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-amber-800">Send is disabled by your organization policy.</p>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Send</h1>
          <p className="text-gray-500 text-sm mt-1">Share text securely via an expiring link.</p>
        </div>
        {!sendDisabled && (
          <button type="button" onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New send
          </button>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-sm text-amber-800">
          <strong>Zero-knowledge sends:</strong> content is encrypted in your browser before upload.
          The decryption key is embedded in the share URL's fragment — it never reaches our servers.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">Loading…</div>
        ) : sends.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">No sends yet.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {sends.map((send) => (
              <SendItemRow
                key={send.uuid}
                send={send}
                symmetricKey={symmetricKey}
                onDelete={handleDelete}
                onCopyLink={handleCopyLink}
              />
            ))}
          </div>
        )}
      </div>

      <CreateSendModal
        open={createOpen}
        symmetricKey={symmetricKey}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}
