import { useState, useCallback } from 'react';
import type { DecryptedVaultItem, LoginItemData } from '../../shared/types';

interface Props {
  item: DecryptedVaultItem;
  currentTabUrl: string;
  onBack: () => void;
  onLock: () => void;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      style={{
        fontSize: 11, padding: '2px 8px', borderRadius: 4,
        border: '1px solid #e5e7eb', background: copied ? '#ecfdf5' : '#fff',
        color: copied ? '#059669' : '#374151', cursor: 'pointer',
        transition: 'all .15s',
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function FieldRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [show, setShow] = useState(!secret);
  if (!value) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ flex: 1, fontSize: 13, color: '#111827', fontFamily: secret ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>
          {show ? value : '••••••••'}
        </span>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {secret && (
            <button
              type="button"
              onClick={() => setShow((p) => !p)}
              style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 4,
                border: '1px solid #e5e7eb', background: '#fff',
                color: '#374151', cursor: 'pointer',
              }}
            >
              {show ? 'Hide' : 'Show'}
            </button>
          )}
          <CopyButton value={value} label={label} />
        </div>
      </div>
    </div>
  );
}

export default function ItemDetailPage({ item, currentTabUrl, onBack, onLock }: Props) {
  const [filling, setFilling] = useState(false);
  const [fillStatus, setFillStatus] = useState('');

  const d = item.itemData as LoginItemData;
  const uris = d.uris ?? [];

  const handleAutofill = useCallback(async () => {
    if (!d.username && !d.password) { setFillStatus('No credentials to fill'); return; }
    setFilling(true);
    setFillStatus('');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { setFillStatus('No active tab'); return; }

      const result = await new Promise<{ success: boolean; reason?: string }>((resolve) => {
        chrome.tabs.sendMessage(tab.id!, {
          type: 'AUTOFILL',
          payload: { username: d.username ?? '', password: d.password ?? '' },
        }, (res) => {
          if (chrome.runtime.lastError) resolve({ success: false, reason: chrome.runtime.lastError.message });
          else resolve(res ?? { success: false });
        });
      });

      setFillStatus(result.success ? '✓ Filled!' : (result.reason ?? 'Could not fill'));

      // Log autofill (best-effort)
      try {
        const { getCredentials } = await import('../../shared/storage');
        const creds = await getCredentials();
        if (creds) {
          await fetch(`${creds.server}/api/v1/extension/autofill-log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `ApiKey ${creds.apiKey}` },
            body: JSON.stringify({ item_uuid: item.uuid, url: currentTabUrl }),
          });
        }
      } catch { /* non-critical */ }
    } finally {
      setFilling(false);
      setTimeout(() => setFillStatus(''), 2000);
    }
  }, [d, item.uuid, currentTabUrl]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 600 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0,
      }}>
        <button type="button" onClick={onBack}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, borderRadius: 4, display: 'flex' }}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.name}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'capitalize' }}>{item.type}</div>
        </div>
        <button type="button" onClick={onLock}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, borderRadius: 4, display: 'flex' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </button>
      </div>

      {/* Fields */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {item.type === 'login' && (
          <>
            <FieldRow label="Username" value={String(d.username ?? '')} />
            <FieldRow label="Password" value={String(d.password ?? '')} secret />
            {uris[0] && <FieldRow label="URL" value={String(uris[0].uri)} />}
          </>
        )}
        {item.type === 'note' && (
          <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {String((item.itemData as Record<string, unknown>).content ?? '')}
          </div>
        )}
        {item.type === 'card' && (() => {
          const cd = item.itemData as Record<string, unknown>;
          return (
            <>
              <FieldRow label="Cardholder" value={String(cd.cardholderName ?? '')} />
              <FieldRow label="Number" value={String(cd.number ?? '')} secret />
              {cd.expMonth && cd.expYear && (
                <FieldRow label="Expires" value={`${cd.expMonth}/${cd.expYear}`} />
              )}
              <FieldRow label="CVV" value={String(cd.code ?? '')} secret />
            </>
          );
        })()}
        {item.notes && <FieldRow label="Notes" value={item.notes} />}

        {/* Autofill button — only for login items */}
        {item.type === 'login' && (
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={handleAutofill}
              disabled={filling}
              style={{
                width: '100%', padding: '9px 0', borderRadius: 8,
                background: '#2563eb', color: '#fff', border: 'none',
                fontWeight: 600, fontSize: 13, cursor: filling ? 'not-allowed' : 'pointer',
                opacity: filling ? 0.7 : 1,
              }}
            >
              {filling ? 'Filling…' : '↙ Autofill on page'}
            </button>
            {fillStatus && (
              <p style={{ textAlign: 'center', fontSize: 12, marginTop: 6, color: fillStatus.startsWith('✓') ? '#059669' : '#dc2626' }}>
                {fillStatus}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
