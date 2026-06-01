import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../store';
import { setAuth } from '../store/slices/authSlice';
import { setSymmetricKey, setItems } from '../store/slices/vaultSlice';
import { authApi } from '../api/authApi';
import { useCrypto } from '../hooks/useCrypto';
import { useToast } from '../components/ui/Toast';
import { ROUTES, KDF_ITERATIONS } from '../utils/constants';

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unexpected error';
  }
}

export default function Register() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const toast = useToast();
  const {
    deriveMasterKey,
    deriveMasterPasswordHash,
    generateSymmetricKey,
    wrapSymmetricKey,
    unwrapSymmetricKey,
  } = useCrypto();

  const [form, setForm] = useState({
    email: '',
    name: '',
    password: '',
    confirm: '',
    hint: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [field]: e.target.value }));

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[Register] handleSubmit invoked');

    if (form.password !== form.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      toast.error('Master password must be at least 8 characters');
      return;
    }

    setSubmitting(true);
    try {
      console.log('[Register] step 1: deriving master key…');
      const masterKey = await deriveMasterKey(form.password, form.email, KDF_ITERATIONS);

      console.log('[Register] step 2: deriving master password hash…');
      const masterPasswordHash = await deriveMasterPasswordHash(masterKey, form.password);

      console.log('[Register] step 3: generating symmetric key…');
      const symKey = await generateSymmetricKey();

      console.log('[Register] step 4: wrapping symmetric key…');
      const protectedSymmetricKey = await wrapSymmetricKey(symKey, masterKey);

      console.log('[Register] step 5: calling /auth/register…');
      const { data } = await authApi.register({
        email: form.email,
        name: form.name,
        masterPasswordHash,
        masterPasswordHint: form.hint || undefined,
        protectedSymmetricKey,
        kdfIterations: KDF_ITERATIONS,
      });
      console.log('[Register] step 6: register API returned', data.user);

      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);

      dispatch(setAuth({
        user: data.user,
        protectedSymmetricKey: data.protected_symmetric_key,
        kdfIterations: data.kdf_iterations,
      }));

      console.log('[Register] step 7: unwrapping symmetric key into memory…');
      const loadedKey = await unwrapSymmetricKey(data.protected_symmetric_key, masterKey);
      dispatch(setSymmetricKey(loadedKey));
      dispatch(setItems([]));

      console.log('[Register] done — navigating to vault');
      toast.success('Account created! Welcome to OPSVAULT.');
      navigate(ROUTES.VAULT);
    } catch (err: unknown) {
      console.error('[Register] handleSubmit failed:', err);
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, deriveMasterKey, deriveMasterPasswordHash, generateSymmetricKey, wrapSymmetricKey, unwrapSymmetricKey, dispatch, navigate]);

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
          <p className="text-gray-500 text-sm">Create your secure vault</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={set('name')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={set('email')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Master password</label>
              <input
                type="password"
                required
                value={form.password}
                onChange={set('password')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm master password</label>
              <input
                type="password"
                required
                value={form.confirm}
                onChange={set('confirm')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Repeat your master password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password hint <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={form.hint}
                onChange={set('hint')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="A hint to help you remember"
              />
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              <strong>Important:</strong> Your master password cannot be recovered. OPSVAULT uses zero-knowledge
              encryption — your password never leaves your device.
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
            >
              {submitting ? 'Creating vault…' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link to={ROUTES.LOGIN} className="text-blue-600 hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
