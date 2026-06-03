import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminApi, AdminOrg } from '../api/adminApi';
import { orgsApi, OrgMemberInfo } from '../api/orgsApi';
import { orgEventsApi, OrgEvent } from '../api/orgEventsApi';
import { useToast } from '../components/ui/Toast';

const ROLE_COLORS: Record<string, string> = {
  owner:  'bg-purple-100 text-purple-700',
  admin:  'bg-blue-100 text-blue-700',
  member: 'bg-gray-100 text-gray-600',
};

const STATUS_COLORS: Record<string, string> = {
  accepted: 'bg-green-100 text-green-700',
  invited:  'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-600',
};

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString();
}

export default function AdminOrgDetail() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [org, setOrg] = useState<AdminOrg | null>(null);
  const [members, setMembers] = useState<OrgMemberInfo[]>([]);
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    if (!uuid) return;
    setLoading(true);
    try {
      const [orgsRes, membersRes, eventsRes] = await Promise.all([
        adminApi.listOrgs({ search: '' }),
        orgsApi.getOrg(uuid).catch(() => null),
        orgEventsApi.getOrgEvents(uuid, { limit: 20 }).catch(() => ({ data: [] })),
      ]);
      const found = orgsRes.data.find((o) => o.uuid === uuid);
      if (found) setOrg(found);
      if (membersRes) setMembers(membersRes.data.members ?? []);
      setEvents(eventsRes.data);
    } catch {
      toast.error('Failed to load organization');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid]);

  useEffect(() => { load(); }, [load]);

  const handleSuspend = useCallback(async () => {
    if (!uuid || !window.confirm('Suspend this organization? Members will lose access.')) return;
    setActionBusy(true);
    try {
      await adminApi.suspendOrg(uuid);
      toast.success('Organization suspended');
      await load();
    } catch {
      toast.error('Failed to suspend organization');
    } finally {
      setActionBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid, load]);

  const handleReactivate = useCallback(async () => {
    if (!uuid) return;
    setActionBusy(true);
    try {
      await adminApi.reactivateOrg(uuid);
      toast.success('Organization reactivated');
      await load();
    } catch {
      toast.error('Failed to reactivate organization');
    } finally {
      setActionBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid, load]);

  if (loading) {
    return <div className="p-6 text-center text-gray-400 text-sm">Loading…</div>;
  }
  if (!org) {
    return <div className="p-6 text-center text-gray-400 text-sm">Organization not found.</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button type="button" onClick={() => navigate('/admin')}
            className="text-xs text-gray-400 hover:text-gray-600 mb-1">
            ← Admin Console
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              org.is_suspended
                ? 'bg-red-100 text-red-700'
                : 'bg-green-100 text-green-700'
            }`}>
              {org.is_suspended ? 'Suspended' : 'Active'}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Owner: {org.owner_email} · {org.member_count} member{org.member_count !== 1 ? 's' : ''} · {org.collection_count} collection{org.collection_count !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {org.is_suspended ? (
            <button type="button" onClick={handleReactivate} disabled={actionBusy}
              className="flex items-center gap-1.5 text-sm font-medium text-green-700 border border-green-300 hover:bg-green-50 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors">
              Reactivate
            </button>
          ) : (
            <button type="button" onClick={handleSuspend} disabled={actionBusy}
              className="flex items-center gap-1.5 text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors">
              Suspend
            </button>
          )}
        </div>
      </div>

      {/* Members */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Members</h2>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {members.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-gray-400">No members found.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {members.map((m) => (
                <div key={m.uuid} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold flex-shrink-0">
                    {m.user_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.user_name}</p>
                    <p className="text-xs text-gray-400 truncate">{m.user_email}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[m.role] ?? 'bg-gray-100 text-gray-600'}`}>
                    {m.role}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[m.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {m.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Event Log */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Recent Events</h2>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {events.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-gray-400">No events yet.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {events.map((e) => (
                <div key={e.uuid} className="flex items-start gap-3 px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 uppercase tracking-wide">
                        {e.event_type.replace(/_/g, ' ')}
                      </span>
                      {e.actor_email && (
                        <span className="text-xs text-gray-500">by {e.actor_email}</span>
                      )}
                    </div>
                    {e.event_data && Object.keys(e.event_data).length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {JSON.stringify(e.event_data)}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                    {fmtDate(e.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
