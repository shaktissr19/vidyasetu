import api from './api';
import type { ApiEnvelope } from '@/types/api';

export type GroupKind = 'STUDENT' | 'PARENT' | 'TEACHER' | 'MIXED';
export type GroupScope = 'PRIVATE' | 'SCHOOL' | 'CLASS';
export type GroupStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED' | 'ARCHIVED';
export type GroupMemberRole = 'OWNER' | 'MODERATOR' | 'MEMBER';
export type GroupInvitationStatus = 'PENDING_OWNER_APPROVAL' | 'PENDING_RECIPIENT' | 'ACCEPTED' | 'DECLINED' | 'REJECTED' | 'CANCELLED';

export interface GroupSummary {
  id: string;
  name: string;
  description?: string | null;
  kind: GroupKind;
  scope: GroupScope;
  school_id?: string | null;
  class_id?: string | null;
  school_name?: string | null;
  class_name?: string | null;
  section?: string | null;
  owner_id: string;
  owner_name?: string | null;
  status: GroupStatus;
  max_members: number;
  member_count?: number | string | null;
  membership_role?: GroupMemberRole | null;
  join_request_status?: string | null;
  invitation_status?: GroupInvitationStatus | null;
  pending_join_count?: number | string | null;
  pending_nomination_count?: number | string | null;
  admin_note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface GroupDetail extends GroupSummary {
  settings?: {
    allow_member_nominations?: boolean;
    allow_member_posts?: boolean;
    allow_member_comments?: boolean;
  } | null;
}

export interface GroupMember {
  id: string;
  user_id: string;
  role: GroupMemberRole;
  status: string;
  joined_at?: string | null;
  name?: string | null;
  mobile?: string | null;
  user_role?: string | null;
  profile_photo?: string | null;
}

export interface GroupJoinRequest {
  id: string;
  group_id: string;
  user_id: string;
  status: string;
  message?: string | null;
  name?: string | null;
  mobile?: string | null;
  role?: string | null;
  profile_photo?: string | null;
  created_at?: string | null;
}

export interface GroupInvitation {
  id: string;
  group_id: string;
  invitee_user_id: string;
  proposed_by: string;
  status: GroupInvitationStatus;
  message?: string | null;
  group_name?: string | null;
  kind?: GroupKind;
  scope?: GroupScope;
  proposed_by_name?: string | null;
  invitee_name?: string | null;
  invitee_mobile?: string | null;
  invitee_role?: string | null;
  created_at?: string | null;
}

export interface GroupEligibleUser {
  id: string;
  name?: string | null;
  mobile: string;
  role: string;
  profile_photo?: string | null;
}

export interface GroupComment {
  id: string;
  post_id: string;
  group_id: string;
  author_id: string;
  body: string;
  status: string;
  created_at: string;
  author_name?: string | null;
  author_role?: string | null;
}

export interface GroupPost {
  id: string;
  group_id: string;
  author_id: string;
  body: string;
  attachment_url?: string | null;
  is_announcement: boolean;
  is_pinned: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  author_name?: string | null;
  author_role?: string | null;
  comments: GroupComment[];
}

export interface AdminGroupSummary extends GroupSummary {
  owner_role?: string | null;
  open_report_count?: number | string | null;
}

export interface AdminGroupReport {
  id: string;
  group_id: string;
  group_name?: string | null;
  reported_by: string;
  reported_by_name?: string | null;
  reported_by_role?: string | null;
  target_type: 'GROUP' | 'POST' | 'COMMENT' | 'MEMBER';
  target_id: string;
  reason: string;
  details?: string | null;
  status: 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';
  resolution?: string | null;
  created_at?: string | null;
}

export interface GroupCreationContext {
  allowedKinds: GroupKind[];
  allowedScopes: GroupScope[];
  schools: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; schoolId: string; className: string; section?: string | null }>;
}

export interface CreateGroupPayload {
  name: string;
  description?: string | null;
  kind: GroupKind;
  scope: GroupScope;
  schoolId?: string | null;
  classId?: string | null;
  maxMembers?: number;
}

