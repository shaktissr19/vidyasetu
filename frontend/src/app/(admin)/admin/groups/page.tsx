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

type Tab = 'pending' | 'communities' | 'reports';

const STATUS_STYLE: Record<string, { background: string; color: string }> = {
  PENDING: { background: 'rgba(255,183,77,0.18)', color: '#FFCC80' },
  ACTIVE: { background: 'rgba(102,187,106,0.18)', color: '#A5D6A7' },
  REJECTED: { background: 'rgba(239,83,80,0.18)', color: '#EF9A9A' },
  SUSPENDED: { background: 'rgba(239,83,80,0.18)', color: '#EF9A9A' },
  ARCHIVED: { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.60)' },
  OPEN: { background: 'rgba(239,83,80,0.18)', color: '#EF9A9A' },
  REVIEWING: { background: 'rgba(255,183,77,0.18)', color: '#FFCC80' },
  RESOLVED: { background: 'rgba(102,187,106,0.18)', color: '#A5D6A7' },
  DISMISSED: { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.60)' },
};

const KIND_LABEL: Record<string, string> = {
  STUDENT: 'Student Community',
  PARENT: 'Parent Community',
  TEACHER: 'Teacher Community',
  MIXED: 'Mixed Learning Community',
};

function Badge({ value }: { value: string }) {
  const style = STATUS_STYLE[value] || STATUS_STYLE.ARCHIVED;
  return <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={style}>{value}</span>;
}

