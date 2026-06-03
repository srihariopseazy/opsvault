import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../store';
import { setAuth } from '../store/slices/authSlice';
import { ssoApi } from '../api/ssoApi';
import { ROUTES } from '../utils/constants';

export default function SsoCallback() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code  = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      setError('Missing code or state in SSO callback URL.');
      return;
    }

    let cancelled = false;

    ssoApi.oidcCallback(code, state)
      .then(({ data }) => {
        if (cancelled) return;

        localStorage.setItem('access_token',  data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);

        dispatch(setAuth({
          user: {
            uuid:         data.user_uuid,
            email:        data.user_email,
            name:         data.user_name,
            totp_enabled: false,
            is_superuser: false,
          },
          protectedSymmetricKey: data.protected_symmetric_key,
          kdfIterations:         data.kdf_iterations,
        }));

        // Redirect to unlock so the user can enter/set their master password
        navigate(ROUTES.UNLOCK, { replace: true });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
          ?? 'SSO authentication failed.';
        setError(msg);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-12 h-12 mx-auto bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-gray-900">SSO Login Failed</h2>
          <p className="text-sm text-gray-500">{error}</p>
          <Link to={ROUTES.LOGIN}
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 mx-auto border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Completing sign-in…</p>
      </div>
    </div>
  );
}
