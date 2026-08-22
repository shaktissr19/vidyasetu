'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import useAuthStore from '@/store/authStore';
import { apiErrorText } from '@/utils/errors';
import { timeAgo } from '@/utils/formatters';
import {
  addComment,
  createGroup,
  createPost,
  decideJoinRequest,
  decideNomination,
  deletePost,
  discoverGroups,
  getGroupContext,
  getGroupDetail,
  getJoinRequests,
  getMembers,
  getMyGroups,
  getMyInvitations,
  getNominations,
  getPosts,
  leaveGroup,
  proposeInvitation,
  removeMember,
  reportGroupContent,
  requestJoin,
  respondInvitation,
  searchEligibleUsers,
  setPostPinned,
  updateMemberRole,
  type CreateGroupPayload,
  type GroupDetail,
  type GroupKind,
  type GroupScope,
  type GroupSummary,
} from '@/services/groupService';

type WorkspaceTab = 'mine' | 'discover' | 'invitations';
type DetailTab = 'feed' | 'members' | 'requests' | 'invite';

interface GroupsWorkspaceProps {
  title?: string;
  subtitle?: string;
  accent?: string;
}

const KIND_LABEL: Record<GroupKind, string> = {
  STUDENT: 'Student Group',
  PARENT: 'Parent Group',
  TEACHER: 'Teacher Group',
  MIXED: 'Mixed School Group',
};

const SCOPE_LABEL: Record<GroupScope, string> = {
  PRIVATE: 'Private',
  SCHOOL: 'School',
  CLASS: 'Class',
};

const STATUS_STYLE: Record<string, { background: string; color: string }> = {
  ACTIVE: { background: '#E8F5E9', color: '#176B2C' },
  PENDING: { background: '#FFF3E0', color: '#A95000' },
  REJECTED: { background: '#FFEBEE', color: '#A72828' },
  SUSPENDED: { background: '#FFEBEE', color: '#A72828' },
  ARCHIVED: { background: '#ECEFF1', color: '#455A64' },
};

function GroupBadge({ text, style }: { text: string; style?: React.CSSProperties }) {
  return <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: '#EEF2F7', color: '#475569', ...style }}>{text}</span>;
}

function groupScopeText(group: GroupSummary): string {
  if (group.scope === 'CLASS') return `${group.school_name || 'School'} · Class ${group.class_name || '—'}${group.section ? `-${group.section}` : ''}`;
  if (group.scope === 'SCHOOL') return group.school_name || 'School group';
  return 'Private invitation-based group';
}

