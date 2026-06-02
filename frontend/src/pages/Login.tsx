import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../store';
import { setAuth } from '../store/slices/authSlice';
import { setSymmetricKey, setItems, setLoading } from '../store/slices/vaultSlice';
import { authApi, AuthResponse } from '../api/authApi';
import { vaultApi } from '../api/vaultApi';
import { useCrypto } from '../hooks/useCrypto';
import { decryptWithKey } from '../crypto/cryptoEngine';
import { useToast } from '../components/ui/Toast';
import { ROUTES } from '../utils/constants';
import { DecryptedVaultItem } from '../store/slices/vaultSlice';
import CryptoJS from 'crypto-js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return 'Unexpected error'; }
}

/** SHA-256 fingerprint of the browser environment — used for trusted-device matching. */
function deviceFingerprint(): string {
  const raw = [
    navigator.userAgent,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join('|');
  return CryptoJS.SHA256(raw).toString();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Login() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const toast = useToast();
  const { deriveMasterKey, deriveMasterPasswordHash, unwrapSymmetricKey } = useCrypto();

  // Step 1 state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Step 2 state (MFA)
  const [step, setStep] = useState<1 | 2>(1);
  const [mfaToken, setMfaToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [submittingMfa, setSubmittingMfa] = useState(false);

  // Cached master key + symmetric key between step 1 and step 2
  const [cachedMasterKey, setCachedMasterKey] = useState('');

  // ── Shared post-login: decrypt vault and navigate ─────────────────────────

  const runPostLogin = useCallback(async (
    data: AuthResponse,
    masterKey: string,
  ) => {
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
    const decrypted: DecryptedVaultItem[] = (
      await Promise.all(
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
          } catch (itemErr) {
            console.error('[Login] failed to decrypt item', item.uuid, itemErr);
            return null;
          }
        })
      )
    ).filter(Boolean) as DecryptedVaultItem[];

    dispatch(setItems(decrypted));
    dispatch(setLoading(false));
    navigate(ROUTES.VAULT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, navigate, unwrapSymmetricKey]);

  // ── Step 1: email + password ──────────────────────────────────────────────

  const handleStep1 = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    try {
      const masterKey = await deriveMasterKey(password, email);
      const masterPasswordHash = await deriveMasterPasswordHash(masterKey, password);
      const fingerprint = deviceFingerprint();

      const { data } = await authApi.login({ email, masterPasswordHash, device_fingerprint: fingerprint });

      // Discriminate the union: check for mfa_required field
      if ('mfa_required' in data && data.mfa_required) {
        // Cache the master key so step 2 can use it without re-deriving
        setCachedMasterKey(masterKey);
        setMfaToken(data.mfa_token);
        setStep(2);
        return;
      }

      // Normal flow — full JWT received
      await runPostLogin(data as AuthResponse, masterKey);
    } catch (err: unknown) {
      console.error('[Login] step 1 failed:', err);
      dispatch(setLoading(false));
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, password, deriveMasterKey, deriveMasterPasswordHash, dispatch, runPostLogin]);

  // ── Step 2: TOTP verification ─────────────────────────────────────────────

  const handleStep2 = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode.trim()) return;
    setSubmittingMfa(true);
    try {
      const fingerprint = deviceFingerprint();
      const { data } = await authApi.verifyMfa({
        mfa_token: mfaToken,
        totp_code: totpCode.trim(),
        trust_device: trustDevice,
        device_fingerprint: fingerprint,
        device_name: navigator.userAgent.substring(0, 200),
      });
      await runPostLogin(data, cachedMasterKey);
    } catch (err: unknown) {
      console.error('[Login] step 2 failed:', err);
      toast.error(errorMessage(err));
    } finally {
      setSubmittingMfa(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totpCode, mfaToken, trustDevice, cachedMasterKey, runPostLogin]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <svg className="w-9 h-9 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-2xl font-bold tracking-tight text-gray-900">OPSVAULT</span>
          </div>
          <p className="text-gray-500 text-sm">
            {step === 1 ? 'Sign in to your vault' : 'Two-factor authentication'}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          {step === 1 ? (
            /* ── Step 1: email + master password ── */
            <form onSubmit={handleStep1} className="space-y-5">
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
          ) : (
            /* ── Step 2: TOTP code ── */
            <form onSubmit={handleStep2} className="space-y-5">
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <p className="text-sm text-blue-800">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Authenticator code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono tracking-[0.4em] text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="000000"
                  autoFocus
                />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={trustDevice}
                  onChange={(e) => setTrustDevice(e.target.checked)}
                  className="rounded border-gray-300 accent-blue-600"
                />
                <span className="text-sm text-gray-700">
                  Trust this device for 30 days
                </span>
              </label>

              <button
                type="submit"
                disabled={submittingMfa || totpCode.length !== 6}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
              >
                {submittingMfa ? 'Verifying…' : 'Verify code'}
              </button>

              <button
                type="button"
                onClick={() => { setStep(1); setTotpCode(''); setMfaToken(''); }}
                className="w-full text-sm text-gray-500 hover:text-gray-700 py-1 transition-colors"
              >
                ← Back to login
              </button>
            </form>
          )}
        </div>

        {step === 1 && (
          <p className="text-center text-sm text-gray-500 mt-6">
            No account?{' '}
            <Link to={ROUTES.REGISTER} className="text-blue-600 hover:underline font-medium">
              Create one
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
