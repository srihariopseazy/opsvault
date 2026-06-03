import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store';
import { setSymmetricKey, setItems, setLoading } from '../store/slices/vaultSlice';
import { clearAuth } from '../store/slices/authSlice';
import { useCrypto } from '../hooks/useCrypto';
import { decryptWithKey } from '../crypto/cryptoEngine';
import { vaultApi } from '../api/vaultApi';
import { authApi } from '../api/authApi';
import { useToast } from '../components/ui/Toast';
import { ROUTES } from '../utils/constants';
import { DecryptedVaultItem, CustomField } from '../store/slices/vaultSlice';

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return 'Unexpected error'; }
}

export default function Unlock() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const toast = useToast();
  const { deriveMasterKey, unwrapSymmetricKey } = useCrypto();

  const user = useSelector((s: RootState) => s.auth.user);
  const protectedSymmetricKey = useSelector((s: RootState) => s.auth.protectedSymmetricKey);
  const kdfIterations = useSelector((s: RootState) => s.auth.kdfIterations);

  const [password, setPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  const handleUnlock = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[Unlock] handleUnlock invoked');
    if (!password || !user || !protectedSymmetricKey) return;
    setUnlocking(true);
    try {
      console.log('[Unlock] step 1: deriving master key…');
      const masterKey = await deriveMasterKey(password, user.email, kdfIterations);

      console.log('[Unlock] step 2: unwrapping symmetric key…');
      const symKey = await unwrapSymmetricKey(protectedSymmetricKey, masterKey);
      dispatch(setSymmetricKey(symKey));

      console.log('[Unlock] step 3: syncing vault…');
      dispatch(setLoading(true));
      const syncRes = await vaultApi.sync();

      const decrypted: DecryptedVaultItem[] = (
        await Promise.all(
          syncRes.data.items.map(async (item) => {
            try {
              const nameStr = await decryptWithKey(item.name, symKey);
              const notesStr = item.notes ? await decryptWithKey(item.notes, symKey) : undefined;
              const dataStr = await decryptWithKey(item.item_data as string, symKey);

              let customFields: CustomField[] | null = null;
              if (item.custom_fields) {
                try {
                  const cfStr = await decryptWithKey(item.custom_fields, symKey);
                  customFields = JSON.parse(cfStr) as CustomField[];
                } catch { customFields = null; }
              }

              let totpSecret: string | undefined;
              if (item.totp_secret) {
                try {
                  totpSecret = await decryptWithKey(item.totp_secret, symKey);
                } catch { totpSecret = undefined; }
              }

              return {
                uuid: item.uuid,
                type: item.type as DecryptedVaultItem['type'],
                name: nameStr,
                notes: notesStr,
                favorite: item.favorite,
                folderId: item.folder_id,
                itemData: JSON.parse(dataStr),
                customFields,
                totpSecret,
                passwordHistory: item.password_history,
                reprompt: item.reprompt,
                deletedAt: item.deleted_at,
                createdAt: item.created_at,
                revisionDate: item.revision_date,
              };
            } catch (itemErr) {
              console.error('[Unlock] failed to decrypt item', item.uuid, itemErr);
              return null;
            }
          })
        )
      ).filter(Boolean) as DecryptedVaultItem[];

      dispatch(setItems(decrypted));
      dispatch(setLoading(false));
      console.log('[Unlock] done — navigating to vault');
      navigate(ROUTES.VAULT);
    } catch (err: unknown) {
      console.error('[Unlock] handleUnlock failed:', err);
      dispatch(setLoading(false));
      toast.error(errorMessage(err));
    } finally {
      setUnlocking(false);
    }
    // toast intentionally excluded from deps — stable reference, adding it
    // causes infinite re-creation of the callback (violates critical rule 5).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password, user, protectedSymmetricKey, kdfIterations, deriveMasterKey, unwrapSymmetricKey, dispatch, navigate]);

  const handleLogout = async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    dispatch(clearAuth());
    navigate(ROUTES.LOGIN);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <svg className="w-9 h-9 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-2xl font-bold tracking-tight text-gray-900">OPSVAULT</span>
          </div>
          <p className="text-gray-500 text-sm">Vault is locked</p>
          {user && (
            <p className="text-gray-400 text-xs mt-1">{user.email}</p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Master password</label>
              <input
                type="password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your master password"
              />
            </div>
            <button
              type="submit"
              disabled={unlocking}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
            >
              {unlocking ? 'Unlocking…' : 'Unlock vault'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-400 mt-6">
          Not you?{' '}
          <button onClick={handleLogout} className="text-blue-600 hover:underline">
            Log out
          </button>
        </p>
      </div>
    </div>
  );
}