function GroupCard({ group, onOpen }: { group: GroupSummary; onOpen: () => void }) {
  const statusStyle = STATUS_STYLE[group.status] || STATUS_STYLE.ARCHIVED;
  return (
    <button type="button" onClick={onOpen} className="card w-full text-left transition-all hover:-translate-y-0.5" style={{ borderLeft: '4px solid var(--forest)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <h3 className="font-display font-bold text-base" style={{ color: 'var(--navy)' }}>{group.name}</h3>
            <GroupBadge text={group.status} style={statusStyle} />
          </div>
          <p className="text-sm line-clamp-2" style={{ color: 'var(--slate)' }}>{group.description || 'A private VidyaSetu collaboration group.'}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <GroupBadge text={KIND_LABEL[group.kind]} />
            <GroupBadge text={SCOPE_LABEL[group.scope]} />
            {group.membership_role && <GroupBadge text={group.membership_role} style={{ background: '#E8F5E9', color: '#176B2C' }} />}
          </div>
        </div>
        <span className="text-xl">👥</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--slate)' }}>
        <span>👤 {group.owner_name || 'Group owner'}</span>
        <span>👥 {Number(group.member_count || 0)}/{group.max_members}</span>
        <span>{groupScopeText(group)}</span>
      </div>
      {group.status === 'REJECTED' && group.admin_note && <div className="mt-3 text-xs p-2 rounded-lg" style={{ background: '#FFF4F4', color: '#8D2525' }}>Admin note: {group.admin_note}</div>}
    </button>
  );
}

export default function GroupsWorkspace({ title = 'Groups', subtitle = 'Private, moderated collaboration spaces', accent = 'var(--forest)' }: GroupsWorkspaceProps) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<WorkspaceTab>('mine');
  const [detailTab, setDetailTab] = useState<DetailTab>('feed');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [discoverSearch, setDiscoverSearch] = useState('');
  const [inviteSearch, setInviteSearch] = useState('');
  const [postBody, setPostBody] = useState('');
  const [announcement, setAnnouncement] = useState(false);
  const [commentBodies, setCommentBodies] = useState<Record<string, string>>({});
  const [form, setForm] = useState<CreateGroupPayload>({ name: '', description: '', kind: 'STUDENT', scope: 'PRIVATE', maxMembers: 100 });

  const contextQuery = useQuery({
    queryKey: ['group-context'],
    queryFn: () => getGroupContext().then((r) => r.data.data),
  });
  const mineQuery = useQuery({
    queryKey: ['groups-mine'],
    queryFn: () => getMyGroups().then((r) => r.data.data),
  });
  const discoverQuery = useQuery({
    queryKey: ['groups-discover', discoverSearch],
    queryFn: () => discoverGroups(discoverSearch).then((r) => r.data.data),
    enabled: tab === 'discover',
  });
  const invitationsQuery = useQuery({
    queryKey: ['groups-invitations'],
    queryFn: () => getMyInvitations().then((r) => r.data.data),
  });
  const detailQuery = useQuery({
    queryKey: ['group-detail', selectedId],
    queryFn: async () => {
      if (!selectedId) throw new Error('No Group selected');
      return getGroupDetail(selectedId).then((r) => r.data.data);
    },
    enabled: Boolean(selectedId),
  });

  const group = detailQuery.data;
  const isMember = Boolean(group?.membership_role);
  const isModerator = group?.membership_role === 'OWNER' || group?.membership_role === 'MODERATOR';
  const isOwner = group?.membership_role === 'OWNER';

  const postsQuery = useQuery({
    queryKey: ['group-posts', selectedId],
    queryFn: async () => {
      if (!selectedId) throw new Error('No Group selected');
      return getPosts(selectedId).then((r) => r.data.data);
    },
    enabled: Boolean(selectedId && isMember && detailTab === 'feed'),
  });
  const membersQuery = useQuery({
    queryKey: ['group-members', selectedId],
    queryFn: async () => {
      if (!selectedId) throw new Error('No Group selected');
      return getMembers(selectedId).then((r) => r.data.data);
    },
    enabled: Boolean(selectedId && isMember && (detailTab === 'members' || detailTab === 'invite')),
  });
  const joinRequestsQuery = useQuery({
    queryKey: ['group-join-requests', selectedId],
    queryFn: async () => {
      if (!selectedId) throw new Error('No Group selected');
      return getJoinRequests(selectedId).then((r) => r.data.data);
    },
    enabled: Boolean(selectedId && isModerator && detailTab === 'requests'),
  });
  const nominationsQuery = useQuery({
    queryKey: ['group-nominations', selectedId],
    queryFn: async () => {
      if (!selectedId) throw new Error('No Group selected');
      return getNominations(selectedId).then((r) => r.data.data);
    },
    enabled: Boolean(selectedId && isModerator && detailTab === 'requests'),
  });
  const eligibleUsersQuery = useQuery({
    queryKey: ['group-eligible-users', selectedId, inviteSearch],
    queryFn: async () => {
      if (!selectedId) throw new Error('No Group selected');
      return searchEligibleUsers(selectedId, inviteSearch).then((r) => r.data.data);
    },
    enabled: Boolean(selectedId && isMember && detailTab === 'invite' && inviteSearch.trim().length >= 2),
  });

  useEffect(() => {
    const context = contextQuery.data;
    if (!context?.allowedKinds.length) return;
    setForm((current) => ({ ...current, kind: context.allowedKinds.includes(current.kind) ? current.kind : context.allowedKinds[0] }));
  }, [contextQuery.data]);

  useEffect(() => {
    if (!selectedId) setDetailTab('feed');
  }, [selectedId]);

  async function invalidateGroupData() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['groups-mine'] }),
      qc.invalidateQueries({ queryKey: ['groups-discover'] }),
      qc.invalidateQueries({ queryKey: ['groups-invitations'] }),
      qc.invalidateQueries({ queryKey: ['group-detail', selectedId] }),
      qc.invalidateQueries({ queryKey: ['group-members', selectedId] }),
      qc.invalidateQueries({ queryKey: ['group-join-requests', selectedId] }),
      qc.invalidateQueries({ queryKey: ['group-nominations', selectedId] }),
      qc.invalidateQueries({ queryKey: ['group-posts', selectedId] }),
    ]);
  }

  const createMutation = useMutation({
    mutationFn: () => createGroup(form),
    onSuccess: async () => {
      toast.success('Group request sent for Admin approval');
      setShowCreate(false);
      setForm((current) => ({ ...current, name: '', description: '', scope: 'PRIVATE', schoolId: null, classId: null, maxMembers: 100 }));
      await invalidateGroupData();
      setTab('mine');
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not create Group')),
  });
  const joinMutation = useMutation({
    mutationFn: (groupId: string) => requestJoin(groupId),
    onSuccess: async () => { toast.success('Join request sent to the Group owner'); await invalidateGroupData(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not request to join')),
  });
  const inviteResponseMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'ACCEPTED' | 'DECLINED' }) => respondInvitation(id, decision),
    onSuccess: async (_, variables) => { toast.success(variables.decision === 'ACCEPTED' ? 'You joined the Group' : 'Invitation declined'); await invalidateGroupData(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not respond to invitation')),
  });
  const joinDecisionMutation = useMutation({
    mutationFn: ({ requestId, decision }: { requestId: string; decision: 'APPROVED' | 'REJECTED' }) => {
      if (!selectedId) throw new Error('No Group selected');
      return decideJoinRequest(selectedId, requestId, decision);
    },
    onSuccess: async () => { toast.success('Join request updated'); await invalidateGroupData(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not update join request')),
  });
  const nominationDecisionMutation = useMutation({
    mutationFn: ({ invitationId, decision }: { invitationId: string; decision: 'APPROVED' | 'REJECTED' }) => {
      if (!selectedId) throw new Error('No Group selected');
      return decideNomination(selectedId, invitationId, decision);
    },
    onSuccess: async () => { toast.success('Nomination updated'); await invalidateGroupData(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not update nomination')),
  });
  const inviteMutation = useMutation({
    mutationFn: (userId: string) => {
      if (!selectedId) throw new Error('No Group selected');
      return proposeInvitation(selectedId, userId);
    },
    onSuccess: async () => {
      toast.success(isModerator ? 'Invitation sent' : 'Member nomination sent for owner approval');
      setInviteSearch('');
      await invalidateGroupData();
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not invite member')),
  });
  const postMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('No Group selected');
      return createPost(selectedId, postBody, announcement);
    },
    onSuccess: async () => { setPostBody(''); setAnnouncement(false); toast.success(announcement ? 'Announcement posted' : 'Post published'); await qc.invalidateQueries({ queryKey: ['group-posts', selectedId] }); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not publish post')),
  });
  const commentMutation = useMutation({
    mutationFn: ({ postId, body }: { postId: string; body: string }) => {
      if (!selectedId) throw new Error('No Group selected');
      return addComment(selectedId, postId, body);
    },
    onSuccess: async (_, variables) => {
      setCommentBodies((current) => ({ ...current, [variables.postId]: '' }));
      await qc.invalidateQueries({ queryKey: ['group-posts', selectedId] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not add comment')),
  });
  const pinMutation = useMutation({
    mutationFn: ({ postId, pinned }: { postId: string; pinned: boolean }) => {
      if (!selectedId) throw new Error('No Group selected');
      return setPostPinned(selectedId, postId, pinned);
    },
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['group-posts', selectedId] }),
  });
  const deletePostMutation = useMutation({
    mutationFn: (postId: string) => {
      if (!selectedId) throw new Error('No Group selected');
      return deletePost(selectedId, postId);
    },
    onSuccess: async () => { toast.success('Post removed'); await qc.invalidateQueries({ queryKey: ['group-posts', selectedId] }); },
  });
  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'MODERATOR' | 'MEMBER' }) => {
      if (!selectedId) throw new Error('No Group selected');
      return updateMemberRole(selectedId, userId, role);
    },
    onSuccess: async () => { toast.success('Member role updated'); await qc.invalidateQueries({ queryKey: ['group-members', selectedId] }); },
  });
  const removeMutation = useMutation({
    mutationFn: (userId: string) => {
      if (!selectedId) throw new Error('No Group selected');
      return removeMember(selectedId, userId);
    },
    onSuccess: async () => { toast.success('Member removed'); await invalidateGroupData(); },
  });
  const leaveMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('No Group selected');
      return leaveGroup(selectedId);
    },
    onSuccess: async () => { toast.success('You left the Group'); setSelectedId(null); await invalidateGroupData(); },
  });
  const reportMutation = useMutation({
    mutationFn: ({ targetType, targetId }: { targetType: 'GROUP' | 'POST' | 'COMMENT' | 'MEMBER'; targetId: string }) => {
      if (!selectedId) throw new Error('No Group selected');
      return reportGroupContent(selectedId, targetType, targetId, 'INAPPROPRIATE_CONTENT');
    },
    onSuccess: () => toast.success('Report sent to VidyaSetu Admin'),
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not submit report')),
  });

  const filteredClasses = useMemo(() => {
    const classes = contextQuery.data?.classes || [];
    return form.schoolId ? classes.filter((item) => item.schoolId === form.schoolId) : classes;
  }, [contextQuery.data?.classes, form.schoolId]);

  const selectedGroupFromList = useMemo(() => {
    return (mineQuery.data || []).find((item) => item.id === selectedId) || (discoverQuery.data || []).find((item) => item.id === selectedId) || null;
  }, [mineQuery.data, discoverQuery.data, selectedId]);

  function openGroup(item: GroupSummary) {
    setSelectedId(item.id);
    setDetailTab('feed');
  }

  if (selectedId) {
    const activeGroup: GroupDetail | GroupSummary | null = group || selectedGroupFromList;
    return (
      <div className="animate-fade-up">
        <button type="button" className="btn-ghost mb-4" onClick={() => setSelectedId(null)}>← Back to Groups</button>
        {detailQuery.isLoading || !activeGroup ? <div className="card"><div className="skeleton h-48 rounded-xl" /></div> : (
          <>
            <div className="card mb-5" style={{ borderTop: `4px solid ${accent}` }}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-2 items-center mb-2">
                    <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--navy)' }}>👥 {activeGroup.name}</h1>
                    <GroupBadge text={activeGroup.status} style={STATUS_STYLE[activeGroup.status]} />
                    <GroupBadge text={KIND_LABEL[activeGroup.kind]} />
                  </div>
                  <p className="text-sm" style={{ color: 'var(--slate)' }}>{activeGroup.description || 'Private VidyaSetu collaboration Group.'}</p>
                  <p className="text-xs mt-2" style={{ color: 'var(--slate)' }}>Owner: {activeGroup.owner_name || '—'} · {groupScopeText(activeGroup)} · {Number(activeGroup.member_count || 0)}/{activeGroup.max_members} members</p>
                </div>
                {isMember && !isOwner && <button className="btn-ghost" onClick={() => leaveMutation.mutate()} disabled={leaveMutation.isPending}>Leave Group</button>}
                {isMember && <button className="btn-ghost" onClick={() => reportMutation.mutate({ targetType: 'GROUP', targetId: activeGroup.id })}>Report</button>}
              </div>
              {activeGroup.status === 'PENDING' && <div className="mt-4 p-3 rounded-xl text-sm" style={{ background: '#FFF3E0', color: '#8B4A00' }}>⏳ This Group is waiting for VidyaSetu Admin approval. It becomes usable only after approval.</div>}
              {activeGroup.status === 'REJECTED' && <div className="mt-4 p-3 rounded-xl text-sm" style={{ background: '#FFEBEE', color: '#8D2525' }}>Group request was not approved.{activeGroup.admin_note ? ` ${activeGroup.admin_note}` : ''}</div>}
              {activeGroup.status === 'ACTIVE' && !isMember && (
                <div className="mt-4 flex items-center gap-3">
                  {activeGroup.invitation_status === 'PENDING_RECIPIENT' ? <span className="text-sm" style={{ color: 'var(--saffron)' }}>You have a pending invitation. Open the Invitations tab to accept it.</span>
                    : activeGroup.join_request_status === 'PENDING' ? <span className="text-sm" style={{ color: 'var(--saffron)' }}>Your join request is waiting for owner approval.</span>
                      : <button className="btn-green" onClick={() => joinMutation.mutate(activeGroup.id)} disabled={joinMutation.isPending}>Request to Join</button>}
                </div>
              )}
            </div>

            {activeGroup.status === 'ACTIVE' && isMember && (
              <>
                <div className="flex flex-wrap gap-2 mb-4">
                  {(['feed', 'members'] as DetailTab[]).concat(isModerator ? ['requests'] : []).concat(['invite']).map((item) => (
                    <button key={item} type="button" className="px-4 py-2 rounded-xl text-sm font-bold" onClick={() => setDetailTab(item)}
                      style={{ background: detailTab === item ? accent : 'white', color: detailTab === item ? 'white' : 'var(--slate)', border: `1px solid ${detailTab === item ? accent : 'var(--border)'}` }}>
                      {item === 'feed' ? '📰 Feed' : item === 'members' ? '👥 Members' : item === 'requests' ? `✅ Requests${Number(activeGroup.pending_join_count || 0) + Number(activeGroup.pending_nomination_count || 0) ? ` (${Number(activeGroup.pending_join_count || 0) + Number(activeGroup.pending_nomination_count || 0)})` : ''}` : isModerator ? '✉️ Invite' : '🙋 Nominate'}
                    </button>
                  ))}
                </div>

                {detailTab === 'feed' && (
                  <div className="space-y-4">
                    <div className="card">
                      <textarea className="input" rows={3} value={postBody} onChange={(e) => setPostBody(e.target.value)} placeholder="Share a question, idea, resource or update with this Group…" style={{ resize: 'vertical' }} />
                      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                        {isModerator ? <label className="text-sm flex items-center gap-2" style={{ color: 'var(--slate)' }}><input type="checkbox" checked={announcement} onChange={(e) => setAnnouncement(e.target.checked)} /> Post as announcement</label> : <span className="text-xs" style={{ color: 'var(--slate)' }}>Posts are visible only to Group members.</span>}
                        <button className="btn-green" disabled={!postBody.trim() || postMutation.isPending} onClick={() => postMutation.mutate()}>{postMutation.isPending ? 'Posting…' : 'Publish'}</button>
                      </div>
                    </div>
                    {postsQuery.isLoading ? <div className="card"><div className="skeleton h-40 rounded-xl" /></div> : (postsQuery.data || []).length === 0 ? <div className="card text-center py-10" style={{ color: 'var(--slate)' }}>No posts yet. Start the discussion.</div> : (postsQuery.data || []).map((post) => (
                      <div key={post.id} className="card" style={{ borderLeft: post.is_announcement ? '4px solid var(--saffron)' : post.is_pinned ? '4px solid var(--forest)' : undefined }}>
                        <div className="flex items-start justify-between gap-3">
                          <div><div className="font-semibold" style={{ color: 'var(--navy)' }}>{post.author_name || 'Member'} <span className="text-xs font-normal" style={{ color: 'var(--slate)' }}>· {post.author_role}</span></div><div className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{timeAgo(post.created_at)}</div></div>
                          <div className="flex gap-2 flex-wrap justify-end">{post.is_announcement && <GroupBadge text="ANNOUNCEMENT" style={{ background: '#FFF3E0', color: '#A95000' }} />}{post.is_pinned && <GroupBadge text="PINNED" style={{ background: '#E8F5E9', color: '#176B2C' }} />}{isModerator && <button className="text-xs font-bold" style={{ color: 'var(--forest)' }} onClick={() => pinMutation.mutate({ postId: post.id, pinned: !post.is_pinned })}>{post.is_pinned ? 'Unpin' : 'Pin'}</button>}{(post.author_id === user?.id || isModerator) && <button className="text-xs font-bold" style={{ color: '#B3261E' }} onClick={() => deletePostMutation.mutate(post.id)}>Remove</button>}<button className="text-xs" style={{ color: 'var(--slate)' }} onClick={() => reportMutation.mutate({ targetType: 'POST', targetId: post.id })}>Report</button></div>
                        </div>
                        <p className="mt-3 text-sm whitespace-pre-wrap" style={{ color: 'var(--navy)', lineHeight: 1.65 }}>{post.body}</p>
                        {post.attachment_url && <a href={post.attachment_url} target="_blank" rel="noreferrer" className="text-sm font-semibold inline-block mt-2" style={{ color: 'var(--forest)' }}>Open attachment ↗</a>}
                        <div className="mt-4 pt-3 space-y-2" style={{ borderTop: '1px solid var(--border)' }}>
                          {post.comments.map((comment) => <div key={comment.id} className="rounded-xl px-3 py-2" style={{ background: '#F7F9FC' }}><div className="flex justify-between gap-2"><span className="text-xs font-bold" style={{ color: 'var(--navy)' }}>{comment.author_name || 'Member'} · {comment.author_role}</span><button className="text-xs" style={{ color: 'var(--slate)' }} onClick={() => reportMutation.mutate({ targetType: 'COMMENT', targetId: comment.id })}>Report</button></div><p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{comment.body}</p></div>)}
                          <div className="flex gap-2"><input className="input flex-1" value={commentBodies[post.id] || ''} onChange={(e) => setCommentBodies((current) => ({ ...current, [post.id]: e.target.value }))} placeholder="Write a reply…" /><button className="btn-ghost" disabled={!commentBodies[post.id]?.trim()} onClick={() => commentMutation.mutate({ postId: post.id, body: commentBodies[post.id] || '' })}>Reply</button></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {detailTab === 'members' && (
                  <div className="card">
                    <h3 className="font-display font-bold mb-4" style={{ color: 'var(--navy)' }}>Group Members</h3>
                    <div className="space-y-2">{(membersQuery.data || []).map((member) => <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}><div><div className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{member.name || member.mobile}</div><div className="text-xs" style={{ color: 'var(--slate)' }}>{member.user_role} · {member.role}</div></div><div className="flex gap-2">{isOwner && member.user_id !== user?.id && member.role !== 'OWNER' && <button className="btn-ghost text-xs" onClick={() => roleMutation.mutate({ userId: member.user_id, role: member.role === 'MODERATOR' ? 'MEMBER' : 'MODERATOR' })}>{member.role === 'MODERATOR' ? 'Make Member' : 'Make Moderator'}</button>}{isModerator && member.user_id !== user?.id && member.role !== 'OWNER' && <button className="text-xs font-bold" style={{ color: '#B3261E' }} onClick={() => removeMutation.mutate(member.user_id)}>Remove</button>}{member.user_id !== user?.id && <button className="text-xs" style={{ color: 'var(--slate)' }} onClick={() => reportMutation.mutate({ targetType: 'MEMBER', targetId: member.user_id })}>Report</button>}</div></div>)}</div>
                  </div>
                )}

                {detailTab === 'requests' && isModerator && (
                  <div className="space-y-4">
                    <div className="card"><h3 className="font-display font-bold mb-4" style={{ color: 'var(--navy)' }}>Join Requests</h3>{(joinRequestsQuery.data || []).length === 0 ? <p className="text-sm" style={{ color: 'var(--slate)' }}>No pending join requests.</p> : (joinRequestsQuery.data || []).map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}><div><div className="font-semibold text-sm">{request.name || request.mobile}</div><div className="text-xs" style={{ color: 'var(--slate)' }}>{request.role}{request.message ? ` · ${request.message}` : ''}</div></div><div className="flex gap-2"><button className="btn-green text-xs" onClick={() => joinDecisionMutation.mutate({ requestId: request.id, decision: 'APPROVED' })}>Approve</button><button className="btn-ghost text-xs" onClick={() => joinDecisionMutation.mutate({ requestId: request.id, decision: 'REJECTED' })}>Reject</button></div></div>)}</div>
                    <div className="card"><h3 className="font-display font-bold mb-4" style={{ color: 'var(--navy)' }}>Member Nominations</h3>{(nominationsQuery.data || []).length === 0 ? <p className="text-sm" style={{ color: 'var(--slate)' }}>No pending nominations.</p> : (nominationsQuery.data || []).map((nomination) => <div key={nomination.id} className="flex flex-wrap items-center justify-between gap-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}><div><div className="font-semibold text-sm">{nomination.invitee_name || nomination.invitee_mobile}</div><div className="text-xs" style={{ color: 'var(--slate)' }}>{nomination.invitee_role} · nominated by {nomination.proposed_by_name || 'member'}</div></div><div className="flex gap-2"><button className="btn-green text-xs" onClick={() => nominationDecisionMutation.mutate({ invitationId: nomination.id, decision: 'APPROVED' })}>Approve & Invite</button><button className="btn-ghost text-xs" onClick={() => nominationDecisionMutation.mutate({ invitationId: nomination.id, decision: 'REJECTED' })}>Reject</button></div></div>)}</div>
                  </div>
                )}

                {detailTab === 'invite' && (
                  <div className="card">
                    <h3 className="font-display font-bold" style={{ color: 'var(--navy)' }}>{isModerator ? 'Invite a Member' : 'Nominate a Member'}</h3>
                    <p className="text-sm mt-1 mb-4" style={{ color: 'var(--slate)' }}>{isModerator ? 'The user must still accept the invitation before joining.' : 'Your nomination goes to the Group owner first. If approved, the user receives an invitation and still chooses whether to join.'}</p>
                    <input className="input" value={inviteSearch} onChange={(e) => setInviteSearch(e.target.value)} placeholder="Search eligible users by name, mobile or email…" />
                    {inviteSearch.trim().length < 2 ? <p className="text-xs mt-3" style={{ color: 'var(--slate)' }}>Enter at least 2 characters.</p> : eligibleUsersQuery.isLoading ? <div className="skeleton h-24 rounded-xl mt-3" /> : <div className="mt-3 space-y-2">{(eligibleUsersQuery.data || []).length === 0 ? <p className="text-sm" style={{ color: 'var(--slate)' }}>No eligible users found.</p> : (eligibleUsersQuery.data || []).map((candidate) => <div key={candidate.id} className="flex items-center justify-between gap-3 p-3 rounded-xl" style={{ background: '#F7F9FC' }}><div><div className="font-semibold text-sm">{candidate.name || candidate.mobile}</div><div className="text-xs" style={{ color: 'var(--slate)' }}>{candidate.role} · {candidate.mobile}</div></div><button className="btn-green text-xs" onClick={() => inviteMutation.mutate(candidate.id)}>{isModerator ? 'Invite' : 'Nominate'}</button></div>)}</div>}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    );
  }

  const context = contextQuery.data;
  const selectedSchoolClasses = filteredClasses;
  const list = tab === 'mine' ? mineQuery.data || [] : discoverQuery.data || [];

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div><h1 className="font-display font-extrabold text-2xl" style={{ color: accent }}>👥 {title}</h1><p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{subtitle}</p></div>
        <button className="btn-green" onClick={() => setShowCreate((value) => !value)}>{showCreate ? '✕ Cancel' : '+ Request New Group'}</button>
      </div>

      <div className="card mb-5" style={{ background: '#F6FBF7', borderLeft: `4px solid ${accent}` }}>
        <div className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>🔒 Private and moderated by design</div>
        <p className="text-xs mt-1 leading-5" style={{ color: 'var(--slate)' }}>New Groups require VidyaSetu Admin approval. Join requests require owner/moderator approval. Invitations never force-add a user—the recipient must accept. Mixed Student/Adult Groups can only be owned by a Teacher or School Admin.</p>
      </div>

      {showCreate && (
        <div className="card mb-5" style={{ border: `1.5px solid ${accent}` }}>
          <h2 className="font-display font-bold text-lg mb-4" style={{ color: 'var(--navy)' }}>Request a New Group</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="text-xs font-bold" style={{ color: 'var(--slate)' }}>Group name<input className="input mt-1.5" maxLength={160} value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} placeholder="e.g. Class 8 Science Revision" /></label>
            <label className="text-xs font-bold" style={{ color: 'var(--slate)' }}>Group type<select className="input select mt-1.5" value={form.kind} onChange={(e) => setForm((current) => ({ ...current, kind: e.target.value as GroupKind }))}>{(context?.allowedKinds || []).map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}</select></label>
            <label className="text-xs font-bold" style={{ color: 'var(--slate)' }}>Scope<select className="input select mt-1.5" value={form.scope} onChange={(e) => setForm((current) => ({ ...current, scope: e.target.value as GroupScope, schoolId: null, classId: null }))}><option value="PRIVATE">Private</option>{(context?.schools || []).length > 0 && <option value="SCHOOL">School</option>}{(context?.classes || []).length > 0 && <option value="CLASS">Class</option>}</select></label>
            <label className="text-xs font-bold" style={{ color: 'var(--slate)' }}>Member limit<input type="number" min={2} max={500} className="input mt-1.5" value={form.maxMembers || 100} onChange={(e) => setForm((current) => ({ ...current, maxMembers: Number(e.target.value) }))} /></label>
            {form.scope !== 'PRIVATE' && <label className="text-xs font-bold" style={{ color: 'var(--slate)' }}>School<select className="input select mt-1.5" value={form.schoolId || ''} onChange={(e) => setForm((current) => ({ ...current, schoolId: e.target.value || null, classId: null }))}><option value="">Select school</option>{(context?.schools || []).map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>}
            {form.scope === 'CLASS' && <label className="text-xs font-bold" style={{ color: 'var(--slate)' }}>Class<select className="input select mt-1.5" value={form.classId || ''} onChange={(e) => setForm((current) => ({ ...current, classId: e.target.value || null }))}><option value="">Select class</option>{selectedSchoolClasses.map((item) => <option key={item.id} value={item.id}>Class {item.className}{item.section ? `-${item.section}` : ''}</option>)}</select></label>}
            <label className="text-xs font-bold md:col-span-2" style={{ color: 'var(--slate)' }}>Purpose / description<textarea className="input mt-1.5" rows={3} maxLength={3000} value={form.description || ''} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} placeholder="What will members discuss or collaborate on?" style={{ resize: 'vertical' }} /></label>
          </div>
          <div className="flex justify-end mt-4"><button className="btn-green" disabled={createMutation.isPending || form.name.trim().length < 3 || !form.kind || (form.scope !== 'PRIVATE' && !form.schoolId) || (form.scope === 'CLASS' && !form.classId)} onClick={() => createMutation.mutate()}>{createMutation.isPending ? 'Submitting…' : 'Submit for Admin Approval'}</button></div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-2 flex-wrap">{(['mine', 'discover', 'invitations'] as WorkspaceTab[]).map((item) => <button key={item} type="button" className="px-4 py-2 rounded-xl text-sm font-bold" onClick={() => setTab(item)} style={{ background: tab === item ? accent : 'white', color: tab === item ? 'white' : 'var(--slate)', border: `1px solid ${tab === item ? accent : 'var(--border)'}` }}>{item === 'mine' ? 'My Groups' : item === 'discover' ? 'Discover' : `Invitations${(invitationsQuery.data || []).length ? ` (${(invitationsQuery.data || []).length})` : ''}`}</button>)}</div>
        {tab === 'discover' && <input className="input" style={{ width: 260 }} value={discoverSearch} onChange={(e) => setDiscoverSearch(e.target.value)} placeholder="Search Groups…" />}
      </div>

      {tab === 'invitations' ? (
        <div className="space-y-3">{invitationsQuery.isLoading ? <div className="card"><div className="skeleton h-24 rounded-xl" /></div> : (invitationsQuery.data || []).length === 0 ? <div className="card text-center py-10" style={{ color: 'var(--slate)' }}>No pending invitations.</div> : (invitationsQuery.data || []).map((invitation) => <div key={invitation.id} className="card flex flex-wrap items-center justify-between gap-4"><div><div className="font-display font-bold" style={{ color: 'var(--navy)' }}>✉️ {invitation.group_name || 'Group invitation'}</div><div className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Invited by {invitation.proposed_by_name || 'a Group member'}. You are never added until you accept.</div></div><div className="flex gap-2"><button className="btn-green" onClick={() => inviteResponseMutation.mutate({ id: invitation.id, decision: 'ACCEPTED' })}>Accept</button><button className="btn-ghost" onClick={() => inviteResponseMutation.mutate({ id: invitation.id, decision: 'DECLINED' })}>Decline</button></div></div>)}</div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{(tab === 'mine' ? mineQuery.isLoading : discoverQuery.isLoading) ? [...Array(3)].map((_, index) => <div key={index} className="card"><div className="skeleton h-36 rounded-xl" /></div>) : list.length === 0 ? <div className="card md:col-span-2 xl:col-span-3 text-center py-12"><div className="text-4xl mb-3">👥</div><div className="font-display font-bold" style={{ color: 'var(--navy)' }}>{tab === 'mine' ? 'No Groups yet' : 'No eligible Groups found'}</div><p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{tab === 'mine' ? 'Request a new Group or discover an approved Group.' : 'Try another search or create a private Group.'}</p></div> : list.map((item) => <GroupCard key={item.id} group={item} onOpen={() => openGroup(item)} />)}</div>
      )}
    </div>
  );
}
