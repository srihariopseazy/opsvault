import { useState, useCallback } from 'react';
import { deriveMasterKey, deriveMasterPasswordHash, unwrapSymmetricKey } from '../../shared/crypto';
import { authRequest, createApiKeyWithJwt, syncVault } from '../../shared/api';
import { setCredentials } from '../../shared/storage';
import type { DecryptedVaultItem } from '../../shared/types';

interface Props {
  onLoggedIn: (items: DecryptedVaultItem[]) => void;
  savedEmail?: string;
  savedServer?: string;
}

const S = {
  wrap: { padding: 24, display: 'flex', flexDirection: 'column' as const, gap: 0 },
  logo: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 },
  logoIcon: { width: 28, height: 28, background: '#2563eb', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  title: { fontWeight: 700, fontSize: 16, color: '#111827' },
  field: { marginBottom: 12 },
  label: { display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 },
  input: {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
    borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff',
    boxSizing: 'border-box' as const,
  },
  btn: {
    width: '100%', padding: '9px 0', background: '#2563eb', color: '#fff',
    border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  error: { color: '#dc2626', fontSize: 12, marginTop: 8, textAlign: 'center' as const },
  hint: { color: '#9ca3af', fontSize: 11, textAlign: 'center' as const, marginTop: 12 },
  serverToggle: { color: '#6b7280', fontSize: 11, textDecoration: 'underline', cursor: 'pointer', marginTop: 4 },
};

export default function LoginPage({ onLoggedIn, savedEmail, savedServer }: Props) {
  const [server, setServer] = useState(savedServer || 'http://178.105.94.101:8080');
  const [email, setEmail] = useState(savedEmail ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showServer, setShowServer] = useState(false);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError('');
    setLoading(true);

    try {
      const masterKey          = deriveMasterKey(password, email);
      const masterPasswordHash = deriveMasterPasswordHash(masterKey, password);

      const authData = await authRequest<{
        access_token?: string;
        mfa_required?: boolean;
        mfa_token?: string;
        protected_symmetric_key?: string;
      }>('/auth/login', { email, master_password_hash: masterPasswordHash, device_fingerprint: 'extension' }, server);

      if (authData.mfa_required) {
        setError('TOTP required — use the web app to log in first, then re-open the extension.');
        setLoading(false);
        return;
      }

      const accessToken = authData.access_token!;
      const psk         = authData.protected_symmetric_key!;
      const symKey      = unwrapSymmetricKey(psk, masterKey);

      // Create extension API key
      const apiKey = await createApiKeyWithJwt(accessToken, server);

      const credentials = { apiKey, email, server, protectedSymmetricKey: psk };
      await setCredentials(credentials);

      // Sync vault via service worker
      const rawItems = await syncVault(credentials);

      // Tell service worker to store session
      const result = await new Promise<{ success: boolean; itemCount: number }>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: 'LOGIN', payload: { symmetricKey: symKey, rawItems, credentials } },
          (res) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(res);
          },
        );
      });

      if (result.success) {
        const items = await new Promise<DecryptedVaultItem[]>((resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'GET_ITEMS' }, (res) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(res as DecryptedVaultItem[]);
          });
        });
        onLoggedIn(items);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }, [email, password, server, onLoggedIn]);

  return (
    <form onSubmit={handleLogin} style={S.wrap}>
      <div style={S.logo}>
        <div style={S.logoIcon}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <span style={S.title}>OPSVAULT</span>
      </div>

      {showServer && (
        <div style={S.field}>
          <label style={S.label}>Server URL</label>
          <input style={S.input} type="url" value={server} onChange={(e) => setServer(e.target.value)} />
        </div>
      )}

      <div style={S.field}>
        <label style={S.label}>Email</label>
        <input style={S.input} type="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </div>

      <div style={S.field}>
        <label style={S.label}>Master password</label>
        <input style={S.input} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your master password" />
      </div>

      <button type="submit" disabled={loading} style={{ ...S.btn, ...(loading ? S.btnDisabled : {}) }}>
        {loading ? 'Unlocking…' : 'Unlock vault'}
      </button>

      {error && <p style={S.error}>{error}</p>}

      <button type="button" onClick={() => setShowServer((p) => !p)} style={{ ...S.hint, ...S.serverToggle, border: 'none', background: 'none' }}>
        {showServer ? 'Hide server settings' : 'Change server URL'}
      </button>
    </form>
  );
}
