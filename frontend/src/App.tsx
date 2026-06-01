import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider, useSelector } from 'react-redux';
import { store, RootState } from './store';
import { ToastProvider } from './components/ui/Toast';
import { AppLayout } from './components/layout/AppLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Vault from './pages/Vault';
import Dashboard from './pages/Dashboard';
import Unlock from './pages/Unlock';
import { ROUTES } from './utils/constants';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useSelector((s: RootState) => s.auth.isAuthenticated);
  const token = localStorage.getItem('access_token');
  if (!isAuthenticated && !token) return <Navigate to={ROUTES.LOGIN} replace />;
  return <>{children}</>;
}

function RequireUnlocked({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useSelector((s: RootState) => s.auth.isAuthenticated);
  const isUnlocked = useSelector((s: RootState) => s.vault.isUnlocked);
  const token = localStorage.getItem('access_token');

  if (!isAuthenticated && !token) return <Navigate to={ROUTES.LOGIN} replace />;
  if (!isUnlocked) return <Navigate to={ROUTES.UNLOCK} replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.LOGIN} element={<Login />} />
      <Route path={ROUTES.REGISTER} element={<Register />} />

      <Route
        path={ROUTES.UNLOCK}
        element={
          <RequireAuth>
            <Unlock />
          </RequireAuth>
        }
      />

      <Route
        element={
          <RequireUnlocked>
            <AppLayout />
          </RequireUnlocked>
        }
      >
        <Route path={ROUTES.VAULT} element={<Vault />} />
        <Route path={ROUTES.DASHBOARD} element={<Dashboard />} />
      </Route>

      <Route path="/" element={<Navigate to={ROUTES.VAULT} replace />} />
      <Route path="*" element={<Navigate to={ROUTES.VAULT} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </Provider>
  );
}
