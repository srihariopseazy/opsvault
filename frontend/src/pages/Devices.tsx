import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/ui/Toast';
import { devicesApi, DeviceResponse } from '../api/devicesApi';
import CryptoJS from 'crypto-js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentFingerprint(): string {
  const raw = [
    navigator.userAgent,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join('|');
  return CryptoJS.SHA256(raw).toString();
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, isTrusted }: { status: string; isTrusted: boolean }) {
  if (status === 'wiped') {
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Wiped</span>;
  }
  if (status === 'revoked') {
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600">Revoked</span>;
  }
  if (isTrusted) {
    return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Trusted</span>;
  }
  return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Active</span>;
}

// ── Device icon ───────────────────────────────────────────────────────────────

function DeviceIcon({ type }: { type: string | null }) {
  const isMobile = type?.toLowerCase().includes('mobile');
  return (
    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
      {isMobile ? (
        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      )}
    </div>
  );
}

// ── Confirm wipe dialog ───────────────────────────────────────────────────────

function WipeConfirmDialog({
  device,
  onConfirm,
  onCancel,
}: {
  device: DeviceResponse;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 flex-shrink-0 bg-red-100 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Wipe Device</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              <span className="font-medium">{device.device_name || 'This device'}</span>
            </p>
          </div>
        </div>
        <p className="text-sm text-gray-700">
          This will permanently wipe this device and invalidate all sessions. This action cannot be undone.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel}
            className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={onConfirm}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 rounded-lg transition-colors">
            Wipe Device
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'trusted' | 'active' | 'wiped';

export default function Devices() {
  const toast = useToast();
  const [devices, setDevices] = useState<DeviceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [actioning, setActioning] = useState<string | null>(null);
  const [wipeTarget, setWipeTarget] = useState<DeviceResponse | null>(null);
  const fingerprint = currentFingerprint();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await devicesApi.listDevices();
      setDevices(data);
    } catch {
      toast.error('Failed to load devices');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = devices.filter((d) => {
    if (filter === 'trusted') return d.is_trusted && d.status === 'active';
    if (filter === 'active')  return d.status === 'active';
    if (filter === 'wiped')   return d.status === 'wiped' || d.status === 'revoked';
    return true;
  });

  const handleTrustToggle = async (d: DeviceResponse) => {
    setActioning(d.uuid);
    try {
      if (d.is_trusted) {
        await devicesApi.untrustDevice(d.uuid);
        toast.success('Device untrusted');
      } else {
        await devicesApi.trustDevice(d.uuid);
        toast.success('Device trusted');
      }
      load();
    } catch {
      toast.error('Action failed');
    } finally {
      setActioning(null);
    }
  };

  const handleRevoke = async (d: DeviceResponse) => {
    if (!confirm(`Revoke access for "${d.device_name || 'this device'}"?`)) return;
    setActioning(d.uuid);
    try {
      await devicesApi.revokeDevice(d.uuid);
      toast.success('Device revoked and sessions invalidated');
      load();
    } catch {
      toast.error('Failed to revoke device');
    } finally {
      setActioning(null);
    }
  };

  const handleWipe = async () => {
    if (!wipeTarget) return;
    setActioning(wipeTarget.uuid);
    setWipeTarget(null);
    try {
      await devicesApi.wipeDevice(wipeTarget.uuid);
      toast.success('Device wiped and sessions invalidated');
      load();
    } catch {
      toast.error('Failed to wipe device');
    } finally {
      setActioning(null);
    }
  };

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all',     label: 'All' },
    { key: 'active',  label: 'Active' },
    { key: 'trusted', label: 'Trusted' },
    { key: 'wiped',   label: 'Wiped / Revoked' },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Devices</h1>
          <p className="text-sm text-gray-500">Manage devices that have accessed your vault</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
        {filterTabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setFilter(t.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Device list */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">
            {filter === 'all' ? 'No devices found.' : `No ${filter} devices.`}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {visible.map((d) => {
              const isCurrent = d.device_fingerprint === fingerprint;
              const isActive  = d.status === 'active';
              const busy      = actioning === d.uuid;

              return (
                <div
                  key={d.uuid}
                  className={`px-5 py-4 flex items-start gap-4 ${
                    d.status !== 'active' ? 'opacity-60' : ''
                  }`}
                >
                  <DeviceIcon type={d.device_type} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {d.device_name || 'Unknown device'}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">
                          This device
                        </span>
                      )}
                      <StatusBadge status={d.status} isTrusted={d.is_trusted} />
                    </div>

                    <div className="mt-1 text-xs text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5">
                      {d.browser && <span>{d.browser}</span>}
                      {d.os && <span>{d.os}</span>}
                      {(d.last_seen_ip || d.ip_address) && (
                        <span>IP: {d.last_seen_ip || d.ip_address}</span>
                      )}
                      <span>Last seen: {fmtDate(d.last_used_at)}</span>
                      {d.wiped_at && (
                        <span className="text-red-400">
                          {d.status === 'wiped' ? 'Wiped' : 'Revoked'}: {fmtDate(d.wiped_at)}
                        </span>
                      )}
                    </div>
                  </div>

                  {isActive && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleTrustToggle(d)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          d.is_trusted
                            ? 'text-gray-600 border-gray-200 hover:bg-gray-50'
                            : 'text-blue-600 border-blue-200 hover:bg-blue-50'
                        } disabled:opacity-50`}
                      >
                        {d.is_trusted ? 'Untrust' : 'Trust'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRevoke(d)}
                        className="text-xs text-orange-600 border border-orange-200 hover:bg-orange-50 px-2 py-1 rounded transition-colors disabled:opacity-50"
                      >
                        Revoke
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setWipeTarget(d)}
                        className="text-xs text-red-600 border border-red-200 hover:bg-red-50 px-2 py-1 rounded transition-colors disabled:opacity-50"
                      >
                        Wipe
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {wipeTarget && (
        <WipeConfirmDialog
          device={wipeTarget}
          onConfirm={handleWipe}
          onCancel={() => setWipeTarget(null)}
        />
      )}
    </div>
  );
}