export default function AdminCommunityPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('pending');
  const [search, setSearch] = useState('');
  const [reportStatus, setReportStatus] = useState('OPEN');
  const [selectedCommunity, setSelectedCommunity] = useState<AdminGroupSummary | null>(null);
  const [selectedReport, setSelectedReport] = useState<AdminGroupReport | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [resolution, setResolution] = useState('');
  const [ownerTarget, setOwnerTarget] = useState('');

  const pendingQuery = useQuery({
    queryKey: ['admin-community', 'PENDING', search],
    queryFn: () => adminListGroups('PENDING', search).then((response) => response.data.data),
    enabled: tab === 'pending',
  });

  const communityQuery = useQuery({
    queryKey: ['admin-community', 'ALL', search],
    queryFn: () => adminListGroups('', search).then((response) => response.data.data),
    enabled: tab === 'communities',
  });

  const reportsQuery = useQuery({
    queryKey: ['admin-community-reports', reportStatus],
    queryFn: () => adminListGroupReports(reportStatus).then((response) => response.data.data),
    enabled: tab === 'reports',
  });

  const membersQuery = useQuery<GroupMember[]>({
    queryKey: ['admin-community-members', selectedCommunity?.id],
    queryFn: async () => {
      if (!selectedCommunity) return [];
      return adminGetGroupMembers(selectedCommunity.id).then((response) => response.data.data);
    },
    enabled: Boolean(selectedCommunity && ['ACTIVE', 'SUSPENDED'].includes(selectedCommunity.status)),
  });

  const eligibleOwners = useMemo(() => {
    const members = membersQuery.data || [];
    if (!selectedCommunity) return [];
    return members.filter((member) => {
      if (member.user_id === selectedCommunity.owner_id || member.role === 'OWNER') return false;
      if (selectedCommunity.kind === 'MIXED') return ['TEACHER', 'SCHOOL_ADMIN'].includes(member.user_role || '');
      return true;
    });
  }, [membersQuery.data, selectedCommunity]);

  async function refresh(): Promise<void> {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['admin-community'] }),
      qc.invalidateQueries({ queryKey: ['admin-community-reports'] }),
      qc.invalidateQueries({ queryKey: ['admin-community-members'] }),
    ]);
  }

  function closeCommunity(): void {
    setSelectedCommunity(null);
    setOwnerTarget('');
    setAdminNote('');
  }

  const decisionMutation = useMutation({
    mutationFn: ({ community, decision }: { community: AdminGroupSummary; decision: 'ACTIVE' | 'REJECTED' }) =>
      adminDecideGroup(community.id, decision, adminNote || undefined),
    onSuccess: async (_, variables) => {
      toast.success(variables.decision === 'ACTIVE' ? 'Community approved' : 'Community request rejected');
      closeCommunity();
      await refresh();
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not update Community request')),
  });

  const statusMutation = useMutation({
    mutationFn: ({ community, status }: { community: AdminGroupSummary; status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' }) =>
      adminUpdateGroupStatus(community.id, status, adminNote || undefined),
    onSuccess: async () => {
      toast.success('Community status updated');
      closeCommunity();
      await refresh();
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not update Community status')),
  });

  const ownershipMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCommunity || !ownerTarget) throw new Error('Choose an eligible active member');
      return adminTransferGroupOwnership(selectedCommunity.id, ownerTarget);
    },
    onSuccess: async () => {
      toast.success('Community ownership transferred');
      closeCommunity();
      await refresh();
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not transfer Community ownership')),
  });

  const reportMutation = useMutation({
    mutationFn: ({ report, status }: { report: AdminGroupReport; status: 'REVIEWING' | 'RESOLVED' | 'DISMISSED' }) =>
      adminResolveGroupReport(report.id, status, resolution || undefined),
    onSuccess: async () => {
      toast.success('Community report updated');
      setSelectedReport(null);
      setResolution('');
      await refresh();
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not update Community report')),
  });

  const communities = tab === 'pending' ? pendingQuery.data || [] : communityQuery.data || [];
  const communitiesLoading = tab === 'pending' ? pendingQuery.isLoading : communityQuery.isLoading;

  function openCommunity(community: AdminGroupSummary): void {
    setSelectedCommunity(community);
    setAdminNote(community.admin_note || '');
    setOwnerTarget('');
  }

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.15em] mb-2" style={{ color: '#81D4FA' }}>VidyaSetu Education Community</div>
          <h1 className="font-display font-extrabold text-2xl text-white">🌐 Community Governance</h1>
          <p className="text-sm mt-1 max-w-3xl" style={{ color: 'rgba(255,255,255,0.52)' }}>
            Approve new Student, Parent, Teacher and mixed learning Communities, review reports, control lifecycle state and recover ownership when required.
          </p>
        </div>
        {tab !== 'reports' && (
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="input"
            placeholder="Search Communities or owners…"
            style={{ width: 290, background: 'rgba(255,255,255,0.06)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
          />
        )}
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg,rgba(255,183,77,.13),rgba(255,255,255,.04))', border: '1px solid rgba(255,255,255,.08)' }}>
          <div className="text-xs" style={{ color: 'rgba(255,255,255,.55)' }}>Pending approval</div>
          <div className="text-2xl font-extrabold mt-1 text-white">{(pendingQuery.data || []).length}</div>
        </div>
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg,rgba(79,195,247,.13),rgba(255,255,255,.04))', border: '1px solid rgba(255,255,255,.08)' }}>
          <div className="text-xs" style={{ color: 'rgba(255,255,255,.55)' }}>Governance model</div>
          <div className="text-sm font-bold mt-1 text-white">Approval + consent + moderation</div>
        </div>
        <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg,rgba(102,187,106,.13),rgba(255,255,255,.04))', border: '1px solid rgba(255,255,255,.08)' }}>
          <div className="text-xs" style={{ color: 'rgba(255,255,255,.55)' }}>Mixed community safety</div>
          <div className="text-sm font-bold mt-1 text-white">Teacher / School Admin ownership</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {(['pending', 'communities', 'reports'] as Tab[]).map((item) => {
          const label = item === 'pending' ? 'Pending Approvals' : item === 'communities' ? 'All Communities' : 'Reports';
          return (
            <button
              key={item}
              onClick={() => setTab(item)}
              className="px-4 py-2 rounded-xl text-sm font-bold"
              style={{
                background: tab === item ? '#4FC3F7' : 'rgba(255,255,255,0.06)',
                color: tab === item ? '#061025' : 'rgba(255,255,255,0.68)',
                border: `1px solid ${tab === item ? '#4FC3F7' : 'rgba(255,255,255,0.1)'}`,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === 'reports' ? (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            {['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'].map((status) => (
              <button
                key={status}
                onClick={() => setReportStatus(status)}
                className="text-xs font-bold px-3 py-2 rounded-lg"
                style={{
                  background: reportStatus === status ? 'rgba(79,195,247,0.2)' : 'rgba(255,255,255,0.05)',
                  color: reportStatus === status ? '#81D4FA' : 'rgba(255,255,255,0.5)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >{status}</button>
            ))}
          </div>
          <div className="card-navy">
            {reportsQuery.isLoading ? (
              <div className="skeleton h-40 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }} />
            ) : (reportsQuery.data || []).length === 0 ? (
              <div className="text-center py-10" style={{ color: 'rgba(255,255,255,0.45)' }}>No {reportStatus.toLowerCase()} Community reports.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl" style={{ color: 'rgba(255,255,255,0.72)' }}>
                  <thead><tr>{['Community', 'Reporter', 'Target', 'Reason', 'Status', 'Created', 'Action'].map((heading) => <th key={heading} style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)' }}>{heading}</th>)}</tr></thead>
                  <tbody>
                    {(reportsQuery.data || []).map((report) => (
                      <tr key={report.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <td className="text-white font-semibold">{report.group_name || 'Community'}</td>
                        <td>{report.reported_by_name || 'User'}<div className="text-xs opacity-60">{report.reported_by_role}</div></td>
                        <td>{report.target_type === 'GROUP' ? 'COMMUNITY' : report.target_type}</td>
                        <td>{report.reason}<div className="text-xs opacity-60 max-w-[240px]">{report.details || ''}</div></td>
                        <td><Badge value={report.status} /></td>
                        <td>{report.created_at ? formatDate(report.created_at) : '—'}</td>
                        <td><button className="text-xs font-bold" style={{ color: '#81D4FA' }} onClick={() => { setSelectedReport(report); setResolution(report.resolution || ''); }}>Review</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="card-navy">
          {communitiesLoading ? (
            <div className="skeleton h-44 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }} />
          ) : communities.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">🌐</div>
              <p className="font-display font-bold text-white">{tab === 'pending' ? 'No pending Community requests' : 'No Communities found'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl" style={{ color: 'rgba(255,255,255,0.72)' }}>
                <thead><tr>{['Community', 'Owner', 'Type / Scope', 'Members', 'School / Class', 'Reports', 'Status', 'Action'].map((heading) => <th key={heading} style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)' }}>{heading}</th>)}</tr></thead>
                <tbody>
                  {communities.map((community) => (
                    <tr key={community.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <td><div className="font-semibold text-white">{community.name}</div><div className="text-xs max-w-[260px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{community.description || '—'}</div></td>
                      <td>{community.owner_name || '—'}<div className="text-xs opacity-60">{community.owner_role}</div></td>
                      <td>{KIND_LABEL[community.kind] || community.kind}<div className="text-xs opacity-60">{community.scope}</div></td>
                      <td>{Number(community.member_count || 0)}/{community.max_members}</td>
                      <td>{community.school_name || 'Private'}{community.class_name ? <div className="text-xs opacity-60">Class {community.class_name}{community.section ? `-${community.section}` : ''}</div> : null}</td>
                      <td>{Number(community.open_report_count || 0)}</td>
                      <td><Badge value={community.status} /></td>
                      <td><button className="text-xs font-bold" style={{ color: '#81D4FA' }} onClick={() => openCommunity(community)}>Manage</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedCommunity && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4" style={{ background: 'rgba(3,8,22,0.84)' }} onMouseDown={(event) => event.currentTarget === event.target && closeCommunity()}>
          <div className="card-navy w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ border: '1px solid rgba(79,195,247,0.3)' }}>
            <div className="flex justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.12em] mb-1" style={{ color: '#81D4FA' }}>{KIND_LABEL[selectedCommunity.kind] || selectedCommunity.kind}</div>
                <h2 className="font-display font-extrabold text-xl text-white">{selectedCommunity.name}</h2>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{selectedCommunity.scope} · Owner: {selectedCommunity.owner_name || '—'}</p>
              </div>
              <button style={{ background: 'none', border: 0, color: 'rgba(255,255,255,0.55)', fontSize: 20 }} onClick={closeCommunity}>✕</button>
            </div>

            <div className="mt-4 p-3 rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.72)' }}>
              {selectedCommunity.description || 'No description provided.'}
            </div>

            <label className="block text-xs font-bold mt-4" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Platform Admin note
              <textarea className="input mt-1.5" rows={3} value={adminNote} onChange={(event) => setAdminNote(event.target.value)} style={{ background: 'rgba(255,255,255,0.06)', color: 'white', resize: 'vertical' }} placeholder="Optional approval, rejection or moderation note" />
            </label>

            {selectedCommunity.status === 'PENDING' && (
              <div className="flex flex-wrap gap-2 mt-4">
                <button className="btn-primary" disabled={decisionMutation.isPending} onClick={() => decisionMutation.mutate({ community: selectedCommunity, decision: 'ACTIVE' })}>✓ Approve Community</button>
                <button className="px-4 py-2 rounded-lg text-sm font-bold" style={{ background: 'rgba(239,83,80,0.18)', color: '#EF9A9A', border: '1px solid rgba(239,83,80,0.2)' }} onClick={() => decisionMutation.mutate({ community: selectedCommunity, decision: 'REJECTED' })}>Reject</button>
              </div>
            )}

            {selectedCommunity.status === 'ACTIVE' && (
              <div className="flex flex-wrap gap-2 mt-4">
                <button className="px-4 py-2 rounded-lg text-sm font-bold" style={{ background: 'rgba(239,83,80,0.18)', color: '#EF9A9A', border: '1px solid rgba(239,83,80,0.2)' }} onClick={() => statusMutation.mutate({ community: selectedCommunity, status: 'SUSPENDED' })}>Suspend Community</button>
                <button className="px-4 py-2 rounded-lg text-sm font-bold" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,.72)', border: '1px solid rgba(255,255,255,.12)' }} onClick={() => statusMutation.mutate({ community: selectedCommunity, status: 'ARCHIVED' })}>Archive</button>
              </div>
            )}

            {selectedCommunity.status === 'SUSPENDED' && (
              <div className="flex flex-wrap gap-2 mt-4">
                <button className="btn-primary" onClick={() => statusMutation.mutate({ community: selectedCommunity, status: 'ACTIVE' })}>Reactivate Community</button>
                <button className="px-4 py-2 rounded-lg text-sm font-bold" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,.72)', border: '1px solid rgba(255,255,255,.12)' }} onClick={() => statusMutation.mutate({ community: selectedCommunity, status: 'ARCHIVED' })}>Archive</button>
              </div>
            )}

            {['ACTIVE', 'SUSPENDED'].includes(selectedCommunity.status) && (
              <div className="mt-6 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.09)' }}>
                <h3 className="font-display font-bold text-white">Ownership recovery</h3>
                <p className="text-xs mt-1 mb-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Transfer ownership only when required. Mixed learning Communities can only be owned by an eligible Teacher or School Admin.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <select value={ownerTarget} onChange={(event) => setOwnerTarget(event.target.value)} className="input select flex-1 min-w-[240px]" style={{ background: '#101B36', color: 'white', border: '1px solid rgba(255,255,255,.12)' }}>
                    <option value="">Select eligible member</option>
                    {eligibleOwners.map((member) => <option key={member.user_id} value={member.user_id}>{member.name || member.mobile} · {member.user_role}</option>)}
                  </select>
                  <button className="btn-primary" disabled={!ownerTarget || ownershipMutation.isPending} onClick={() => ownershipMutation.mutate()}>Transfer Ownership</button>
                </div>
                {membersQuery.isLoading && <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,.45)' }}>Loading eligible members…</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedReport && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4" style={{ background: 'rgba(3,8,22,0.84)' }} onMouseDown={(event) => event.currentTarget === event.target && setSelectedReport(null)}>
          <div className="card-navy w-full max-w-xl" style={{ border: '1px solid rgba(79,195,247,0.3)' }}>
            <div className="flex justify-between gap-3">
              <div><div className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: '#81D4FA' }}>Community report</div><h2 className="font-display font-extrabold text-xl text-white mt-1">{selectedReport.group_name || 'Community'}</h2></div>
              <button style={{ background: 'none', border: 0, color: 'rgba(255,255,255,0.55)', fontSize: 20 }} onClick={() => setSelectedReport(null)}>✕</button>
            </div>
            <div className="mt-4 text-sm" style={{ color: 'rgba(255,255,255,.72)' }}><strong>Reason:</strong> {selectedReport.reason}</div>
            {selectedReport.details && <div className="mt-2 text-sm" style={{ color: 'rgba(255,255,255,.58)' }}>{selectedReport.details}</div>}
            <label className="block text-xs font-bold mt-4" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Resolution note
              <textarea className="input mt-1.5" rows={3} value={resolution} onChange={(event) => setResolution(event.target.value)} style={{ background: 'rgba(255,255,255,0.06)', color: 'white', resize: 'vertical' }} placeholder="Record the moderation outcome" />
            </label>
            <div className="flex flex-wrap gap-2 mt-4">
              <button className="btn-ghost" onClick={() => reportMutation.mutate({ report: selectedReport, status: 'REVIEWING' })}>Mark Reviewing</button>
              <button className="btn-primary" onClick={() => reportMutation.mutate({ report: selectedReport, status: 'RESOLVED' })}>Resolve</button>
              <button className="btn-ghost" onClick={() => reportMutation.mutate({ report: selectedReport, status: 'DISMISSED' })}>Dismiss</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
