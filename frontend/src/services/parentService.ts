import api from './api';
import type { ApiEnvelope } from '@/types/api';

export interface ParentChild {
  id: string;
  student_code: string;
  grade_level: string;
  school_link_status: string;
  roll_number?: string | null;
  name: string;
  username?: string | null;
  profile_photo?: string | null;
  class_name: string;
  section?: string | null;
  school_name?: string | null;
  relation?: string | null;
}

export interface ParentDashboardStudent {
  id: string;
  name: string;
  username?: string | null;
  email?: string | null;
  mobile?: string | null;
  school_id?: string | null;
  class_id?: string | null;
  academic_year?: string | null;
  grade_level?: string | null;
  school_link_status?: string | null;
  class_name?: string | null;
  section?: string | null;
  class_label?: string | null;
  school_name?: string | null;
  xp_level?: number | null;
  xp_total?: number | null;
}

export interface ParentAttendanceSummary {
  present_days?: number | null;
  absent_days?: number | null;
  late_days?: number | null;
  half_days?: number | null;
  working_days?: number | null;
  total_days?: number | null;
  percentage?: number | string | null;
}

export interface ParentSubjectProgress {
  name: string;
  code: string;
  color_hex?: string | null;
  progress_pct?: string | number | null;
}

export interface ParentRecentExam {
  title?: string | null;
  exam_name?: string | null;
  type?: string | null;
  score?: number | string | null;
  total_marks?: number | string | null;
  max_marks?: number | string | null;
  percentage?: number | string | null;
  rank_school?: number | null;
  rank_overall?: number | null;
  submitted_at?: string | null;
}

export interface ParentFeeRow {
  id?: string;
  invoice_number?: string | null;
  amount_due: number | string;
  amount_paid: number | string;
  status: string;
  due_date?: string | null;
  term?: string | number | null;
  payment_mode?: string | null;
  payment_date?: string | null;
  receipt_number?: string | null;
}

export interface ParentDashboardData {
  student: ParentDashboardStudent;
  attendance: ParentAttendanceSummary | null;
  todayAttendance: { status?: string | null; created_at?: string | null } | null;
  subjectProgress: ParentSubjectProgress[];
  recentExams: ParentRecentExam[];
  fees: ParentFeeRow[];
  notifications: ParentNotification[];
}

export interface ParentAttendanceRecord {
  date: string;
  status: string;
  remark?: string | null;
}

export interface ParentAttendanceData {
  records: ParentAttendanceRecord[];
  summary: ParentAttendanceSummary | null;
}

export interface ParentMessage {
  id: string;
  sender_id?: string | null;
  sent_by?: string | null;
  receiver_id?: string | null;
  sender_name?: string | null;
  body: string;
  created_at?: string | null;
}

export interface ParentNotification {
  id: string;
  type: string;
  title?: string | null;
  body?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
  read_at?: string | null;
}

export const getChildren = () => api.get<ApiEnvelope<ParentChild[]>>('/parent/children');
export const getChildDashboard = (id: string) => api.get<ApiEnvelope<ParentDashboardData>>(`/parent/children/${id}/dashboard`);
export const getChildAttendance = (id: string, year: string | number, month: string | number) =>
  api.get<ApiEnvelope<ParentAttendanceData>>(`/parent/children/${id}/attendance?year=${year}&month=${month}`);
export const getChildFees = (id: string) => api.get<ApiEnvelope<ParentFeeRow[]>>(`/parent/children/${id}/fees`);
export const getMessages = (id: string) => api.get<ApiEnvelope<ParentMessage[]>>(`/parent/children/${id}/messages`);
export const sendMessage = (id: string, body: string) => api.post<ApiEnvelope<ParentMessage>>(`/parent/children/${id}/messages`, { body });
export const getNotifications = () => api.get<ApiEnvelope<ParentNotification[]>>('/parent/notifications');
