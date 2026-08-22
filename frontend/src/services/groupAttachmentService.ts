import api from './api';
import type { ApiEnvelope } from '@/types/api';

export interface GroupUploadTicket {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

export const getGroupUploadUrl = (groupId: string, fileName: string, contentType: string) =>
  api.post<ApiEnvelope<GroupUploadTicket>>(`/groups/${groupId}/upload-url`, { fileName, contentType });

export const getGroupAttachmentUrl = (groupId: string, key: string) =>
  api.get<ApiEnvelope<{ url: string; expiresIn: number }>>(`/groups/${groupId}/attachment-url`, { params: { key } });

export async function uploadGroupFile(groupId: string, file: File): Promise<string> {
  const ticket = await getGroupUploadUrl(groupId, file.name, file.type || 'application/octet-stream').then((r) => r.data.data);
  const response = await fetch(ticket.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!response.ok) throw new Error(`Attachment upload failed (${response.status})`);
  return ticket.key;
}
