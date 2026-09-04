import api from './api';
import type { ApiEnvelope } from '@/types/api';

export type StaffLeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type StaffAttendanceInputStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'HOLIDAY';
export type StaffAttendanceStatus = StaffAttendanceInputStatus | 'EXCUSED';

export interface StaffLeaveRequest {
  id: string;
  school_id: string;
  teacher_id: string;
  requested_by: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: StaffLeaveStatus;
  review_note?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  teacher_name?: string;
  employee_id?: string | null;
  designation?: string | null;
  reviewer_name?: string | null;
}
export interface StaffRosterRow {
  id: string;
  employee_id?: string | null;
  designation?: string | null;
  profile_status: string;
  name: string;
  attendance_status?: StaffAttendanceStatus | '';
  remark?: string | null;
  leave_request_id?: string | null;
  leave_reason?: string | null;
  approved_leave?: boolean;
  operational_availability?: 'WORKING' | 'APPROVED_LEAVE' | 'SCHOOL_CLOSED' | 'RECORDED' | string;
  school_closed?: boolean;
  closure_title?: string | null;
}
export interface StaffAttendanceRecord {
  date: string;
  status: StaffAttendanceStatus;
  remark?: string | null;
}
export interface StaffAttendanceSummary {
  working_days?: number | string;
  present_days?: number | string;
  absent_days?: number | string;
  late_days?: number | string;
  half_days?: number | string;
  excused_days?: number | string;
  holiday_days?: number | string;
  attendance_percentage?: number | string;
}
export interface MyStaffAttendance {
  teacher: { id: string; name: string; employee_id?: string | null; profile_status: string };
  records: StaffAttendanceRecord[];
  summary: StaffAttendanceSummary | null;
}
export interface SchoolStaffSummaryRow extends StaffAttendanceSummary {
  id: string;
  name: string;
  employee_id?: string | null;
  designation?: string | null;
  profile_status: string;
}
export interface StaffAttendancePayload {
  date: string;
  records: Array<{ teacherId: string; status: StaffAttendanceInputStatus; remark?: string }>;
}

export const getMyStaffLeaves = () => api.get<ApiEnvelope<StaffLeaveRequest[]>>('/school/staff/me/leaves');
export const createMyStaffLeave = (payload: { startDate: string; endDate: string; reason: string }) => api.post<ApiEnvelope<StaffLeaveRequest>>('/school/staff/me/leaves', payload);
export const cancelMyStaffLeave = (leaveId: string) => api.patch<ApiEnvelope<StaffLeaveRequest>>(`/school/staff/me/leaves/${leaveId}/cancel`);
export const getMyStaffAttendance = (year: number, month: number) => api.get<ApiEnvelope<MyStaffAttendance>>('/school/staff/me/attendance', { params: { year, month } });

export const getStaffLeaves = (status?: StaffLeaveStatus) => api.get<ApiEnvelope<StaffLeaveRequest[]>>('/school/staff/leaves', { params: { status } });
export const reviewStaffLeave = (leaveId: string, action: 'APPROVE' | 'REJECT', note?: string) => api.patch<ApiEnvelope<StaffLeaveRequest>>(`/school/staff/leaves/${leaveId}/review`, { action, note });
export const getStaffRoster = (date: string) => api.get<ApiEnvelope<StaffRosterRow[]>>('/school/staff/attendance/roster', { params: { date } });
export const markStaffAttendance = (payload: StaffAttendancePayload) => api.post<ApiEnvelope<{ marked: number }>>('/school/staff/attendance', payload);
export const getStaffAttendanceSummary = (year: number, month: number) => api.get<ApiEnvelope<SchoolStaffSummaryRow[]>>('/school/staff/attendance/summary', { params: { year, month } });