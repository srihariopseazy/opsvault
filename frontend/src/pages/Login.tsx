import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../store';
import { setAuth } from '../store/slices/authSlice';
import { setSymmetricKey, setItems, setLoading } from '../store/slices/vaultSlice';
import { authApi } from '../api/authApi';
import { vaultApi } from '../api/vaultApi';
import { useCrypto } from '../hooks/useCrypto';
import { decryptWithKey } from '../crypto/cryptoEngine';
import { useToast } from '../components/ui/Toast';
import { ROUTES } from '../utils/constants';
import { DecryptedVaultItem } from '../store/slices/vaultSlice';

export default function Login() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const toast = useToast();
  const { deriveMasterKey, deriveMasterPasswordHash, unwrapSymmetricKey } = useCrypto();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    try {
      const masterKey = await deriveMasterKey(password, email);
      const masterPasswordHash = await deriveMasterPasswordHash(masterKey, password);

      const { data } = await authApi.login({ email, masterPasswordHash });

      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);

      dispatch(setAuth({
        user: data.user,
        protectedSymmetricKey: data.protected_symmetric_key,
        kdfIterations: data.kdf_iterations,
      }));

      const symKey = await unwrapSymmetricKey(data.protected_symmetric_key, masterKey);
      dispatch(setSymmetricKey(symKey));

      dispatch(setLoading(true));
      const syncRes = await vaultApi.sync();
      const decrypted: DecryptedVaultItem[] = await Promise.all(
        syncRes.data.items.map(async (item) => {
          try {
            const nameStr = await decryptWithKey(item.name, symKey);
            const notesStr = item.notes ? await decryptWithKey(item.notes, symKey) : undefined;
            const dataStr = await decryptWithKey(item.item_data as string, symKey);
            return {
              uuid: item.uuid,
              type: item.type as DecryptedVaultItem['type'],
              name: nameStr,
              notes: notesStr,
              favorite: item.favorite,
              folderId: item.folder_id,
              itemData: JSON.parse(dataStr),
              customFields: item.custom_fields,
              passwordHistory: item.password_history,
              reprompt: item.reprompt,
              deletedAt: item.deleted_at,
              createdAt: item.created_at,
              updatedAt: item.updated_at,
              revisionDate: item.revision_date,
            };
          } catch {
            return null;
          }
        })
      ).then((r) => r.filter(Boolean) as DecryptedVaultItem[]);

      dispatch(setItems(decrypted));
      dispatch(setLoading(false));
      navigate(ROUTES.VAULT);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Login failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [email, password, deriveMasterKey, deriveMasterPasswordHash, unwrapSymmetricKey, dispatch, navigate, toast]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <svg className="w-9 h-9 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-2xl font-bold tracking-tight text-gray-900">OPSVAULT</span>
          </div>
          <p className="text-gray-500 text-sm">Sign in to your vault</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Master password</label>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Your master password"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
            >
              {submitting ? 'Unlocking vault…' : 'Log in'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          No account?{' '}
          <Link to={ROUTES.REGISTER} className="text-blue-600 hover:underline font-medium">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
