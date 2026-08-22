'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
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
  type GroupInvitation,
  type GroupKind,
  type GroupMember,
  type GroupScope,
  type GroupSummary,
} from '@/services/groupService';
import { removeGroupComment, transferGroupOwnership } from '@/services/groupGovernanceService';
import { getGroupAttachmentUrl, uploadGroupFile } from '@/services/groupAttachmentService';

type WorkspaceTab = 'mine' | 'discover' | 'invitations';
type DetailTab = 'feed' | 'members' | 'requests' | 'invite';

interface GroupsHubProps {
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

const STATUS_STYLE: Record<string, CSSProperties> = {
  ACTIVE: { background: '#E8F5E9', color: '#176B2C' },
  PENDING: { background: '#FFF3E0', color: '#A95000' },
  REJECTED: { background: '#FFEBEE', color: '#A72828' },
  SUSPENDED: { background: '#FFEBEE', color: '#A72828' },
  ARCHIVED: { background: '#ECEFF1', color: '#455A64' },
};

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

function Badge({ children, style }: { children: string; style?: CSSProperties }) {
  return <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: '#EEF2F7', color: '#475569', ...style }}>{children}</span>;
}

function scopeText(group: GroupSummary): string {
  if (group.scope === 'CLASS') return `${group.school_name || 'School'} · Class ${group.class_name || '—'}${group.section ? `-${group.section}` : ''}`;
  if (group.scope === 'SCHOOL') return group.school_name || 'School Group';
  return 'Private invitation-based Group';
}

function canOwnMixed(member: GroupMember): boolean {
  return ['TEACHER', 'SCHOOL_ADMIN'].includes(member.user_role || '');
}

