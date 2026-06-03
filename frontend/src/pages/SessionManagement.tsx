import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../store';
import { clearAuth } from '../store/slices/authSlice';
import { lockVault } from '../store/slices/vaultSlice';
import { sessionsApi, SessionInfo, LoginEventInfo } from '../api/sessionsApi';
import { useToast } from '../components/ui/Toast';
import { ROUTES } from '../utils/constants';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function shortenUA(ua: string | null): string {
  if (!ua) return 'Unknown browser';
  // Extract browser name heuristically
  if (ua.includes('Edg/')) return 'Microsoft Edge';
  if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera';
  if (ua.includes('Firefox/')) return 'Mozilla Firefox';
  if (ua.includes('Chrome/')) return 'Google Chrome';
  if (ua.includes('Safari/')) return 'Safari';
  return ua.substring(0, 60);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="px-6 py-8 text-center text-sm text-gray-400">{message}</div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SessionManagement() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const toast = useToast();

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [events, setEvents] = useState<LoginEventInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sessRes, evtRes] = await Promise.all([
        sessionsApi.listSessions(),
        sessionsApi.listLoginEvents(),
      ]);
      setSessions(sessRes.data);
      setEvents(evtRes.data);
    } catch {
      toast.error('Failed to load session data');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRevoke = useCallback(async (sessionUuid: string, isCurrent: boolean) => {
    setRevoking(sessionUuid);
    try {
      await sessionsApi.revokeSession(sessionUuid);
      if (isCurrent) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        dispatch(clearAuth());
        dispatch(lockVault());
        navigate(ROUTES.LOGIN);
        return;
      }
      toast.success('Session revoked');
      await load();
    } catch {
      toast.error('Failed to revoke session');
    } finally {
      setRevoking(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, navigate, load]);

  const handleRevokeAll = useCallback(async () => {
    setRevokingAll(true);
    try {
      const { data } = await sessionsApi.revokeAll();
      toast.success(data.message);
      await load();
    } catch {
      toast.error('Failed to revoke sessions');
    } finally {
      setRevokingAll(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Session Management</h1>
          <p className="text-gray-500 text-sm mt-1">
            Review all active sessions and your recent login history.
          </p>
        </div>
        <Link
          to={ROUTES.DEVICES}
          className="flex-shrink-0 flex items-center gap-1.5 text-sm font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Manage Devices
        </Link>
      </div>

      {/* ── Active Sessions ─────────────────────────────────────────────────── */}
      <Section title={`Active Sessions${sessions.length ? ` (${sessions.length})` : ''}`}>
        {loading ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">Loading…</div>
        ) : sessions.length === 0 ? (
          <EmptyRow message="No active sessions found." />
        ) : (
          <>
            {/* Revoke all */}
            <div className="px-6 py-3 border-b border-gray-50 flex justify-end">
              <button
                type="button"
                onClick={handleRevokeAll}
                disabled={revokingAll || sessions.filter((s) => !s.is_current).length === 0}
                className="text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors"
              >
                {revokingAll ? 'Revoking…' : 'Revoke all other sessions'}
              </button>
            </div>

            <div className="divide-y divide-gray-50">
              {sessions.map((s) => (
                <div key={s.uuid} className="px-6 py-4 flex items-start gap-4">
                  {/* Device icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {s.device_name || 'Unknown device'}
                      </span>
                      {s.is_current && (
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">
                          This session
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 space-y-0.5">
                      {s.ip_address && <div>IP: {s.ip_address}</div>}
                      <div className="flex gap-3 flex-wrap">
                        {s.created_at && <span>Signed in: {formatDate(s.created_at)}</span>}
                        {s.last_used_at && <span>Last active: {relativeTime(s.last_used_at)}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Revoke */}
                  <button
                    type="button"
                    onClick={() => handleRevoke(s.uuid, s.is_current)}
                    disabled={revoking === s.uuid}
                    className="flex-shrink-0 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {revoking === s.uuid ? '…' : s.is_current ? 'Sign out' : 'Revoke'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* ── Login History ───────────────────────────────────────────────────── */}
      <Section title="Login History (last 20)">
        {loading ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">Loading…</div>
        ) : events.length === 0 ? (
          <EmptyRow message="No login events recorded yet." />
        ) : (
          <div className="divide-y divide-gray-50">
            {events.map((ev) => (
              <div key={ev.uuid} className="px-6 py-3 flex items-center gap-4">
                {/* Status badge */}
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                    ev.status === 'success'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {ev.status === 'success' ? 'Success' : 'Failed'}
                </span>

                {/* Details */}
                <div className="flex-1 min-w-0 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-0.5">
                  {ev.ip_address && <span>IP: {ev.ip_address}</span>}
                  <span>{shortenUA(ev.user_agent)}</span>
                  {ev.device_name && <span>{ev.device_name}</span>}
                </div>

                {/* Date */}
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {formatDate(ev.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
