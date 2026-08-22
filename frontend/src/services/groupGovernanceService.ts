import api from './api';
import type { ApiEnvelope } from '@/types/api';
import type { GroupMember, GroupSummary } from './groupService';

export const transferGroupOwnership = (groupId: string, userId: string) =>
  api.patch<ApiEnvelope<GroupSummary>>(`/groups/${groupId}/owner`, { userId });

export const removeGroupComment = (groupId: string, commentId: string) =>
  api.delete<ApiEnvelope<{ id: string; group_id: string; post_id: string; author_id: string; status: string }>>(`/groups/${groupId}/comments/${commentId}`);

export const adminGetGroupMembers = (groupId: string) =>
  api.get<ApiEnvelope<GroupMember[]>>(`/admin/groups/${groupId}/members`);

export const adminTransferGroupOwnership = (groupId: string, userId: string) =>
  api.patch<ApiEnvelope<GroupSummary>>(`/admin/groups/${groupId}/owner`, { userId });
