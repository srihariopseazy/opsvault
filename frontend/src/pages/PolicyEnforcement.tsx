import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { ROUTES } from '../utils/constants';

export default function PolicyEnforcement() {
  const navigate = useNavigate();
  const user = useSelector((s: RootState) => s.auth.user);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 max-w-md w-full p-8 text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        <div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Two-Factor Authentication Required</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            One or more organizations you belong to require all members to use two-factor authentication.
            You must set up 2FA before you can access your vault.
          </p>
          {user && (
            <p className="text-xs text-gray-400 mt-2">Signed in as <strong>{user.email}</strong></p>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left">
          <p className="text-sm text-amber-800">
            <strong>Policy enforced by your organization.</strong> Set up an authenticator app (Google Authenticator,
            Authy, etc.) and enable 2FA in your account settings to continue.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => navigate(ROUTES.SETTINGS)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            Set up 2FA in Settings
          </button>
          <button
            type="button"
            onClick={() => navigate(ROUTES.DASHBOARD)}
            className="w-full border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
