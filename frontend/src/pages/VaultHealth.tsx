import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { DecryptedVaultItem } from '../store/slices/vaultSlice';
import { isWeakPassword } from '../utils/passwordUtils';
import { AddItemModal } from '../components/vault/AddItemModal';
import { foldersApi, FolderResponse } from '../api/foldersApi';
import { useEffect } from 'react';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

interface HealthIssue {
  item: DecryptedVaultItem;
  reason: string;
}

function getPassword(item: DecryptedVaultItem): string {
  return ((item.itemData as Record<string, unknown>).password as string) || '';
}

function getUri(item: DecryptedVaultItem): string {
  return (
    ((item.itemData as Record<string, unknown>).uris as Array<{ uri: string }>)?.[0]?.uri || ''
  );
}

function getTotp(item: DecryptedVaultItem): string {
  return ((item.itemData as Record<string, unknown>).totp as string) || '';
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  issues: HealthIssue[];
  color: string;
  onFix: (item: DecryptedVaultItem) => void;
}

function HealthSection({ title, icon, issues, color, onFix }: SectionProps) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className={`flex-shrink-0 ${color}`}>{icon}</span>
        <span className="flex-1 font-semibold text-gray-900 text-sm">{title}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${issues.length > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {issues.length === 0 ? '✓ All good' : `${issues.length} issue${issues.length !== 1 ? 's' : ''}`}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {expanded && issues.length > 0 && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {issues.map(({ item, reason }) => (
            <div key={item.uuid} className="flex items-center gap-3 px-5 py-3">
              <div className="w-7 h-7 rounded bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold flex-shrink-0">
                {item.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                <p className="text-xs text-gray-400 truncate">{reason}</p>
              </div>
              <button
                type="button"
                onClick={() => onFix(item)}
                className="flex-shrink-0 text-xs font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 px-2.5 py-1 rounded-lg transition-colors"
              >
                Fix
              </button>
            </div>
          ))}
        </div>
      )}
      {expanded && issues.length === 0 && (
        <p className="px-5 py-3 text-sm text-gray-400 border-t border-gray-100">No issues found.</p>
      )}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="100" height="100" className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="50" cy="50" r={r} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="text-center -mt-14">
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-base text-gray-400">/100</span>
      </div>
      <p className="text-xs text-gray-500 mt-12 font-medium">
        {score >= 80 ? 'Great' : score >= 50 ? 'Fair' : 'Needs attention'}
      </p>
    </div>
  );
}

