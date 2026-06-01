import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { RootState, AppDispatch } from '../../store';
import { clearAuth } from '../../store/slices/authSlice';
import { lockVault } from '../../store/slices/vaultSlice';
import { authApi } from '../../api/authApi';
import { ROUTES } from '../../utils/constants';

export function TopNav() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const user = useSelector((s: RootState) => s.auth.user);

  const handleLock = () => {
    dispatch(lockVault());
    navigate(ROUTES.UNLOCK);
  };

  const handleLogout = async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    dispatch(clearAuth());
    dispatch(lockVault());
    navigate(ROUTES.LOGIN);
  };

  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-5 flex-shrink-0">
      <div className="flex items-center gap-2">
        <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span className="font-bold text-gray-900 tracking-tight">OPSVAULT</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500 hidden md:block">{user?.email}</span>

        <button
          onClick={handleLock}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          title="Lock vault"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Lock
        </button>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Log out
        </button>
      </div>
    </header>
  );
}
