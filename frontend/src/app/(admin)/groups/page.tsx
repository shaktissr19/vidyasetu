'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  adminDecideGroup,
  adminListGroupReports,
  adminListGroups,
  adminResolveGroupReport,
  adminUpdateGroupStatus,
  type AdminGroupReport,
  type AdminGroupSummary,
  type GroupMember,
} from '@/services/groupService';
import { adminGetGroupMembers, adminTransferGroupOwnership } from '@/services/groupGovernanceService';
import { apiErrorText } from '@/utils/errors';
import { formatDate } from '@/utils/formatters';

type Tab = 'pending' | 'groups' | 'reports';

const STATUS_STYLE: Record<string, { background: string; color: string }> = {
  PENDING: { background: 'rgba(255,183,77,0.18)', color: '#FFCC80' },
  ACTIVE: { background: 'rgba(102,187,106,0.18)', color: '#A5D6A7' },
  REJECTED: { background: 'rgba(239,83,80,0.18)', color: '#EF9A9A' },
  SUSPENDED: { background: 'rgba(239,83,80,0.18)', color: '#EF9A9A' },
  ARCHIVED: { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)' },
  OPEN: { background: 'rgba(239,83,80,0.18)', color: '#EF9A9A' },
  REVIEWING: { background: 'rgba(255,183,77,0.18)', color: '#FFCC80' },
  RESOLVED: { background: 'rgba(102,187,106,0.18)', color: '#A5D6A7' },
  DISMISSED: { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)' },
};

function Badge({ value }: { value: string }) {
  const style = STATUS_STYLE[value] || STATUS_STYLE.ARCHIVED;
  return <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={style}>{value}</span>;
}