export const getGroupContext = () => api.get<ApiEnvelope<GroupCreationContext>>('/groups/context');
export const createGroup = (payload: CreateGroupPayload) => api.post<ApiEnvelope<GroupSummary>>('/groups', payload);
export const getMyGroups = () => api.get<ApiEnvelope<GroupSummary[]>>('/groups/mine');
export const discoverGroups = (search = '') => api.get<ApiEnvelope<GroupSummary[]>>('/groups/discover', { params: { search } });
export const getGroupDetail = (groupId: string) => api.get<ApiEnvelope<GroupDetail>>(`/groups/${groupId}`);
export const requestJoin = (groupId: string, message?: string) => api.post<ApiEnvelope<GroupJoinRequest>>(`/groups/${groupId}/join-requests`, { message });
export const getJoinRequests = (groupId: string) => api.get<ApiEnvelope<GroupJoinRequest[]>>(`/groups/${groupId}/join-requests`);
export const decideJoinRequest = (groupId: string, requestId: string, decision: 'APPROVED' | 'REJECTED') => api.patch<ApiEnvelope<GroupJoinRequest>>(`/groups/${groupId}/join-requests/${requestId}`, { decision });
export const searchEligibleUsers = (groupId: string, search = '') => api.get<ApiEnvelope<GroupEligibleUser[]>>(`/groups/${groupId}/eligible-users`, { params: { search } });
export const proposeInvitation = (groupId: string, userId: string, message?: string) => api.post<ApiEnvelope<GroupInvitation>>(`/groups/${groupId}/invitations`, { userId, message });
export const getNominations = (groupId: string) => api.get<ApiEnvelope<GroupInvitation[]>>(`/groups/${groupId}/nominations`);
export const decideNomination = (groupId: string, invitationId: string, decision: 'APPROVED' | 'REJECTED') => api.patch<ApiEnvelope<GroupInvitation>>(`/groups/${groupId}/nominations/${invitationId}`, { decision });
export const getMyInvitations = () => api.get<ApiEnvelope<GroupInvitation[]>>('/groups/invitations');
export const respondInvitation = (invitationId: string, decision: 'ACCEPTED' | 'DECLINED') => api.patch<ApiEnvelope<GroupInvitation>>(`/groups/invitations/${invitationId}/respond`, { decision });
export const getMembers = (groupId: string) => api.get<ApiEnvelope<GroupMember[]>>(`/groups/${groupId}/members`);
export const updateMemberRole = (groupId: string, userId: string, role: 'MODERATOR' | 'MEMBER') => api.patch<ApiEnvelope<GroupMember>>(`/groups/${groupId}/members/${userId}/role`, { role });
export const removeMember = (groupId: string, userId: string) => api.delete<ApiEnvelope<GroupMember>>(`/groups/${groupId}/members/${userId}`);
export const leaveGroup = (groupId: string) => api.post<ApiEnvelope<GroupMember>>(`/groups/${groupId}/leave`);
export const getPosts = (groupId: string, page = 1) => api.get<ApiEnvelope<GroupPost[]>>(`/groups/${groupId}/posts`, { params: { page } });
export const createPost = (groupId: string, body: string, isAnnouncement = false, attachmentUrl?: string) => api.post<ApiEnvelope<GroupPost>>(`/groups/${groupId}/posts`, { body, isAnnouncement, attachmentUrl: attachmentUrl || null });
export const addComment = (groupId: string, postId: string, body: string) => api.post<ApiEnvelope<GroupComment>>(`/groups/${groupId}/posts/${postId}/comments`, { body });
export const setPostPinned = (groupId: string, postId: string, pinned: boolean) => api.patch<ApiEnvelope<GroupPost>>(`/groups/${groupId}/posts/${postId}/pin`, { pinned });
export const deletePost = (groupId: string, postId: string) => api.delete<ApiEnvelope<GroupPost>>(`/groups/${groupId}/posts/${postId}`);
export const reportGroupContent = (groupId: string, targetType: 'GROUP' | 'POST' | 'COMMENT' | 'MEMBER', targetId: string, reason: string, details?: string) => api.post<ApiEnvelope<unknown>>(`/groups/${groupId}/reports`, { targetType, targetId, reason, details });

export const adminListGroups = (status = '', search = '') => api.get<ApiEnvelope<AdminGroupSummary[]>>('/admin/groups', { params: { status, search } });
export const adminDecideGroup = (groupId: string, decision: 'ACTIVE' | 'REJECTED', note?: string) => api.patch<ApiEnvelope<AdminGroupSummary>>(`/admin/groups/${groupId}/decision`, { decision, note });
export const adminUpdateGroupStatus = (groupId: string, status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED', note?: string) => api.patch<ApiEnvelope<AdminGroupSummary>>(`/admin/groups/${groupId}/status`, { status, note });
export const adminListGroupReports = (status = '') => api.get<ApiEnvelope<AdminGroupReport[]>>('/admin/group-reports', { params: { status } });
export const adminResolveGroupReport = (reportId: string, status: 'REVIEWING' | 'RESOLVED' | 'DISMISSED', resolution?: string) => api.patch<ApiEnvelope<AdminGroupReport>>(`/admin/group-reports/${reportId}`, { status, resolution });
