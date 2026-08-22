import api from './api';
import type { ApiEnvelope } from '@/types/api';

export type GrievanceCategory = 'ACADEMICS'|'ATTENDANCE'|'FEES'|'TEACHER_CONCERN'|'BULLYING_SAFETY'|'TRANSPORT'|'INFRASTRUCTURE'|'ADMINISTRATION'|'OTHER';
export type GrievancePriority = 'LOW'|'NORMAL'|'HIGH'|'URGENT';
export type GrievanceStatus = 'OPEN'|'ACKNOWLEDGED'|'IN_PROGRESS'|'RESOLVED'|'CLOSED'|'ESCALATED';

export interface GrievanceSummary {
  id: string;
  ticket_number: string;
  parent_user_id: string;
  student_id: string;
  school_id: string;
  category: GrievanceCategory;
  priority: GrievancePriority;
  subject: string;
  description: string;
  status: GrievanceStatus;
  assigned_to?: string | null;
  due_at?: string | null;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  escalated_at?: string | null;
  resolution?: string | null;
  reopen_count?: number;
  created_at: string;
  updated_at: string;
  parent_name?: string;
  student_name?: string;
  school_name?: string;
  assigned_to_name?: string | null;
  overdue?: boolean;
}

export interface GrievanceMessage {
  id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  author_user_id: string;
  author_name: string;
  author_role: string;
}

export interface GrievanceHistory {
  id: string;
  action: string;
  from_status?: GrievanceStatus | null;
  to_status?: GrievanceStatus | null;
  note?: string | null;
  created_at: string;
  actor_name: string;
  actor_role: string;
}

export interface GrievanceDetail extends GrievanceSummary {
  messages: GrievanceMessage[];
  history: GrievanceHistory[];
}

export interface GrievanceAttachment {
  id: string;
  grievance_id: string;
  uploaded_by: string;
  file_name: string;
  content_type: string;
  file_size?: number | string | null;
  created_at: string;
  uploader_name: string;
  uploader_role: string;
}

export interface GrievanceUploadTicket {
  uploadUrl: string;
  key: string;
  expiresIn: number;
  maxFileSize: number;
}

export interface CreateGrievancePayload {
  studentId: string;
  category: GrievanceCategory;
  priority?: GrievancePriority;
  subject: string;
  description: string;
}

export const listParentGrievances = () => api.get<ApiEnvelope<GrievanceSummary[]>>('/parent/grievances');
export const createParentGrievance = (payload: CreateGrievancePayload) => api.post<ApiEnvelope<GrievanceDetail>>('/parent/grievances', payload);
export const getParentGrievance = (id: string) => api.get<ApiEnvelope<GrievanceDetail>>(`/parent/grievances/${id}`);
export const replyParentGrievance = (id: string, body: string) => api.post<ApiEnvelope<GrievanceDetail>>(`/parent/grievances/${id}/replies`, { body });
export const parentGrievanceAction = (id: string, action: 'CLOSE'|'REOPEN'|'ESCALATE', note?: string) => api.patch<ApiEnvelope<GrievanceDetail>>(`/parent/grievances/${id}/action`, { action, note });

export const getParentGrievanceUploadUrl = (id: string, file: File) => api.post<ApiEnvelope<GrievanceUploadTicket>>(
  `/parent/grievances/${id}/attachments/upload-url`,
  { fileName: file.name, contentType: file.type || 'application/octet-stream', fileSize: file.size },
);
export const confirmParentGrievanceAttachment = (
  id: string,
  payload: { key: string; fileName: string; contentType: string; fileSize: number },
) => api.post<ApiEnvelope<GrievanceAttachment>>(`/parent/grievances/${id}/attachments`, payload);
export const listParentGrievanceAttachments = (id: string) => api.get<ApiEnvelope<GrievanceAttachment[]>>(`/parent/grievances/${id}/attachments`);
export const getParentGrievanceAttachmentUrl = (id: string, attachmentId: string) => api.get<ApiEnvelope<{ url: string; expiresIn: number; fileName: string; contentType: string }>>(`/parent/grievances/${id}/attachments/${attachmentId}/url`);

export async function uploadParentGrievanceEvidence(id: string, file: File): Promise<GrievanceAttachment> {
  const contentType = file.type || 'application/octet-stream';
  const ticket = await getParentGrievanceUploadUrl(id, file).then((r) => r.data.data);
  const upload = await fetch(ticket.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!upload.ok) throw new Error(`Evidence upload failed (${upload.status})`);
  return confirmParentGrievanceAttachment(id, {
    key: ticket.key,
    fileName: file.name,
    contentType,
    fileSize: file.size,
  }).then((r) => r.data.data);
}

export const listSchoolGrievances = (status?: string) => api.get<ApiEnvelope<GrievanceSummary[]>>('/school/grievances', { params: status ? { status } : undefined });
export const getSchoolGrievance = (id: string) => api.get<ApiEnvelope<GrievanceDetail>>(`/school/grievances/${id}`);
export const replySchoolGrievance = (id: string, body: string, internal = false) => api.post<ApiEnvelope<GrievanceDetail>>(`/school/grievances/${id}/replies`, { body, internal });
export const schoolGrievanceAction = (id: string, action: 'ACKNOWLEDGE'|'START'|'RESOLVE', note?: string) => api.patch<ApiEnvelope<GrievanceDetail>>(`/school/grievances/${id}/action`, { action, note });
export const listSchoolGrievanceAttachments = (id: string) => api.get<ApiEnvelope<GrievanceAttachment[]>>(`/school/grievances/${id}/attachments`);
export const getSchoolGrievanceAttachmentUrl = (id: string, attachmentId: string) => api.get<ApiEnvelope<{ url: string; expiresIn: number; fileName: string; contentType: string }>>(`/school/grievances/${id}/attachments/${attachmentId}/url`);

export const listAdminGrievances = (status?: string, schoolId?: string) => api.get<ApiEnvelope<GrievanceSummary[]>>('/admin/grievances', { params: { ...(status ? { status } : {}), ...(schoolId ? { schoolId } : {}) } });
export const getAdminGrievance = (id: string) => api.get<ApiEnvelope<GrievanceDetail>>(`/admin/grievances/${id}`);
export const replyAdminGrievance = (id: string, body: string, internal = false) => api.post<ApiEnvelope<GrievanceDetail>>(`/admin/grievances/${id}/replies`, { body, internal });
export const adminGrievanceStatus = (id: string, status: GrievanceStatus, note?: string) => api.patch<ApiEnvelope<GrievanceDetail>>(`/admin/grievances/${id}/status`, { status, note });
export const listAdminGrievanceAttachments = (id: string) => api.get<ApiEnvelope<GrievanceAttachment[]>>(`/admin/grievances/${id}/attachments`);
export const getAdminGrievanceAttachmentUrl = (id: string, attachmentId: string) => api.get<ApiEnvelope<{ url: string; expiresIn: number; fileName: string; contentType: string }>>(`/admin/grievances/${id}/attachments/${attachmentId}/url`);
