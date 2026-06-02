import { useEffect, useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { RootState } from '../store';
import client from '../api/client';
import { isWeakPassword } from '../utils/passwordUtils';
import { ROUTES } from '../utils/constants';

interface RecentItemSummary {
  uuid: string;
  type: string;
  created_at?: string;
  updated_at?: string;
}

interface Stats {
  total_items: number;
  logins: number;
  notes: number;
  cards: number;
  identities: number;
  favorites: number;
  trash: number;
  weak_passwords_count: number;
  reused_passwords_count: number;
  recent_items: RecentItemSummary[];
  recent_modified: RecentItemSummary[];
}

function StatCard({
  label, value, icon, color = 'text-gray-900', onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`bg-white border border-gray-200 rounded-xl p-5 ${onClick ? 'cursor-pointer hover:border-blue-200 hover:shadow-sm transition-all' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        <span className="text-gray-400">{icon}</span>
      </div>
      <span className={`text-3xl font-bold ${color}`}>{value}</span>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useSelector((s: RootState) => s.auth.user);
  const vaultItems = useSelector((s: RootState) => s.vault.items);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    client.get<Stats>('/dashboard/stats').then((r) => setStats(r.data)).catch(() => {});
  }, []);

  // Compute security metrics from decrypted vault data in Redux
  const securityMetrics = useMemo(() => {
    const logins = vaultItems.filter(
      (i) => i.type === 'login' && !i.deletedAt
    );

    // Weak passwords
    let weakCount = 0;
    const passwordCounts: Record<string, number> = {};
    for (const item of logins) {
      const pw = (item.itemData as Record<string, unknown>).password as string | undefined;
      if (pw) {
        if (isWeakPassword(pw)) weakCount++;
        passwordCounts[pw] = (passwordCounts[pw] || 0) + 1;
      }
    }

    // Reused passwords
    const reusedCount = Object.values(passwordCounts).filter((c) => c > 1).length;

    return { weakCount, reusedCount };
  }, [vaultItems]);

  // Recent items — match UUID from API with decrypted Redux items for display name
  const recentWithNames = useMemo(() => {
    if (!stats) return [];
    return stats.recent_items.map((r) => {
      const found = vaultItems.find((i) => i.uuid === r.uuid);
      return { ...r, name: found?.name || '(encrypted)' };
    });
  }, [stats, vaultItems]);

  const modifiedWithNames = useMemo(() => {
    if (!stats) return [];
    return stats.recent_modified.map((r) => {
      const found = vaultItems.find((i) => i.uuid === r.uuid);
      return { ...r, name: found?.name || '(encrypted)' };
    });
  }, [stats, vaultItems]);

  const typeColors: Record<string, string> = {
    login:    'bg-blue-100 text-blue-700',
    note:     'bg-green-100 text-green-700',
    card:     'bg-purple-100 text-purple-700',
    identity: 'bg-orange-100 text-orange-700',
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.name?.split(' ')[0]}
        </h1>
        <p className="text-gray-500 text-sm mt-1">{user?.email}</p>
      </div>

      {/* Primary stat cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total items" value={stats.total_items}
            icon={<BoxIcon />}
            onClick={() => navigate(ROUTES.VAULT)}
          />
          <StatCard
            label="Logins" value={stats.logins}
            icon={<KeyIcon />}
            onClick={() => navigate(ROUTES.VAULT)}
          />
          <StatCard
            label="Favorites" value={stats.favorites}
            icon={<StarIcon />}
          />
          <StatCard
            label="Trash" value={stats.trash}
            icon={<TrashIcon />}
            onClick={() => navigate(ROUTES.TRASH)}
          />
        </div>
      )}

      {/* Security metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Notes" value={stats?.notes ?? 0}
          icon={<NoteIcon />}
          onClick={() => navigate(ROUTES.VAULT)}
        />
        <StatCard
          label="Cards" value={stats?.cards ?? 0}
          icon={<CardIcon />}
          onClick={() => navigate(ROUTES.VAULT)}
        />
        <StatCard
          label="Weak passwords"
          value={securityMetrics.weakCount}
          icon={<ShieldAlertIcon />}
          color={securityMetrics.weakCount > 0 ? 'text-red-600' : 'text-green-600'}
        />
        <StatCard
          label="Reused passwords"
          value={securityMetrics.reusedCount}
          icon={<RepeatIcon />}
          color={securityMetrics.reusedCount > 0 ? 'text-orange-600' : 'text-green-600'}
        />
      </div>

      {/* Type breakdown + Recent activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Item breakdown</h2>
          {stats ? (
            <div className="space-y-3">
              {[
                { label: 'Logins',      count: stats.logins,     color: 'bg-blue-500' },
                { label: 'Secure notes', count: stats.notes,      color: 'bg-green-500' },
                { label: 'Cards',        count: stats.cards,      color: 'bg-purple-500' },
                { label: 'Identities',   count: stats.identities, color: 'bg-orange-500' },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
                  <span className="text-sm text-gray-600 w-28">{label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className={`${color} h-2 rounded-full transition-all`}
                      style={{ width: stats.total_items ? `${(count / stats.total_items) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700 w-6 text-right">{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Loading…</p>
          )}
        </div>

        {/* Recently added */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Recently added</h2>
          {recentWithNames.length === 0 ? (
            <p className="text-sm text-gray-400">No items yet</p>
          ) : (
            <div className="space-y-2">
              {recentWithNames.map((item) => (
                <div
                  key={item.uuid}
                  className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-1.5 rounded-lg"
                  onClick={() => navigate(ROUTES.VAULT)}
                >
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${typeColors[item.type] || 'bg-gray-100 text-gray-600'}`}>
                    {item.type}
                  </span>
                  <span className="text-sm text-gray-800 truncate flex-1">{item.name}</span>
                  {item.created_at && (
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recently modified */}
      {modifiedWithNames.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Recently modified</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {modifiedWithNames.map((item) => (
              <div
                key={item.uuid}
                className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-1.5 rounded-lg"
                onClick={() => navigate(ROUTES.VAULT)}
              >
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${typeColors[item.type] || 'bg-gray-100 text-gray-600'}`}>
                  {item.type}
                </span>
                <span className="text-sm text-gray-800 truncate flex-1">{item.name}</span>
                {item.updated_at && (
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {new Date(item.updated_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inline icon helpers ─────────────────────────────────────────────────────
const p2 = (d: string) => <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />;
const Icon = ({ d }: { d: string }) => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">{p2(d)}</svg>
);

const BoxIcon = () => <Icon d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />;
const KeyIcon = () => <Icon d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />;
const StarIcon = () => <Icon d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />;
const TrashIcon = () => <Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />;
const NoteIcon = () => <Icon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />;
const CardIcon = () => <Icon d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />;
const ShieldAlertIcon = () => <Icon d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />;
const RepeatIcon = () => <Icon d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />;
