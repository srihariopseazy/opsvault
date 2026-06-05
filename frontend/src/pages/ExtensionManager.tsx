import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/ui/Toast';
import { apiKeysApi, ApiKeyResponse } from '../api/apiKeysApi';

function CodeBlock({ children }: { children: string }) {
  const toast = useToast();
  const copy = async () => {
    await navigator.clipboard.writeText(children);
    toast.success('Copied!');
  };
  return (
    <div className="flex items-center justify-between bg-gray-900 text-green-400 font-mono text-xs rounded-lg px-4 py-3 gap-3 mt-1">
      <span className="truncate">{children}</span>
      <button type="button" onClick={copy}
        className="text-gray-400 hover:text-white transition-colors flex-shrink-0 text-[10px] border border-gray-600 px-1.5 py-0.5 rounded">
        copy
      </button>
    </div>
  );
}

function InstallStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {n}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        {children}
      </div>
    </div>
  );
}

export default function ExtensionManager() {
  const toast = useToast();
  const [extensionKeys, setExtensionKeys] = useState<ApiKeyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiKeysApi.listKeys();
      setExtensionKeys(data.filter((k) => k.name === 'Browser Extension' && k.is_active));
    } catch {
      toast.error('Failed to load extension keys');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRevokeAll = useCallback(async () => {
    if (!confirm('Revoke all extension API keys? The extension will need to log in again.')) return;
    setRevoking('all');
    try {
      await Promise.all(extensionKeys.map((k) => apiKeysApi.revokeKey(k.uuid)));
      toast.success('All extension keys revoked');
      load();
    } catch {
      toast.error('Failed to revoke some keys');
    } finally {
      setRevoking(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extensionKeys, load]);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-purple-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Browser Extension</h1>
          <p className="text-sm text-gray-500">Auto-fill passwords from OPSVAULT in your browser</p>
        </div>
      </div>

      {/* Install instructions */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Installation</h2>
        <div className="space-y-5">
          <InstallStep n={1} title="Build the extension">
            <CodeBlock>cd extension && npm install && npm run build</CodeBlock>
          </InstallStep>

          <InstallStep n={2} title="Load in Chrome">
            <ol className="text-sm text-gray-600 mt-1.5 space-y-1 list-decimal list-inside">
              <li>Open <code className="bg-gray-100 px-1 rounded">chrome://extensions</code></li>
              <li>Enable <strong>Developer mode</strong> (top right toggle)</li>
              <li>Click <strong>Load unpacked</strong></li>
              <li>Select the <code className="bg-gray-100 px-1 rounded">extension/dist/</code> folder</li>
            </ol>
          </InstallStep>

          <InstallStep n={3} title="Load in Firefox">
            <ol className="text-sm text-gray-600 mt-1.5 space-y-1 list-decimal list-inside">
              <li>Open <code className="bg-gray-100 px-1 rounded">about:debugging</code></li>
              <li>Click <strong>This Firefox</strong> → <strong>Load Temporary Add-on</strong></li>
              <li>Select <code className="bg-gray-100 px-1 rounded">extension/dist/manifest.json</code></li>
            </ol>
          </InstallStep>

          <InstallStep n={4} title="Log in via the extension popup">
            <p className="text-sm text-gray-600 mt-1">
              Click the OPSVAULT icon in your browser toolbar. Enter your email + master password. The extension creates its own API key automatically.
            </p>
          </InstallStep>
        </div>
      </div>

      {/* Active extension sessions */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Active Extension Sessions</h2>
          {extensionKeys.length > 0 && (
            <button
              type="button"
              onClick={handleRevokeAll}
              disabled={revoking === 'all'}
              className="text-sm text-red-600 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
            >
              {revoking === 'all' ? 'Revoking…' : 'Revoke all'}
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : extensionKeys.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">No active extension sessions.</p>
            <p className="text-xs text-gray-400 mt-1">Log in from the browser extension to create a session.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {extensionKeys.map((k) => (
              <div key={k.uuid} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{k.name}</span>
                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">Active</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Key: <code className="bg-gray-200 px-1 rounded">{k.key_prefix}…</code>
                    {k.last_used_at && <> · Last used: {new Date(k.last_used_at).toLocaleString()}</>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm('Revoke this extension key?')) return;
                    setRevoking(k.uuid);
                    try {
                      await apiKeysApi.revokeKey(k.uuid);
                      toast.success('Key revoked');
                      load();
                    } catch {
                      toast.error('Failed');
                    } finally {
                      setRevoking(null);
                    }
                  }}
                  disabled={revoking === k.uuid}
                  className="text-xs text-red-600 border border-red-200 hover:bg-red-50 px-2 py-1 rounded transition-colors disabled:opacity-60"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Features */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Features</h2>
        <ul className="space-y-2">
          {[
            ['Auto-fill',   'Detects login forms and fills username + password with one click'],
            ['URL matching', 'Shows matching credentials for the current tab automatically'],
            ['Vault search', 'Search all your vault items from the popup'],
            ['Auto-lock',    'Locks the vault after 15 minutes of inactivity'],
            ['Zero-knowledge', 'Master password never leaves your device — all crypto is client-side'],
          ].map(([title, desc]) => (
            <li key={title} className="flex items-start gap-3">
              <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-gray-700"><strong className="font-medium">{title}:</strong> {desc}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
