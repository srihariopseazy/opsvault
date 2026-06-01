import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import client from '../api/client';

interface Stats {
  total_items: number;
  logins: number;
  notes: number;
  cards: number;
  identities: number;
  favorites: number;
  trash: number;
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        <span className="text-gray-400">{icon}</span>
      </div>
      <span className="text-3xl font-bold text-gray-900">{value}</span>
    </div>
  );
}

export default function Dashboard() {
  const user = useSelector((s: RootState) => s.auth.user);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    client.get<Stats>('/dashboard/stats').then((r) => setStats(r.data)).catch(() => {});
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.name?.split(' ')[0]}</h1>
        <p className="text-gray-500 text-sm mt-1">{user?.email}</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total items" value={stats.total_items} icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          } />
          <StatCard label="Logins" value={stats.logins} icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          } />
          <StatCard label="Favorites" value={stats.favorites} icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          } />
          <StatCard label="Trash" value={stats.trash} icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          } />
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Item breakdown</h2>
        {stats ? (
          <div className="space-y-3">
            {[
              { label: 'Logins', count: stats.logins, color: 'bg-blue-500' },
              { label: 'Secure notes', count: stats.notes, color: 'bg-green-500' },
              { label: 'Cards', count: stats.cards, color: 'bg-purple-500' },
              { label: 'Identities', count: stats.identities, color: 'bg-orange-500' },
            ].map(({ label, count, color }) => (
              <div key={label} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${color}`} />
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
    </div>
  );
}