export default function AdminGroupsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('pending');
  const [search, setSearch] = useState('');
  const [reportStatus, setReportStatus] = useState('OPEN');
  const [selectedGroup, setSelectedGroup] = useState<AdminGroupSummary | null>(null);
  const [selectedReport, setSelectedReport] = useState<AdminGroupReport | null>(null);
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState('');
  const [ownerTarget, setOwnerTarget] = useState('');

  const pendingQuery = useQuery({
    queryKey: ['admin-groups', 'PENDING', search],
    queryFn: () => adminListGroups('PENDING', search).then((r) => r.data.data),
    enabled: tab === 'pending',
  });
  const groupsQuery = useQuery({
    queryKey: ['admin-groups', '', search],
    queryFn: () => adminListGroups('', search).then((r) => r.data.data),
    enabled: tab === 'groups',
  });
  const reportsQuery = useQuery({
    queryKey: ['admin-group-reports', reportStatus],
    queryFn: () => adminListGroupReports(reportStatus).then((r) => r.data.data),
    enabled: tab === 'reports',
  });
  const membersQuery = useQuery<GroupMember[]>({
    queryKey: ['admin-group-members', selectedGroup?.id],
    queryFn: async () => {
      if (!selectedGroup) return [];
      return adminGetGroupMembers(selectedGroup.id).then((r) => r.data.data);
    },
    enabled: Boolean(selectedGroup && ['ACTIVE', 'SUSPENDED'].includes(selectedGroup.status)),
  });

  const eligibleOwners = useMemo(() => {
    const members = membersQuery.data || [];
    if (!selectedGroup) return [];
    return members.filter((member) => {
      if (member.user_id === selectedGroup.owner_id || member.role === 'OWNER') return false;
      if (selectedGroup.kind === 'MIXED') return ['TEACHER', 'SCHOOL_ADMIN'].includes(member.user_role || '');
      return true;
    });
  }, [membersQuery.data, selectedGroup]);

  async function invalidate() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['admin-groups'] }),
      qc.invalidateQueries({ queryKey: ['admin-group-reports'] }),
      qc.invalidateQueries({ queryKey: ['admin-group-members'] }),
    ]);
  }

  const decisionMutation = useMutation({
    mutationFn: ({ group, decision }: { group: AdminGroupSummary; decision: 'ACTIVE' | 'REJECTED' }) => adminDecideGroup(group.id, decision, note || undefined),
    onSuccess: async (_, variables) => {
      toast.success(variables.decision === 'ACTIVE' ? 'Community approved' : 'Community request rejected');
      setSelectedGroup(null); setNote(''); setOwnerTarget(''); await invalidate();
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not update Community')),
  });
  const statusMutation = useMutation({
    mutationFn: ({ group, status }: { group: AdminGroupSummary; status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' }) => adminUpdateGroupStatus(group.id, status, note || undefined),
    onSuccess: async () => { toast.success('Community status updated'); setSelectedGroup(null); setNote(''); setOwnerTarget(''); await invalidate(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not update Community status')),
  });
  const ownershipMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroup || !ownerTarget) throw new Error('Choose an active Community member');
      return adminTransferGroupOwnership(selectedGroup.id, ownerTarget);
    },
    onSuccess: async () => {
      toast.success('Community ownership recovered successfully');
      setSelectedGroup(null); setOwnerTarget(''); await invalidate();
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not transfer Community ownership')),
  });
  const reportMutation = useMutation({
    mutationFn: ({ report, status }: { report: AdminGroupReport; status: 'REVIEWING' | 'RESOLVED' | 'DISMISSED' }) => adminResolveGroupReport(report.id, status, resolution || undefined),
    onSuccess: async () => { toast.success('Report updated'); setSelectedReport(null); setResolution(''); await invalidate(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not update report')),
  });

  const rows = tab === 'pending' ? pendingQuery.data || [] : groupsQuery.data || [];
  const loading = tab === 'pending' ? pendingQuery.isLoading : groupsQuery.isLoading;

  function openGroup(group: AdminGroupSummary) {
    setSelectedGroup(group);
    setNote(group.admin_note || '');
    setOwnerTarget('');
  }

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-white">🤝 Education Communities Management</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>Approve Community creation, control lifecycle, recover ownership and review member reports across the VidyaSetu network.</p>
        </div>
        {tab !== 'reports' && <input value={search} onChange={(e) => setSearch(e.target.value)} className="input" placeholder="Search Communities or owners…" style={{ width: 280, background: 'rgba(255,255,255,0.06)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }} />}
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {(['pending', 'groups', 'reports'] as Tab[]).map((item) => (
          <button key={item} onClick={() => setTab(item)} className="px-4 py-2 rounded-xl text-sm font-bold"
            style={{ background: tab === item ? '#4FC3F7' : 'rgba(255,255,255,0.06)', color: tab === item ? '#061025' : 'rgba(255,255,255,0.68)', border: `1px solid ${tab === item ? '#4FC3F7' : 'rgba(255,255,255,0.1)'}` }}>
            {item === 'pending' ? `Pending Approvals${(pendingQuery.data || []).length ? ` (${(pendingQuery.data || []).length})` : ''}` : item === 'groups' ? 'All Communities' : 'Reports'}
          </button>
        ))}
      </div>

      {tab === 'reports' ? (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            {['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'].map((status) => <button key={status} onClick={() => setReportStatus(status)} className="text-xs font-bold px-3 py-2 rounded-lg" style={{ background: reportStatus === status ? 'rgba(79,195,247,0.2)' : 'rgba(255,255,255,0.05)', color: reportStatus === status ? '#81D4FA' : 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>{status}</button>)}
          </div>
          <div className="card-navy">
            {reportsQuery.isLoading ? <div className="skeleton h-40 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }} /> : (reportsQuery.data || []).length === 0 ? <div className="text-center py-10" style={{ color: 'rgba(255,255,255,0.45)' }}>No {reportStatus.toLowerCase()} reports.</div> : <div className="overflow-x-auto"><table className="tbl" style={{ color: 'rgba(255,255,255,0.72)' }}><thead><tr>{['Community','Reporter','Target','Reason','Status','Created','Action'].map((h) => <th key={h} style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)' }}>{h}</th>)}</tr></thead><tbody>{(reportsQuery.data || []).map((report) => <tr key={report.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}><td className="text-white font-semibold">{report.group_name}</td><td>{report.reported_by_name || 'User'}<div className="text-xs opacity-60">{report.reported_by_role}</div></td><td>{report.target_type}</td><td>{report.reason}<div className="text-xs opacity-60 max-w-[240px]">{report.details || ''}</div></td><td><Badge value={report.status} /></td><td>{formatDate(report.created_at)}</td><td><button className="text-xs font-bold" style={{ color: '#81D4FA' }} onClick={() => { setSelectedReport(report); setResolution(report.resolution || ''); }}>Review</button></td></tr>)}</tbody></table></div>}
          </div>
        </>
      ) : (
        <div className="card-navy">
          {loading ? <div className="skeleton h-44 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }} /> : rows.length === 0 ? <div className="text-center py-12"><div className="text-4xl mb-3">🤝</div><p className="font-display font-bold text-white">{tab === 'pending' ? 'No pending Community requests' : 'No Communities found'}</p></div> : <div className="overflow-x-auto"><table className="tbl" style={{ color: 'rgba(255,255,255,0.72)' }}><thead><tr>{['Community','Owner','Type / Scope','Members','School / Class','Reports','Status','Action'].map((h) => <th key={h} style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)' }}>{h}</th>)}</tr></thead><tbody>{rows.map((group) => <tr key={group.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}><td><div className="font-semibold text-white">{group.name}</div><div className="text-xs max-w-[260px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{group.description || '—'}</div></td><td>{group.owner_name || '—'}<div className="text-xs opacity-60">{group.owner_role}</div></td><td>{group.kind}<div className="text-xs opacity-60">{group.scope}</div></td><td>{Number(group.member_count || 0)}/{group.max_members}</td><td>{group.school_name || 'Private'}{group.class_name ? <div className="text-xs opacity-60">Class {group.class_name}{group.section ? `-${group.section}` : ''}</div> : null}</td><td>{Number(group.open_report_count || 0)}</td><td><Badge value={group.status} /></td><td><button className="text-xs font-bold" style={{ color: '#81D4FA' }} onClick={() => openGroup(group)}>Manage</button></td></tr>)}</tbody></table></div>}
        </div>
      )}

      {selectedGroup && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4" style={{ background: 'rgba(3,8,22,0.82)' }} onMouseDown={(e) => e.currentTarget === e.target && setSelectedGroup(null)}>
          <div className="card-navy w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ border: '1px solid rgba(79,195,247,0.3)' }}>
            <div className="flex justify-between gap-3"><div><h2 className="font-display font-extrabold text-xl text-white">{selectedGroup.name}</h2><p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{selectedGroup.kind} · {selectedGroup.scope} · Owner: {selectedGroup.owner_name}</p></div><button className="text-xl" style={{ background: 'none', border: 0, color: 'rgba(255,255,255,0.55)' }} onClick={() => setSelectedGroup(null)}>✕</button></div>
            <div className="mt-4 p-3 rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.72)' }}>{selectedGroup.description || 'No description provided.'}</div>
            <label className="block text-xs font-bold mt-4" style={{ color: 'rgba(255,255,255,0.5)' }}>Admin note<textarea className="input mt-1.5" rows={3} value={note} onChange={(e) => setNote(e.target.value)} style={{ background: 'rgba(255,255,255,0.06)', color: 'white', resize: 'vertical' }} placeholder="Optional reason or moderation note" /></label>
            <div className="flex flex-wrap gap-2 mt-4">
              {selectedGroup.status === 'PENDING' && <><button className="btn-primary" onClick={() => decisionMutation.mutate({ group: selectedGroup, decision: 'ACTIVE' })}>✓ Approve Community</button><button className="text-xs font-bold px-4 py-2 rounded-lg" style={{ background: 'rgba(239,83,80,0.18)', color: '#EF9A9A', border: '1px solid rgba(239,83,80,0.2)' }} onClick={() => decisionMutation.mutate({ group: selectedGroup, decision: 'REJECTED' })}>Reject</button></>}
              {selectedGroup.status === 'ACTIVE' && <><button className="text-xs font-bold px-4 py-2 rounded-lg" style={{ background: 'rgba(239,83,80,0.18)', color: '#EF9A9A', border: '1px solid rgba(239,83,80,0.2)' }} onClick={() => statusMutation.mutate({ group: selectedGroup, status: 'SUSPENDED' })}>Suspend</button><button className="text-xs font-bold px-4 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.68)' }} onClick={() => statusMutation.mutate({ group: selectedGroup, status: 'ARCHIVED' })}>Archive</button></>}
              {selectedGroup.status === 'SUSPENDED' && <><button className="btn-primary" onClick={() => statusMutation.mutate({ group: selectedGroup, status: 'ACTIVE' })}>Reactivate</button><button className="text-xs font-bold px-4 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.68)' }} onClick={() => statusMutation.mutate({ group: selectedGroup, status: 'ARCHIVED' })}>Archive</button></>}
            </div>

            {['ACTIVE', 'SUSPENDED'].includes(selectedGroup.status) && (
              <div className="mt-6 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <h3 className="font-display font-bold text-white">🔐 Ownership Recovery</h3>
                <p className="text-xs mt-1 mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>Emergency Admin control only. The new owner must already be an active member. Mixed Communities can only be owned by a Teacher or School Admin.</p>
                {membersQuery.isLoading ? <div className="skeleton h-12 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }} /> : eligibleOwners.length === 0 ? <div className="text-xs p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)' }}>No eligible replacement owner is currently an active member.</div> : (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select className="input select flex-1" value={ownerTarget} onChange={(e) => setOwnerTarget(e.target.value)} style={{ background: '#111A31', color: 'white' }}>
                      <option value="">Select replacement owner</option>
                      {eligibleOwners.map((member) => <option key={member.user_id} value={member.user_id}>{member.name || member.mobile} · {member.user_role} · {member.role}</option>)}
                    </select>
                    <button className="btn-primary" disabled={!ownerTarget || ownershipMutation.isPending} onClick={() => window.confirm('Transfer Community ownership to this active member?') && ownershipMutation.mutate()}>{ownershipMutation.isPending ? 'Transferring…' : 'Transfer Ownership'}</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedReport && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4" style={{ background: 'rgba(3,8,22,0.82)' }} onMouseDown={(e) => e.currentTarget === e.target && setSelectedReport(null)}>
          <div className="card-navy w-full max-w-lg" style={{ border: '1px solid rgba(79,195,247,0.3)' }}>
            <div className="flex justify-between gap-3"><div><h2 className="font-display font-extrabold text-xl text-white">Review Community Report</h2><p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{selectedReport.group_name} · {selectedReport.target_type}</p></div><button className="text-xl" style={{ background: 'none', border: 0, color: 'rgba(255,255,255,0.55)' }} onClick={() => setSelectedReport(null)}>✕</button></div>
            <div className="mt-4 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }}><div className="font-semibold text-white">{selectedReport.reason}</div><div className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>{selectedReport.details || 'No additional details.'}</div></div>
            <label className="block text-xs font-bold mt-4" style={{ color: 'rgba(255,255,255,0.5)' }}>Resolution<textarea className="input mt-1.5" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} style={{ background: 'rgba(255,255,255,0.06)', color: 'white', resize: 'vertical' }} /></label>
            <div className="flex flex-wrap gap-2 mt-4"><button className="btn-primary" onClick={() => reportMutation.mutate({ report: selectedReport, status: 'REVIEWING' })}>Mark Reviewing</button><button className="text-xs font-bold px-4 py-2 rounded-lg" style={{ background: 'rgba(102,187,106,0.18)', color: '#A5D6A7' }} onClick={() => reportMutation.mutate({ report: selectedReport, status: 'RESOLVED' })}>Resolve</button><button className="text-xs font-bold px-4 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.65)' }} onClick={() => reportMutation.mutate({ report: selectedReport, status: 'DISMISSED' })}>Dismiss</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