export default function VaultHealth() {
  const items = useSelector((s: RootState) => s.vault.items);
  const symmetricKey = useSelector((s: RootState) => s.vault.symmetricKey);
  const [folders, setFolders] = useState<FolderResponse[]>([]);
  const [fixItem, setFixItem] = useState<DecryptedVaultItem | null>(null);

  useEffect(() => {
    foldersApi.listFolders().then((r) => setFolders(r.data)).catch(() => {});
  }, []);

  const loginItems = useMemo(
    () => items.filter((i) => i.type === 'login' && !i.deletedAt),
    [items]
  );

  const { weakIssues, reusedIssues, oldIssues, httpIssues, noTotpIssues, score } =
    useMemo(() => {
      const now = Date.now();

      const weak: HealthIssue[] = loginItems
        .filter((i) => isWeakPassword(getPassword(i)))
        .map((i) => ({ item: i, reason: 'Password is too weak' }));

      // Reused passwords
      const pwCount: Record<string, DecryptedVaultItem[]> = {};
      loginItems.forEach((i) => {
        const pw = getPassword(i);
        if (pw) {
          pwCount[pw] = pwCount[pw] || [];
          pwCount[pw].push(i);
        }
      });
      const reused: HealthIssue[] = Object.values(pwCount)
        .filter((group) => group.length > 1)
        .flat()
        .map((i) => ({ item: i, reason: 'Password is reused across multiple accounts' }));

      const old: HealthIssue[] = loginItems
        .filter((i) => {
          const ref = i.revisionDate || i.updatedAt || i.createdAt;
          if (!ref) return false;
          return now - new Date(ref).getTime() > NINETY_DAYS_MS;
        })
        .map((i) => ({ item: i, reason: 'Password not changed in over 90 days' }));

      const http: HealthIssue[] = loginItems
        .filter((i) => {
          const uri = getUri(i);
          return uri.startsWith('http://') && !uri.startsWith('https://');
        })
        .map((i) => ({ item: i, reason: 'URL uses insecure HTTP connection' }));

      const noTotp: HealthIssue[] = loginItems
        .filter((i) => !getTotp(i))
        .map((i) => ({ item: i, reason: 'No TOTP / 2FA secret configured' }));

      const total = loginItems.length;
      let healthScore = 100;
      if (total > 0) {
        healthScore = Math.round(
          ((loginItems.filter((i) => !isWeakPassword(getPassword(i))).length / total) * 30) +
          (((total - new Set(reused.map((r) => r.item.uuid)).size) / total) * 30) +
          ((loginItems.filter((i) => {
            const ref = i.revisionDate || i.updatedAt || i.createdAt;
            return !ref || now - new Date(ref).getTime() <= NINETY_DAYS_MS;
          }).length / total) * 15) +
          ((loginItems.filter((i) => {
            const uri = getUri(i);
            return !uri || uri.startsWith('https://') || !uri.startsWith('http://');
          }).length / total) * 15) +
          ((loginItems.filter((i) => !!getTotp(i)).length / total) * 10)
        );
      }

      return {
        weakIssues: weak,
        reusedIssues: reused,
        oldIssues: old,
        httpIssues: http,
        noTotpIssues: noTotp,
        score: total === 0 ? 100 : healthScore,
      };
    }, [loginItems]);

  const totalIssues = weakIssues.length + reusedIssues.length + oldIssues.length + httpIssues.length + noTotpIssues.length;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Vault Health</h1>
        <p className="text-gray-500 text-sm mt-1">Security analysis of your {loginItems.length} login item{loginItems.length !== 1 ? 's' : ''}.</p>
      </div>

      {/* Score card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-center gap-8">
        <ScoreRing score={score} />
        <div>
          <p className="text-lg font-semibold text-gray-900">Overall health score</p>
          <p className="text-sm text-gray-500 mt-1">
            {totalIssues === 0
              ? 'Your vault looks great! No security issues found.'
              : `${totalIssues} issue${totalIssues !== 1 ? 's' : ''} found across ${loginItems.length} login item${loginItems.length !== 1 ? 's' : ''}.`}
          </p>
          {totalIssues > 0 && (
            <p className="text-xs text-blue-600 mt-2">
              Click <strong>Fix</strong> on any issue to update that item.
            </p>
          )}
        </div>
      </div>

      {loginItems.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          No login items in your vault yet.
        </div>
      )}

      {loginItems.length > 0 && (
        <div className="space-y-3">
          <HealthSection
            title="Weak passwords"
            color="text-red-500"
            issues={weakIssues}
            onFix={(item) => setFixItem(item)}
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
          />
          <HealthSection
            title="Reused passwords"
            color="text-orange-500"
            issues={reusedIssues}
            onFix={(item) => setFixItem(item)}
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
          />
          <HealthSection
            title="Old passwords (>90 days)"
            color="text-yellow-500"
            issues={oldIssues}
            onFix={(item) => setFixItem(item)}
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <HealthSection
            title="Insecure URLs (HTTP)"
            color="text-amber-500"
            issues={httpIssues}
            onFix={(item) => setFixItem(item)}
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>}
          />
          <HealthSection
            title="Missing TOTP / 2FA"
            color="text-blue-400"
            issues={noTotpIssues}
            onFix={(item) => setFixItem(item)}
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
          />
        </div>
      )}

      {/* Fix modal */}
      <AddItemModal
        open={!!fixItem}
        onClose={() => setFixItem(null)}
        onSaved={() => setFixItem(null)}
        editingItem={fixItem}
        symmetricKey={symmetricKey}
        folders={folders}
      />
    </div>
  );
}
