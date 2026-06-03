/**
 * Public page — no authentication required.
 * Accessible at /send/:accessId
 *
 * The decryption key lives in the URL fragment (#key=...) and is never sent to the server.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { sendApi } from '../api/sendApi';
import { decryptWithKey } from '../crypto/cryptoEngine';
import { copyToClipboard } from '../utils/helpers';

type ViewState =
  | 'loading'
  | 'password_required'
  | 'decrypting'
  | 'success'
  | 'error'
  | 'expired';

export default function SendView() {
  const { accessId } = useParams<{ accessId: string }>();

  const [state, setState] = useState<ViewState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [decryptedContent, setDecryptedContent] = useState('');
  const [password, setPassword] = useState('');
  const [sendKey, setSendKey] = useState('');
  const [copied, setCopied] = useState(false);

  const decryptContent = useCallback(async (encContent: string, key: string) => {
    setState('decrypting');
    try {
      const plain = await decryptWithKey(encContent, key);
      setDecryptedContent(plain);
      setState('success');
    } catch {
      setErrorMsg('Failed to decrypt content. The link may be incomplete or corrupted.');
      setState('error');
    }
  }, []);

  const fetchSend = useCallback(async (pw?: string) => {
    if (!accessId) return;

    // Key lives in URL fragment — never sent to server
    const hash = window.location.hash;
    const key = hash.startsWith('#key=') ? hash.slice(5) : '';

    if (!key) {
      setErrorMsg('This link is missing the decryption key. Please request the full link from the sender.');
      setState('error');
      return;
    }

    setSendKey(key);

    try {
      const { data } = await sendApi.publicAccess(accessId, pw);
      await decryptContent(data.content, key);
    } catch (err: unknown) {
      const e = err as {
        response?: { status?: number; headers?: Record<string, string>; data?: { detail?: string } };
        message?: string;
      };
      const httpStatus = e?.response?.status;
      const detail = e?.response?.data?.detail ?? e?.message ?? 'Unknown error';

      if (httpStatus === 403 || httpStatus === 401) {
        if (httpStatus === 403) {
          setState('password_required');
        } else {
          setErrorMsg('Incorrect password. Please try again.');
          setState('password_required');
        }
        return;
      }
      if (httpStatus === 410) {
        setErrorMsg(detail);
        setState('expired');
        return;
      }
      setErrorMsg(detail);
      setState('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessId, decryptContent]);

  useEffect(() => { fetchSend(); }, [fetchSend]);

  const handlePasswordSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setState('loading');
    await fetchSend(password.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password, fetchSend]);

  const handleCopy = useCallback(async () => {
    await copyToClipboard(decryptedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [decryptedContent]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-xl font-bold tracking-tight text-gray-900">OPSVAULT Send</span>
          </div>
          <p className="text-gray-500 text-sm">End-to-end encrypted content share</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {/* Loading */}
          {(state === 'loading' || state === 'decrypting') && (
            <div className="px-8 py-16 text-center">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                {state === 'decrypting' ? 'Decrypting content…' : 'Loading…'}
              </p>
            </div>
          )}

          {/* Password required */}
          {state === 'password_required' && (
            <form onSubmit={handlePasswordSubmit} className="px-8 py-8 space-y-4">
              <div className="text-center mb-2">
                <svg className="w-10 h-10 text-amber-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <p className="text-sm font-medium text-gray-800">Password required</p>
                {errorMsg && <p className="text-xs text-red-600 mt-1">{errorMsg}</p>}
              </div>
              <input
                type="password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter send password"
              />
              <button type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
                Unlock
              </button>
            </form>
          )}

          {/* Error */}
          {state === 'error' && (
            <div className="px-8 py-16 text-center">
              <svg className="w-10 h-10 text-red-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm font-medium text-gray-800 mb-1">Unable to load send</p>
              <p className="text-xs text-gray-500">{errorMsg}</p>
            </div>
          )}

          {/* Expired / gone */}
          {state === 'expired' && (
            <div className="px-8 py-16 text-center">
              <svg className="w-10 h-10 text-gray-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-gray-800 mb-1">Send has expired</p>
              <p className="text-xs text-gray-500">{errorMsg}</p>
            </div>
          )}

          {/* Success */}
          {state === 'success' && (
            <div className="px-8 py-8 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Decrypted content</p>
                <button type="button" onClick={handleCopy}
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10" />
                  </svg>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono break-all">
                  {decryptedContent}
                </pre>
              </div>
              <p className="text-xs text-gray-400 text-center">
                This content was decrypted entirely in your browser.
                The server never has access to the plaintext.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
