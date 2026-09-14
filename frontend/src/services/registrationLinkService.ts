import api from './api';
import type { ApiEnvelope } from '@/types/api';

export interface ParentLinkRequest {
  id: string;
  status: 'PENDING' | 'AWAITING_STUDENT' | 'AWAITING_PARENT' | 'APPROVED' | 'REJECTED';
  initiated_by: 'STUDENT' | 'PARENT' | 'SCHOOL';
  relation?: string | null;
  parent_name?: string | null;
  parent_mobile?: string | null;
  parent_email?: string | null;
  registered_parent_name?: string | null;
  registered_parent_mobile?: string | null;
  registered_parent_email?: string | null;
  student_name?: string | null;
  student_code?: string | null;
  grade_level?: string | null;
  school_name?: string | null;
  created_at?: string | null;
  relationshipStatus?: string;
  message?: string;
}

export interface TeacherRegistrationRequest {
  id: string;
  teacher_user_id: string;
  requested_school_id: string;
  status: string;
  employee_id?: string | null;
  designation?: string | null;
  qualification?: string | null;
  experience_yrs?: number | null;
  employment_type?: string | null;
  teacher_note?: string | null;
  school_note?: string | null;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  mobile?: string | null;
  requested_at?: string | null;
  created_at?: string | null;
}

export interface ParentInvitationInput {
  parentName?: string;
  parentMobile?: string;
  parentEmail?: string;
  parentRelation?: 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'PARENT';
}

export const createStudentParentLinkRequest = (data: ParentInvitationInput) =>
  api.post<ApiEnvelope<ParentLinkRequest>>('/student/parent-link-requests', data);

export const getStudentParentLinkRequests = () =>
  api.get<ApiEnvelope<ParentLinkRequest[]>>('/student/parent-link-requests');

export const reviewStudentParentLinkRequest = (requestId: string, action: 'APPROVE' | 'REJECT') =>
  api.patch<ApiEnvelope<ParentLinkRequest>>(`/student/parent-link-requests/${requestId}`, { action });

export const requestParentChildLink = (
  studentCode: string,
  relation: 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'PARENT' = 'PARENT',
) => api.post<ApiEnvelope<ParentLinkRequest>>('/parent/link-requests', { studentCode, relation });

export const getParentLinkRequests = () =>
  api.get<ApiEnvelope<ParentLinkRequest[]>>('/parent/link-requests');

export const reviewParentLinkRequest = (requestId: string, action: 'APPROVE' | 'REJECT') =>
  api.patch<ApiEnvelope<ParentLinkRequest>>(`/parent/link-requests/${requestId}`, { action });

export const getTeacherRegistrationRequests = () =>
  api.get<ApiEnvelope<TeacherRegistrationRequest[]>>('/school/teacher-registration-requests');

export const reviewTeacherRegistrationRequest = (
  requestId: string,
  action: 'APPROVE' | 'REJECT',
  note?: string,
) => api.patch<ApiEnvelope<{ request: { id: string; status: string }; teacher?: unknown | null }>>(
  `/school/teacher-registration-requests/${requestId}`,
  { action, note },
);
