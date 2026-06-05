import { useState, useCallback } from 'react';
import { DecryptedVaultItem } from '../../store/slices/vaultSlice';
import { useToast } from '../ui/Toast';
import { sharingApi } from '../../api/sharingApi';
import { encryptItemForShare } from '../../utils/keyExchange';

interface Props {
  open: boolean;
  item: DecryptedVaultItem | null;
  onClose: () => void;
}

export function ShareItemModal({ open, item, onClose }: Props) {
  const toast = useToast();
  const [email, setEmail]         = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [expiryDays, setExpiryDays] = useState<string>('7');
  const [message, setMessage]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleClose = useCallback(() => {
    setEmail('');
    setPermission('view');
    setExpiryDays('7');
    setMessage('');
    onClose();
  }, [onClose]);

  const handleShare = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item || !email.trim()) return;
    setSubmitting(true);
    try {
      // Fetch recipient's public key
      const { data: pkData } = await sharingApi.getPublicKey(email.trim());

      // Encrypt item for recipient
      const { encrypted_item_data, encrypted_item_key } = await encryptItemForShare(
        {
          name: item.name,
          type: item.type,
          itemData: item.itemData,
          notes: item.notes,
        },
        pkData.public_key,
      );

      const expires_in_days = expiryDays === 'never' ? null : parseInt(expiryDays, 10);

      await sharingApi.createShare({
        vault_item_uuid: item.uuid,
        recipient_email: email.trim(),
        encrypted_item_data,
        encrypted_item_key,
        permissions: permission,
        expires_in_days,
        message: message.trim() || null,
      });

      toast.success(`"${item.name}" shared with ${email.trim()}`);
      handleClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Share failed';
      // Check for common error patterns
      if (msg.includes('404') || msg.includes('not found')) {
        toast.error('Recipient not found or has not set up sharing keys');
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }, [item, email, permission, expiryDays, message, handleClose, toast]);

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Share Item</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{item.name}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleShare} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Recipient email
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Permission</label>
              <select
                value={permission}
                onChange={(e) => setPermission(e.target.value as 'view' | 'edit')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="view">View only</option>
                <option value="edit">Can edit</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expires</label>
              <select
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="never">Never</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a note for the recipient…"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
            The item is encrypted before being sent. The recipient will need to accept the share before viewing.
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !email.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              {submitting ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Sharing…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Share
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
