import { useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { RootState, AppDispatch } from '../store';
import { clearAuth, updateProtectedSymmetricKey } from '../store/slices/authSlice';
import { lockVault } from '../store/slices/vaultSlice';
import { authApi } from '../api/authApi';
import { settingsApi } from '../api/settingsApi';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import { ROUTES } from '../utils/constants';
import {
  deriveMasterKey,
  deriveMasterPasswordHash,
  wrapSymmetricKey,
} from '../crypto/cryptoEngine';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <h2 className="text-base font-semibold text-gray-900 border-b border-gray-100 pb-3">{title}</h2>
      {children}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-600 mb-1">{label}</label>
      <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
        {value}
      </div>
    </div>
  );
}

function PasswordField({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => setShow((p) => !p)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const toast = useToast();

  const user = useSelector((s: RootState) => s.auth.user);
  const kdfIterations = useSelector((s: RootState) => s.auth.kdfIterations);
  const symmetricKey = useSelector((s: RootState) => s.vault.symmetricKey);

  // Change master password state
  const [cpForm, setCpForm] = useState({ current: '', newPw: '', confirm: '' });
  const [cpSaving, setCpSaving] = useState(false);

  // Security section
  const [loggingOut, setLoggingOut] = useState(false);

  // Danger zone
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  // ── Change master password ────────────────────────────────────────────────

  const handleChangeMasterPassword = useCallback(async () => {
    if (!user || !symmetricKey) return;
    if (!cpForm.current || !cpForm.newPw || !cpForm.confirm) {
      toast.error('All fields are required');
      return;
    }
    if (cpForm.newPw !== cpForm.confirm) {
      toast.error('New passwords do not match');
      return;
    }
    if (cpForm.newPw.length < 8) {
      toast.error('New master password must be at least 8 characters');
      return;
    }

    setCpSaving(true);
    try {
      // Derive current master password hash
      const currentMasterKey = await deriveMasterKey(cpForm.current, user.email, kdfIterations);
      const currentHash = await deriveMasterPasswordHash(currentMasterKey, cpForm.current);

      // Derive new master key + hash
      const newMasterKey = await deriveMasterKey(cpForm.newPw, user.email, kdfIterations);
      const newHash = await deriveMasterPasswordHash(newMasterKey, cpForm.newPw);

      // Re-encrypt the symmetric key with the new master key
      const newProtectedSymmetricKey = await wrapSymmetricKey(symmetricKey, newMasterKey);

      await authApi.changeMasterPassword({
        masterPasswordHash: currentHash,
        newMasterPasswordHash: newHash,
        newProtectedSymmetricKey,
      });

      // Update Redux with new protected key
      dispatch(updateProtectedSymmetricKey(newProtectedSymmetricKey));
      setCpForm({ current: '', newPw: '', confirm: '' });
      toast.success('Master password changed successfully');
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Failed to change master password';
      toast.error(msg);
    } finally {
      setCpSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpForm, user, symmetricKey, kdfIterations, dispatch]);

  // ── Logout all ───────────────────────────────────────────────────────────

  const handleLogoutAll = useCallback(async () => {
    setLoggingOut(true);
    try {
      await settingsApi.logoutAll();
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      dispatch(clearAuth());
      dispatch(lockVault());
      navigate(ROUTES.LOGIN);
    } catch {
      toast.error('Failed to log out all devices');
    } finally {
      setLoggingOut(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, navigate]);

  // ── Delete account ────────────────────────────────────────────────────────

  const handleDeleteAccount = useCallback(async () => {
    if (deleteConfirm !== 'DELETE') {
      toast.error('Type DELETE to confirm');
      return;
    }
    setDeleting(true);
    try {
      await settingsApi.deleteAccount();
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      dispatch(clearAuth());
      dispatch(lockVault());
      navigate(ROUTES.LOGIN);
    } catch {
      toast.error('Failed to delete account');
      setDeleting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteConfirm, dispatch, navigate]);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your account and security preferences.</p>
      </div>

      {/* Profile */}
      <Section title="Profile">
        <ReadOnlyField label="Name" value={user?.name || ''} />
        <ReadOnlyField label="Email address" value={user?.email || ''} />
      </Section>

      {/* Change master password */}
      <Section title="Change master password">
        <p className="text-sm text-gray-500 -mt-1">
          All crypto runs client-side. Your master password never leaves this device.
        </p>
        <PasswordField
          label="Current master password"
          value={cpForm.current}
          onChange={(v) => setCpForm((p) => ({ ...p, current: v }))}
          placeholder="Current master password"
        />
        <PasswordField
          label="New master password"
          value={cpForm.newPw}
          onChange={(v) => setCpForm((p) => ({ ...p, newPw: v }))}
          placeholder="At least 8 characters"
        />
        <PasswordField
          label="Confirm new master password"
          value={cpForm.confirm}
          onChange={(v) => setCpForm((p) => ({ ...p, confirm: v }))}
          placeholder="Repeat new master password"
        />
        <button
          type="button"
          onClick={handleChangeMasterPassword}
          disabled={cpSaving}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          {cpSaving ? 'Updating…' : 'Update master password'}
        </button>
      </Section>

      {/* Security */}
      <Section title="Security">
        <p className="text-sm text-gray-600">
          Log out from all browsers and devices simultaneously. You will need to sign in again.
        </p>
        <button
          type="button"
          onClick={handleLogoutAll}
          disabled={loggingOut}
          className="border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60 font-medium py-2 px-4 rounded-lg text-sm transition-colors"
        >
          {loggingOut ? 'Logging out…' : 'Log out all devices'}
        </button>
      </Section>

      {/* Danger zone */}
      <Section title="Danger zone">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800">Delete account</p>
          <p className="text-sm text-red-700 mt-1">
            Permanently deletes your account, all vault items, folders, and sessions.
            This action <strong>cannot</strong> be undone.
          </p>
          <button
            type="button"
            onClick={() => setDeleteModalOpen(true)}
            className="mt-3 border border-red-400 text-red-700 hover:bg-red-100 font-medium py-1.5 px-3 rounded-lg text-sm transition-colors"
          >
            Delete my account
          </button>
        </div>
      </Section>

      {/* Delete confirmation modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setDeleteConfirm(''); }}
        title="Delete account permanently"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            This will permanently delete your account and all data. To confirm, type{' '}
            <strong className="font-mono text-red-600">DELETE</strong> below.
          </p>
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="Type DELETE to confirm"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setDeleteModalOpen(false); setDeleteConfirm(''); }}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={deleting || deleteConfirm !== 'DELETE'}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              {deleting ? 'Deleting…' : 'Delete forever'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
