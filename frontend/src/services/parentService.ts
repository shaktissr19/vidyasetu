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
  user_id?: string;
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
  xp_level?: number | string | null;
  xp_total?: number | string | null;
}

export interface ParentAttendanceSummary {
  present_days?: number | string | null;
  absent_days?: number | string | null;
  late_days?: number | string | null;
  half_days?: number | string | null;
  working_days?: number | string | null;
  total_days?: number | string | null;
  percentage?: number | string | null;
}

export interface ParentSubjectProgress {
  name: string;
  code: string;
  color_hex?: string | null;
  progress_pct?: string | number | null;
}

export interface ParentRecentExam {
  exam_id?: string;
  title?: string | null;
  exam_name?: string | null;
  type?: string | null;
  score?: number | string | null;
  total_marks?: number | string | null;
  max_marks?: number | string | null;
  percentage?: number | string | null;
  rank_school?: number | string | null;
  rank_overall?: number | string | null;
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
  academic_year?: string | null;
  payment_mode?: string | null;
  payment_date?: string | null;
  receipt_number?: string | null;
}

export interface ParentClassTeacher {
  teacher_id: string;
  teacher_user_id: string;
  name: string;
  email?: string | null;
  mobile?: string | null;
}

export interface ParentAcademicRanking {
  rank?: number | string | null;
  average?: number | string | null;
}

export interface ParentDashboardData {
  student: ParentDashboardStudent;
  attendance: ParentAttendanceSummary | null;
  todayAttendance: { status?: string | null; created_at?: string | null } | null;
  subjectProgress: ParentSubjectProgress[];
  recentExams: ParentRecentExam[];
  fees: ParentFeeRow[];
  nextFee?: ParentFeeRow | null;
  notifications: ParentNotification[];
  classTeacher?: ParentClassTeacher | null;
  academicRanking?: ParentAcademicRanking | null;
}

export interface ParentAttendanceRecord {
  date: string;
  status: string;
  remark?: string | null;
}

export interface ParentAttendanceData {
  records: ParentAttendanceRecord[];
  summary: ParentAttendanceSummary | null;
  annualSummary?: ParentAttendanceSummary | null;
  academicYear?: string | null;
}

export interface ParentPerformanceScore {
  examId: string;
  examName: string;
  date: string;
  marks: number;
  maxMarks: number;
  percentage: number;
}

export type ParentPerformanceTrend = 'IMPROVING' | 'STEADY' | 'DECLINING' | 'NEW';

export interface ParentSubjectPerformance {
  subjectCode: string;
  subjectName: string;
  scores: ParentPerformanceScore[];
  latest: number | null;
  trend: ParentPerformanceTrend;
}

export interface ParentPerformanceData {
  student: {
    id: string;
    name: string;
    class_name?: string | null;
    section?: string | null;
    school_name?: string | null;
    academic_year?: string | null;
  };
  subjects: ParentSubjectPerformance[];
}

export interface ParentReportCardResult {
  exam_id: string;
  exam_name: string;
  title_hi?: string | null;
  subject_codes?: string[] | null;
  start_time: string;
  marks_obtained: number | string;
  max_marks: number | string;
  correct_count?: number | string | null;
  wrong_count?: number | string | null;
  skipped_count?: number | string | null;
  percentile?: number | string | null;
  rank_school?: number | string | null;
  rank_overall?: number | string | null;
}

export interface ParentReportCardData {
  student: {
    id: string;
    roll_number?: string | null;
    academic_year: string;
    name: string;
    class_name: string;
    section?: string | null;
    school_name: string;
    udise_code?: string | null;
  };
  academicYear: string;
  requestedTerm?: string | null;
  results: ParentReportCardResult[];
  attendance: ParentAttendanceSummary | null;
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
export const getChildPerformance = (id: string) => api.get<ApiEnvelope<ParentPerformanceData>>(`/parent/children/${id}/performance`);
export const getChildAttendance = (id: string, year: string | number, month: string | number) =>
  api.get<ApiEnvelope<ParentAttendanceData>>(`/parent/children/${id}/attendance?year=${year}&month=${month}`);
export const getChildReportCard = (id: string, academicYear?: string | null, term?: string | null) => {
  const params = new URLSearchParams();
  if (academicYear) params.set('academicYear', academicYear);
  if (term) params.set('term', term);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return api.get<ApiEnvelope<ParentReportCardData>>(`/parent/children/${id}/report-card${suffix}`);
};
export const getChildTeacher = (id: string) => api.get<ApiEnvelope<ParentClassTeacher | null>>(`/parent/children/${id}/teacher`);
export const getChildFees = (id: string) => api.get<ApiEnvelope<ParentFeeRow[]>>(`/parent/children/${id}/fees`);
export const getMessages = (id: string) => api.get<ApiEnvelope<ParentMessage[]>>(`/parent/children/${id}/messages`);
export const sendMessage = (id: string, body: string) => api.post<ApiEnvelope<ParentMessage>>(`/parent/children/${id}/messages`, { body });
export const getNotifications = () => api.get<ApiEnvelope<ParentNotification[]>>('/parent/notifications');
export const markNotificationRead = (notificationId: string) => api.patch<ApiEnvelope<ParentNotification>>(`/parent/notifications/${notificationId}/read`);
export const markAllNotificationsRead = () => api.patch<ApiEnvelope<{ updated: number }>>('/parent/notifications/read-all');