function GroupCard({ group, onOpen }: { group: GroupSummary; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="card w-full text-left transition-all hover:-translate-y-0.5" style={{ borderLeft: '4px solid var(--forest)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display font-bold text-base" style={{ color: 'var(--navy)' }}>{group.name}</h3>
            <Badge style={STATUS_STYLE[group.status]}>{group.status}</Badge>
          </div>
          <p className="text-sm mt-2 line-clamp-2" style={{ color: 'var(--slate)' }}>{group.description || 'Private VidyaSetu collaboration Group.'}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge>{KIND_LABEL[group.kind]}</Badge>
            <Badge>{group.scope}</Badge>
            {group.membership_role && <Badge style={{ background: '#E8F5E9', color: '#176B2C' }}>{group.membership_role}</Badge>}
          </div>
        </div>
        <span className="text-2xl">👥</span>
      </div>
      <div className="flex flex-wrap justify-between gap-2 mt-4 pt-3 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--slate)' }}>
        <span>Owner: {group.owner_name || '—'}</span>
        <span>{Number(group.member_count || 0)}/{group.max_members} members</span>
        <span>{scopeText(group)}</span>
      </div>
      {group.status === 'REJECTED' && group.admin_note && <div className="mt-3 p-2 rounded-lg text-xs" style={{ background: '#FFF4F4', color: '#8D2525' }}>Admin note: {group.admin_note}</div>}
    </button>
  );
}

export default function GroupsHub({ title = 'Groups', subtitle = 'Private, moderated collaboration spaces', accent = 'var(--forest)' }: GroupsHubProps) {
  const qc = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [tab, setTab] = useState<WorkspaceTab>('mine');
  const [detailTab, setDetailTab] = useState<DetailTab>('feed');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [discoverSearch, setDiscoverSearch] = useState('');
  const [inviteSearch, setInviteSearch] = useState('');
  const [postBody, setPostBody] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [announcement, setAnnouncement] = useState(false);
  const [commentBodies, setCommentBodies] = useState<Record<string, string>>({});
  const [form, setForm] = useState<CreateGroupPayload>({
    name: '', description: '', kind: 'STUDENT', scope: 'PRIVATE', maxMembers: 100,
  });

  const contextQuery = useQuery({ queryKey: ['group-context'], queryFn: () => getGroupContext().then((r) => r.data.data) });
  const mineQuery = useQuery({ queryKey: ['groups-mine'], queryFn: () => getMyGroups().then((r) => r.data.data) });
  const discoverQuery = useQuery({
    queryKey: ['groups-discover', discoverSearch],
    queryFn: () => discoverGroups(discoverSearch).then((r) => r.data.data),
    enabled: tab === 'discover',
  });
  const invitationsQuery = useQuery({ queryKey: ['groups-invitations'], queryFn: () => getMyInvitations().then((r) => r.data.data) });
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
  const isOwner = group?.membership_role === 'OWNER';
  const isModerator = isOwner || group?.membership_role === 'MODERATOR';

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
    enabled: Boolean(selectedId && isMember && ['members', 'invite'].includes(detailTab)),
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
  const eligibleQuery = useQuery({
    queryKey: ['group-eligible-users', selectedId, inviteSearch],
    queryFn: async () => {
      if (!selectedId) throw new Error('No Group selected');
      return searchEligibleUsers(selectedId, inviteSearch).then((r) => r.data.data);
    },
    enabled: Boolean(selectedId && isMember && detailTab === 'invite' && inviteSearch.trim().length >= 2),
  });

  useEffect(() => {
    const firstKind = contextQuery.data?.allowedKinds[0];
    if (!firstKind) return;
    setForm((current) => ({ ...current, kind: contextQuery.data?.allowedKinds.includes(current.kind) ? current.kind : firstKind }));
  }, [contextQuery.data]);

  async function refreshGroup() {
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
      await refreshGroup();
      setTab('mine');
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not request Group')),
  });
  const joinMutation = useMutation({
    mutationFn: (groupId: string) => requestJoin(groupId),
    onSuccess: async () => { toast.success('Join request sent to the Group owner'); await refreshGroup(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not request to join')),
  });
  const inviteResponseMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'ACCEPTED' | 'DECLINED' }) => respondInvitation(id, decision),
    onSuccess: async (_, variables) => { toast.success(variables.decision === 'ACCEPTED' ? 'You joined the Group' : 'Invitation declined'); await refreshGroup(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not respond to invitation')),
  });
  const joinDecisionMutation = useMutation({
    mutationFn: ({ requestId, decision }: { requestId: string; decision: 'APPROVED' | 'REJECTED' }) => {
      if (!selectedId) throw new Error('No Group selected');
      return decideJoinRequest(selectedId, requestId, decision);
    },
    onSuccess: async () => { toast.success('Join request updated'); await refreshGroup(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not update join request')),
  });
  const nominationDecisionMutation = useMutation({
    mutationFn: ({ invitationId, decision }: { invitationId: string; decision: 'APPROVED' | 'REJECTED' }) => {
      if (!selectedId) throw new Error('No Group selected');
      return decideNomination(selectedId, invitationId, decision);
    },
    onSuccess: async () => { toast.success('Nomination updated'); await refreshGroup(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not update nomination')),
  });
  const inviteMutation = useMutation({
    mutationFn: (userId: string) => {
      if (!selectedId) throw new Error('No Group selected');
      return proposeInvitation(selectedId, userId);
    },
    onSuccess: async () => { toast.success(isModerator ? 'Invitation sent' : 'Nomination sent for owner approval'); setInviteSearch(''); await refreshGroup(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not invite or nominate member')),
  });
  const postMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('No Group selected');
      let attachment: string | undefined;
      if (attachmentFile) {
        if (attachmentFile.size > MAX_ATTACHMENT_BYTES) throw new Error('Group attachments are limited to 10 MB');
        if (!ALLOWED_ATTACHMENT_TYPES.has(attachmentFile.type)) throw new Error('Use an image, PDF, text, Word or PowerPoint file');
        attachment = await uploadGroupFile(selectedId, attachmentFile);
      } else if (resourceUrl.trim()) {
        try { new URL(resourceUrl.trim()); } catch { throw new Error('Enter a valid resource URL'); }
        attachment = resourceUrl.trim();
      }
      return createPost(selectedId, postBody, announcement, attachment);
    },
    onSuccess: async () => {
      toast.success(announcement ? 'Announcement posted' : 'Post published');
      setPostBody(''); setAnnouncement(false); setAttachmentFile(null); setResourceUrl('');
      await qc.invalidateQueries({ queryKey: ['group-posts', selectedId] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, error instanceof Error ? error.message : 'Could not publish post')),
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
  });
  const removeCommentMutation = useMutation({
    mutationFn: (commentId: string) => {
      if (!selectedId) throw new Error('No Group selected');
      return removeGroupComment(selectedId, commentId);
    },
    onSuccess: async () => { toast.success('Comment removed'); await qc.invalidateQueries({ queryKey: ['group-posts', selectedId] }); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not remove comment')),
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
    onSuccess: async () => { toast.success('Member role updated'); await refreshGroup(); },
  });
  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => {
      if (!selectedId) throw new Error('No Group selected');
      return removeMember(selectedId, userId);
    },
    onSuccess: async () => { toast.success('Member removed'); await refreshGroup(); },
  });
  const transferMutation = useMutation({
    mutationFn: (userId: string) => {
      if (!selectedId) throw new Error('No Group selected');
      return transferGroupOwnership(selectedId, userId);
    },
    onSuccess: async () => { toast.success('Group ownership transferred'); await refreshGroup(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not transfer ownership')),
  });
  const leaveMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('No Group selected');
      return leaveGroup(selectedId);
    },
    onSuccess: async () => { toast.success('You left the Group'); setSelectedId(null); await refreshGroup(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not leave Group')),
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

  const detailTabs = useMemo<DetailTab[]>(() => {
    const tabs: DetailTab[] = ['feed', 'members'];
    if (isModerator) tabs.push('requests');
    tabs.push('invite');
    return tabs;
  }, [isModerator]);

  async function openAttachment(item: string) {
    if (!selectedId) return;
    if (/^https?:\/\//i.test(item)) {
      window.open(item, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      const signed = await getGroupAttachmentUrl(selectedId, item).then((r) => r.data.data.url);
      window.open(signed, '_blank', 'noopener,noreferrer');
    } catch (error: unknown) {
      toast.error(apiErrorText(error, 'Could not open attachment'));
    }
  }

  if (selectedId) {
    const fallback = [...(mineQuery.data || []), ...(discoverQuery.data || [])].find((item) => item.id === selectedId) || null;
    const activeGroup: GroupDetail | GroupSummary | null = group || fallback;

    return (
      <div className="animate-fade-up">
        <button type="button" className="btn-ghost mb-4" onClick={() => { setSelectedId(null); setDetailTab('feed'); }}>← Back to Groups</button>
        {detailQuery.isLoading || !activeGroup ? <div className="card"><div className="skeleton h-48 rounded-xl" /></div> : (
          <>
            <div className="card mb-5" style={{ borderTop: `4px solid ${accent}` }}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--navy)' }}>👥 {activeGroup.name}</h1>
                    <Badge style={STATUS_STYLE[activeGroup.status]}>{activeGroup.status}</Badge>
                    <Badge>{KIND_LABEL[activeGroup.kind]}</Badge>
                  </div>
                  <p className="text-sm mt-2" style={{ color: 'var(--slate)' }}>{activeGroup.description || 'Private VidyaSetu collaboration Group.'}</p>
                  <p className="text-xs mt-2" style={{ color: 'var(--slate)' }}>Owner: {activeGroup.owner_name || '—'} · {scopeText(activeGroup)} · {Number(activeGroup.member_count || 0)}/{activeGroup.max_members} members</p>
                </div>
                <div className="flex gap-2">
                  {isMember && !isOwner && <button className="btn-ghost" onClick={() => window.confirm('Leave this Group?') && leaveMutation.mutate()}>Leave</button>}
                  {isMember && <button className="btn-ghost" onClick={() => reportMutation.mutate({ targetType: 'GROUP', targetId: activeGroup.id })}>Report</button>}
                </div>
              </div>
              {activeGroup.status === 'PENDING' && <div className="mt-4 p-3 rounded-xl text-sm" style={{ background: '#FFF3E0', color: '#8B4A00' }}>⏳ Waiting for VidyaSetu Admin approval. Posts and membership open only after approval.</div>}
              {activeGroup.status === 'REJECTED' && <div className="mt-4 p-3 rounded-xl text-sm" style={{ background: '#FFEBEE', color: '#8D2525' }}>This request was not approved.{activeGroup.admin_note ? ` ${activeGroup.admin_note}` : ''}</div>}
              {activeGroup.status === 'ACTIVE' && !isMember && (
                <div className="mt-4">
                  {activeGroup.invitation_status === 'PENDING_RECIPIENT' ? <span className="text-sm" style={{ color: 'var(--saffron)' }}>You have an invitation. Accept it from the Invitations tab.</span>
                    : activeGroup.join_request_status === 'PENDING' ? <span className="text-sm" style={{ color: 'var(--saffron)' }}>Your join request is awaiting owner approval.</span>
                      : <button className="btn-green" onClick={() => joinMutation.mutate(activeGroup.id)}>Request to Join</button>}
                </div>
              )}
            </div>

            {activeGroup.status === 'ACTIVE' && isMember && (
              <>
                <div className="flex flex-wrap gap-2 mb-4">
                  {detailTabs.map((item) => (
                    <button key={item} type="button" className="px-4 py-2 rounded-xl text-sm font-bold" onClick={() => setDetailTab(item)}
                      style={{ background: detailTab === item ? accent : 'white', color: detailTab === item ? 'white' : 'var(--slate)', border: `1px solid ${detailTab === item ? accent : 'var(--border)'}` }}>
                      {item === 'feed' ? '📰 Feed' : item === 'members' ? '👥 Members' : item === 'requests' ? '✅ Requests' : isModerator ? '✉️ Invite' : '🙋 Nominate'}
                    </button>
                  ))}
                </div>

                {detailTab === 'feed' && (
                  <div className="space-y-4">
                    <div className="card">
                      <textarea className="input" rows={3} value={postBody} onChange={(e) => setPostBody(e.target.value)} placeholder="Share a question, idea, update or learning resource…" style={{ resize: 'vertical' }} />
                      <div className="grid md:grid-cols-2 gap-3 mt-3">
                        <input className="input" value={resourceUrl} disabled={Boolean(attachmentFile)} onChange={(e) => setResourceUrl(e.target.value)} placeholder="Optional resource link https://…" />
                        <input type="file" className="input" disabled={Boolean(resourceUrl.trim())} accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,.doc,.docx,.ppt,.pptx" onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)} />
                      </div>
                      {attachmentFile && <p className="text-xs mt-2" style={{ color: 'var(--slate)' }}>📎 {attachmentFile.name} · {(attachmentFile.size / 1024 / 1024).toFixed(1)} MB (max 10 MB)</p>}
                      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                        {isModerator ? <label className="text-sm flex items-center gap-2" style={{ color: 'var(--slate)' }}><input type="checkbox" checked={announcement} onChange={(e) => setAnnouncement(e.target.checked)} /> Post as announcement</label> : <span className="text-xs" style={{ color: 'var(--slate)' }}>Only Group members can see this feed.</span>}
                        <button className="btn-green" disabled={!postBody.trim() || postMutation.isPending} onClick={() => postMutation.mutate()}>{postMutation.isPending ? 'Publishing…' : 'Publish'}</button>
                      </div>
                    </div>

                    {postsQuery.isLoading ? <div className="card"><div className="skeleton h-40 rounded-xl" /></div> : (postsQuery.data || []).length === 0 ? <div className="card text-center py-10" style={{ color: 'var(--slate)' }}>No posts yet. Start the discussion.</div> : (postsQuery.data || []).map((post) => (
                      <div key={post.id} className="card" style={{ borderLeft: post.is_announcement ? '4px solid var(--saffron)' : post.is_pinned ? '4px solid var(--forest)' : undefined }}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div><div className="font-semibold" style={{ color: 'var(--navy)' }}>{post.author_name || 'Member'} <span className="text-xs font-normal" style={{ color: 'var(--slate)' }}>· {post.author_role}</span></div><div className="text-xs" style={{ color: 'var(--slate)' }}>{timeAgo(post.created_at)}</div></div>
                          <div className="flex gap-2 items-center flex-wrap">
                            {post.is_announcement && <Badge style={{ background: '#FFF3E0', color: '#A95000' }}>ANNOUNCEMENT</Badge>}
                            {post.is_pinned && <Badge style={{ background: '#E8F5E9', color: '#176B2C' }}>PINNED</Badge>}
                            {isModerator && <button className="text-xs font-bold" style={{ color: 'var(--forest)' }} onClick={() => pinMutation.mutate({ postId: post.id, pinned: !post.is_pinned })}>{post.is_pinned ? 'Unpin' : 'Pin'}</button>}
                            {(post.author_id === user?.id || isModerator) && <button className="text-xs font-bold" style={{ color: '#B3261E' }} onClick={() => deletePostMutation.mutate(post.id)}>Remove</button>}
                            <button className="text-xs" style={{ color: 'var(--slate)' }} onClick={() => reportMutation.mutate({ targetType: 'POST', targetId: post.id })}>Report</button>
                          </div>
                        </div>
                        <p className="mt-3 text-sm whitespace-pre-wrap" style={{ color: 'var(--navy)', lineHeight: 1.65 }}>{post.body}</p>
                        {post.attachment_url && <button className="btn-ghost text-xs mt-3" onClick={() => openAttachment(post.attachment_url || '')}>📎 Open resource</button>}
                        <div className="mt-4 pt-3 space-y-2" style={{ borderTop: '1px solid var(--border)' }}>
                          {post.comments.map((comment) => (
                            <div key={comment.id} className="rounded-xl px-3 py-2" style={{ background: '#F7F9FC' }}>
                              <div className="flex flex-wrap justify-between gap-2">
                                <span className="text-xs font-bold" style={{ color: 'var(--navy)' }}>{comment.author_name || 'Member'} · {comment.author_role}</span>
                                <div className="flex gap-2">
                                  {(comment.author_id === user?.id || isModerator) && <button className="text-xs font-bold" style={{ color: '#B3261E' }} onClick={() => removeCommentMutation.mutate(comment.id)}>Remove</button>}
                                  <button className="text-xs" style={{ color: 'var(--slate)' }} onClick={() => reportMutation.mutate({ targetType: 'COMMENT', targetId: comment.id })}>Report</button>
                                </div>
                              </div>
                              <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{comment.body}</p>
                            </div>
                          ))}
                          <div className="flex gap-2"><input className="input flex-1" value={commentBodies[post.id] || ''} onChange={(e) => setCommentBodies((current) => ({ ...current, [post.id]: e.target.value }))} placeholder="Write a reply…" /><button className="btn-ghost" disabled={!commentBodies[post.id]?.trim()} onClick={() => commentMutation.mutate({ postId: post.id, body: commentBodies[post.id] || '' })}>Reply</button></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {detailTab === 'members' && (
                  <div className="card">
                    <div className="flex flex-wrap justify-between gap-3 mb-4"><div><h3 className="font-display font-bold" style={{ color: 'var(--navy)' }}>Group Members</h3><p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Owner manages moderators and membership. Ownership can be transferred to an eligible active member.</p></div></div>
                    <div className="space-y-2">
                      {(membersQuery.data || []).map((member) => {
                        const transferAllowed = isOwner && member.user_id !== user?.id && member.role !== 'OWNER' && (activeGroup.kind !== 'MIXED' || canOwnMixed(member));
                        return (
                          <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                            <div><div className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{member.name || member.mobile}</div><div className="text-xs" style={{ color: 'var(--slate)' }}>{member.user_role} · {member.role}</div></div>
                            <div className="flex gap-2 flex-wrap">
                              {transferAllowed && <button className="btn-ghost text-xs" onClick={() => window.confirm(`Transfer ownership to ${member.name || member.mobile}?`) && transferMutation.mutate(member.user_id)}>Transfer Ownership</button>}
                              {isOwner && member.user_id !== user?.id && member.role !== 'OWNER' && <button className="btn-ghost text-xs" onClick={() => roleMutation.mutate({ userId: member.user_id, role: member.role === 'MODERATOR' ? 'MEMBER' : 'MODERATOR' })}>{member.role === 'MODERATOR' ? 'Make Member' : 'Make Moderator'}</button>}
                              {isModerator && member.user_id !== user?.id && member.role !== 'OWNER' && <button className="text-xs font-bold" style={{ color: '#B3261E' }} onClick={() => window.confirm('Remove this member?') && removeMemberMutation.mutate(member.user_id)}>Remove</button>}
                              {member.user_id !== user?.id && <button className="text-xs" style={{ color: 'var(--slate)' }} onClick={() => reportMutation.mutate({ targetType: 'MEMBER', targetId: member.user_id })}>Report</button>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {detailTab === 'requests' && isModerator && (
                  <div className="space-y-4">
                    <div className="card">
                      <h3 className="font-display font-bold mb-3" style={{ color: 'var(--navy)' }}>Join Requests</h3>
                      {(joinRequestsQuery.data || []).length === 0 ? <p className="text-sm" style={{ color: 'var(--slate)' }}>No pending join requests.</p> : (joinRequestsQuery.data || []).map((request) => <div key={request.id} className="flex flex-wrap justify-between gap-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}><div><div className="font-semibold text-sm">{request.name || request.mobile}</div><div className="text-xs" style={{ color: 'var(--slate)' }}>{request.role}{request.message ? ` · ${request.message}` : ''}</div></div><div className="flex gap-2"><button className="btn-green text-xs" onClick={() => joinDecisionMutation.mutate({ requestId: request.id, decision: 'APPROVED' })}>Approve</button><button className="btn-ghost text-xs" onClick={() => joinDecisionMutation.mutate({ requestId: request.id, decision: 'REJECTED' })}>Reject</button></div></div>)}
                    </div>
                    <div className="card">
                      <h3 className="font-display font-bold mb-3" style={{ color: 'var(--navy)' }}>Member Nominations</h3>
                      {(nominationsQuery.data || []).length === 0 ? <p className="text-sm" style={{ color: 'var(--slate)' }}>No pending nominations.</p> : (nominationsQuery.data || []).map((nomination) => <div key={nomination.id} className="flex flex-wrap justify-between gap-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}><div><div className="font-semibold text-sm">{nomination.invitee_name || nomination.invitee_mobile}</div><div className="text-xs" style={{ color: 'var(--slate)' }}>{nomination.invitee_role} · nominated by {nomination.proposed_by_name || 'member'}</div></div><div className="flex gap-2"><button className="btn-green text-xs" onClick={() => nominationDecisionMutation.mutate({ invitationId: nomination.id, decision: 'APPROVED' })}>Approve & Invite</button><button className="btn-ghost text-xs" onClick={() => nominationDecisionMutation.mutate({ invitationId: nomination.id, decision: 'REJECTED' })}>Reject</button></div></div>)}
                    </div>
                  </div>
                )}

                {detailTab === 'invite' && (
                  <div className="card">
                    <h3 className="font-display font-bold" style={{ color: 'var(--navy)' }}>{isModerator ? 'Invite a Member' : 'Nominate a Member'}</h3>
                    <p className="text-sm mt-1 mb-4" style={{ color: 'var(--slate)' }}>{isModerator ? 'The recipient must accept before becoming a member.' : 'The owner approves your nomination first; then the recipient decides whether to join.'}</p>
                    <input className="input" value={inviteSearch} onChange={(e) => setInviteSearch(e.target.value)} placeholder="Search eligible users by name, mobile or email…" />
                    {inviteSearch.trim().length < 2 ? <p className="text-xs mt-3" style={{ color: 'var(--slate)' }}>Enter at least 2 characters.</p> : eligibleQuery.isLoading ? <div className="skeleton h-24 rounded-xl mt-3" /> : <div className="mt-3 space-y-2">{(eligibleQuery.data || []).length === 0 ? <p className="text-sm" style={{ color: 'var(--slate)' }}>No eligible users found.</p> : (eligibleQuery.data || []).map((candidate) => <div key={candidate.id} className="flex items-center justify-between gap-3 p-3 rounded-xl" style={{ background: '#F7F9FC' }}><div><div className="font-semibold text-sm">{candidate.name || candidate.mobile}</div><div className="text-xs" style={{ color: 'var(--slate)' }}>{candidate.role} · {candidate.mobile}</div></div><button className="btn-green text-xs" onClick={() => inviteMutation.mutate(candidate.id)}>{isModerator ? 'Invite' : 'Nominate'}</button></div>)}</div>}
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
  const list = tab === 'mine' ? mineQuery.data || [] : discoverQuery.data || [];

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div><h1 className="font-display font-extrabold text-2xl" style={{ color: accent }}>👥 {title}</h1><p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{subtitle}</p></div>
        <button className="btn-green" onClick={() => setShowCreate((value) => !value)}>{showCreate ? '✕ Cancel' : '+ Request New Group'}</button>
      </div>

      <div className="card mb-5" style={{ background: '#F6FBF7', borderLeft: `4px solid ${accent}` }}>
        <div className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>🔒 Private and moderated by design</div>
        <p className="text-xs mt-1 leading-5" style={{ color: 'var(--slate)' }}>New Groups require VidyaSetu Admin approval. Join requests require owner/moderator approval. Invitations never force-add a user. Mixed Student/Adult Groups can only be owned by a Teacher or School Admin.</p>
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
            {form.scope === 'CLASS' && <label className="text-xs font-bold" style={{ color: 'var(--slate)' }}>Class<select className="input select mt-1.5" value={form.classId || ''} onChange={(e) => setForm((current) => ({ ...current, classId: e.target.value || null }))}><option value="">Select class</option>{filteredClasses.map((item) => <option key={item.id} value={item.id}>Class {item.className}{item.section ? `-${item.section}` : ''}</option>)}</select></label>}
            <label className="text-xs font-bold md:col-span-2" style={{ color: 'var(--slate)' }}>Purpose / description<textarea className="input mt-1.5" rows={3} maxLength={3000} value={form.description || ''} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} placeholder="What will members discuss or collaborate on?" style={{ resize: 'vertical' }} /></label>
          </div>
          <div className="flex justify-end mt-4"><button className="btn-green" disabled={createMutation.isPending || form.name.trim().length < 3 || (form.scope !== 'PRIVATE' && !form.schoolId) || (form.scope === 'CLASS' && !form.classId)} onClick={() => createMutation.mutate()}>{createMutation.isPending ? 'Submitting…' : 'Submit for Admin Approval'}</button></div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-2 flex-wrap">
          {(['mine', 'discover', 'invitations'] as WorkspaceTab[]).map((item) => <button key={item} type="button" className="px-4 py-2 rounded-xl text-sm font-bold" onClick={() => setTab(item)} style={{ background: tab === item ? accent : 'white', color: tab === item ? 'white' : 'var(--slate)', border: `1px solid ${tab === item ? accent : 'var(--border)'}` }}>{item === 'mine' ? 'My Groups' : item === 'discover' ? 'Discover' : `Invitations${(invitationsQuery.data || []).length ? ` (${(invitationsQuery.data || []).length})` : ''}`}</button>)}
        </div>
        {tab === 'discover' && <input className="input" style={{ width: 280 }} value={discoverSearch} onChange={(e) => setDiscoverSearch(e.target.value)} placeholder="Search Groups…" />}
      </div>

      {tab === 'invitations' ? (
        <div className="space-y-3">{invitationsQuery.isLoading ? <div className="card"><div className="skeleton h-24 rounded-xl" /></div> : (invitationsQuery.data || []).length === 0 ? <div className="card text-center py-10" style={{ color: 'var(--slate)' }}>No pending invitations.</div> : (invitationsQuery.data || []).map((invitation: GroupInvitation) => <div key={invitation.id} className="card flex flex-wrap items-center justify-between gap-4"><div><div className="font-display font-bold" style={{ color: 'var(--navy)' }}>✉️ {invitation.group_name || 'Group invitation'}</div><div className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Invited by {invitation.proposed_by_name || 'a Group member'}. You join only if you accept.</div></div><div className="flex gap-2"><button className="btn-green" onClick={() => inviteResponseMutation.mutate({ id: invitation.id, decision: 'ACCEPTED' })}>Accept</button><button className="btn-ghost" onClick={() => inviteResponseMutation.mutate({ id: invitation.id, decision: 'DECLINED' })}>Decline</button></div></div>)}</div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{(tab === 'mine' ? mineQuery.isLoading : discoverQuery.isLoading) ? [...Array(3)].map((_, index) => <div key={index} className="card"><div className="skeleton h-36 rounded-xl" /></div>) : list.length === 0 ? <div className="card md:col-span-2 xl:col-span-3 text-center py-12"><div className="text-4xl mb-3">👥</div><div className="font-display font-bold" style={{ color: 'var(--navy)' }}>{tab === 'mine' ? 'No Groups yet' : 'No eligible Groups found'}</div><p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{tab === 'mine' ? 'Request a new Group or discover an approved Group.' : 'Try another search or request a private Group.'}</p></div> : list.map((item) => <GroupCard key={item.id} group={item} onOpen={() => { setSelectedId(item.id); setDetailTab('feed'); }} />)}</div>
      )}
    </div>
  );
}
