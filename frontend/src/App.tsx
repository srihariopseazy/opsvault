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
import Folders from './pages/Folders';
import Generator from './pages/Generator';
import Trash from './pages/Trash';
import Export from './pages/Export';
import Import from './pages/Import';
import Settings from './pages/Settings';
import VaultHealth from './pages/VaultHealth';
import SessionManagement from './pages/SessionManagement';
import Organizations from './pages/Organizations';
import OrgDetail from './pages/OrgDetail';
import CollectionDetail from './pages/CollectionDetail';
import EmergencyAccess from './pages/EmergencyAccess';
import SendItems from './pages/SendItems';
import SendView from './pages/SendView';
import AdminConsole from './pages/AdminConsole';
import AdminOrgDetail from './pages/AdminOrgDetail';
import PolicyEnforcement from './pages/PolicyEnforcement';
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
      {/* Public auth routes */}
      <Route path={ROUTES.LOGIN} element={<Login />} />
      <Route path={ROUTES.REGISTER} element={<Register />} />

      {/* Authenticated but vault may be locked */}
      <Route
        path={ROUTES.UNLOCK}
        element={
          <RequireAuth>
            <Unlock />
          </RequireAuth>
        }
      />

      {/* Authenticated + vault unlocked — inside AppLayout */}
      <Route
        element={
          <RequireUnlocked>
            <AppLayout />
          </RequireUnlocked>
        }
      >
        <Route path={ROUTES.VAULT}        element={<Vault />} />
        <Route path={ROUTES.DASHBOARD}    element={<Dashboard />} />
        <Route path={ROUTES.FOLDERS}      element={<Folders />} />
        <Route path={ROUTES.GENERATOR}    element={<Generator />} />
        <Route path={ROUTES.TRASH}        element={<Trash />} />
        <Route path={ROUTES.EXPORT}              element={<Export />} />
        <Route path={ROUTES.IMPORT}              element={<Import />} />
        <Route path={ROUTES.SETTINGS}            element={<Settings />} />
        <Route path={ROUTES.VAULT_HEALTH}        element={<VaultHealth />} />
        <Route path={ROUTES.SESSION_MANAGEMENT}  element={<SessionManagement />} />
        <Route path={ROUTES.ORGANIZATIONS}        element={<Organizations />} />
        <Route path="/organizations/:uuid"        element={<OrgDetail />} />
        <Route path="/organizations/:uuid/collections/:colUuid" element={<CollectionDetail />} />
        <Route path={ROUTES.EMERGENCY_ACCESS} element={<EmergencyAccess />} />
        <Route path={ROUTES.SEND_ITEMS}        element={<SendItems />} />
        <Route path={ROUTES.ADMIN_CONSOLE}    element={<AdminConsole />} />
        <Route path="/admin/orgs/:uuid"       element={<AdminOrgDetail />} />
      </Route>

      {/* Auth required but vault may be locked — policy enforcement */}
      <Route
        path={ROUTES.POLICY_ENFORCEMENT}
        element={
          <RequireAuth>
            <PolicyEnforcement />
          </RequireAuth>
        }
      />

      {/* Public send view — no auth required */}
      <Route path="/send/:accessId" element={<SendView />} />

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
