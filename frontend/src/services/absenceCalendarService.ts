import api from './api';
import type { ApiEnvelope } from '@/types/api';

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type CalendarEventType = 'HOLIDAY' | 'SCHOOL_EVENT' | 'PTM' | 'EXAM' | 'ACTIVITY' | 'OTHER';

export interface LeaveRequest {
  id: string;
  school_id: string;
  student_id: string;
  requested_by: string;
  requester_role: 'STUDENT' | 'PARENT';
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveStatus;
  review_note?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  student_name?: string;
  student_code?: string;
  class_id?: string;
  class_name?: string;
  section?: string | null;
  requester_name?: string;
  reviewer_name?: string | null;
}
export interface CalendarEvent {
  id: string;
  school_id: string;
  title: string;
  description?: string | null;
  event_type: CalendarEventType;
  start_date: string;
  end_date: string;
  is_school_closed: boolean;
  class_ids?: string[];
  class_labels?: string[];
}
export interface LeavePayload { startDate: string; endDate: string; reason: string; }
export interface CalendarPayload {
  title: string;
  description?: string;
  eventType: CalendarEventType;
  startDate: string;
  endDate: string;
  isSchoolClosed?: boolean;
  classIds?: string[];
}

export const getStudentLeaves = () => api.get<ApiEnvelope<LeaveRequest[]>>('/student/absence/leave');
export const createStudentLeave = (payload: LeavePayload) => api.post<ApiEnvelope<LeaveRequest>>('/student/absence/leave', payload);
export const cancelStudentLeave = (leaveId: string) => api.patch<ApiEnvelope<LeaveRequest>>(`/student/absence/leave/${leaveId}/cancel`);
export const getStudentCalendar = () => api.get<ApiEnvelope<CalendarEvent[]>>('/student/absence/calendar');

export const getParentLeaves = (studentId: string) => api.get<ApiEnvelope<LeaveRequest[]>>(`/parent/absence/children/${studentId}/leave`);
export const createParentLeave = (studentId: string, payload: LeavePayload) => api.post<ApiEnvelope<LeaveRequest>>(`/parent/absence/children/${studentId}/leave`, payload);
export const cancelParentLeave = (studentId: string, leaveId: string) => api.patch<ApiEnvelope<LeaveRequest>>(`/parent/absence/children/${studentId}/leave/${leaveId}/cancel`);
export const getParentCalendar = (studentId: string) => api.get<ApiEnvelope<CalendarEvent[]>>(`/parent/absence/children/${studentId}/calendar`);

export const getSchoolLeaves = (status?: LeaveStatus) => api.get<ApiEnvelope<LeaveRequest[]>>('/school/absence/leave', { params: { status } });
export const reviewSchoolLeave = (leaveId: string, action: 'APPROVE'|'REJECT', note?: string) => api.patch<ApiEnvelope<LeaveRequest>>(`/school/absence/leave/${leaveId}/review`, { action, note });
export const getSchoolCalendar = () => api.get<ApiEnvelope<CalendarEvent[]>>('/school/absence/calendar');
export const createSchoolCalendar = (payload: CalendarPayload) => api.post<ApiEnvelope<CalendarEvent>>('/school/absence/calendar', payload);
export const updateSchoolCalendar = (eventId: string, payload: Partial<CalendarPayload>) => api.patch<ApiEnvelope<CalendarEvent>>(`/school/absence/calendar/${eventId}`, payload);
export const archiveSchoolCalendar = (eventId: string) => api.delete<ApiEnvelope<CalendarEvent>>(`/school/absence/calendar/${eventId}`);
