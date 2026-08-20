import api from './api';
import type { ApiEnvelope, ApiListResponse } from '@/types/api';

export type SchoolQueryParams = Record<string, string | number | boolean | null | undefined>;
export type SchoolPayload = Record<string, unknown>;

export interface SchoolProfileData {
  id: string;
  name: string;
  name_hi?: string | null;
  udise_code?: string | null;
  status?: string | null;
  plan?: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
  mobile?: string | null;
  email?: string | null;
  website?: string | null;
  academic_year?: string | null;
  logo_url?: string | null;
  board?: string | null;
  affiliation_number?: string | null;
  principal_name?: string | null;
  admin_name?: string | null;
  admin_username?: string | null;
  admin_email?: string | null;
  admin_mobile?: string | null;
}

export interface SchoolOverviewStats {
  total_students?: number | string;
  total_teachers?: number | string;
  total_classes?: number | string;
  attended_today?: number | string;
  attendance_denominator?: number | string;
  today_attendance?: number | string;
  pending_enrollment_requests?: number | string;
  upcoming_exams?: number | string;
}

export interface SchoolFeeStats {
  collected?: number | string;
  pending?: number | string;
  paid_count?: number | string;
  pending_count?: number | string;
}

export interface SchoolClassSummaryRow {
  id: string;
  class_name: string;
  section?: string | null;
  total?: number | string | null;
  present?: number | string | null;
}

export interface SchoolAnnouncementRow {
  id: string;
  title: string;
  body: string;
  audience?: string | null;
  target_classes?: string[] | null;
  target_roles?: string[] | null;
  send_whatsapp?: boolean;
  is_pinned?: boolean;
  expires_at?: string | null;
  created_by_name?: string | null;
  published_at: string;
  sent_count?: number | string | null;
}

export interface SchoolOnboarding {
  completed?: number;
  total?: number;
  isComplete?: boolean;
  checks?: Record<string, boolean>;
}

export interface SchoolOverviewData {
  school: SchoolProfileData;
  stats: SchoolOverviewStats;
  feeStats: SchoolFeeStats;
  classSummary: SchoolClassSummaryRow[];
  announcements: SchoolAnnouncementRow[];
  onboarding: SchoolOnboarding;
}

export interface SchoolClassRow {
  id: string;
  class_name: string;
  section: string;
  academic_year?: string | null;
  room_number?: string | null;
  is_active: boolean;
  student_count?: number | string | null;
  teacher_count?: number | string | null;
}

export interface SchoolSubjectRow {
  id?: string;
  code: string;
  name: string;
  name_hi?: string | null;
  color_hex?: string | null;
  board?: string | null;
}

export interface TeacherAssignmentRow {
  id?: string;
  classId: string;
  className?: string | null;
  section?: string | null;
  subjectCode: string;
  isClassTeacher: boolean;
}

export interface SchoolTeacherRow {
  id: string;
  employee_id?: string | null;
  designation?: string | null;
  qualification?: string | null;
  experience_yrs?: number | null;
  employment_type?: string | null;
  status: string;
  joined_date?: string | null;
  name: string;
  username?: string | null;
  email?: string | null;
  mobile: string;
  assignments?: TeacherAssignmentRow[];
  temporaryPassword?: string | null;
}

export interface SchoolStudentListRow {
  id: string;
  student_code: string;
  roll_number?: string | null;
  name: string;
  username?: string | null;
  mobile: string;
  email?: string | null;
  class_id?: string | null;
  class_name?: string | null;
  section?: string | null;
  grade_level?: string | null;
  status?: string | null;
  attendance_pct?: number | string | null;
  fee_status?: string | null;
}

export interface StudentParentRow {
  id: string;
  name?: string | null;
  relation?: string | null;
  mobile?: string | null;
  email?: string | null;
}

export interface SchoolStudentDetail extends SchoolStudentListRow {
  date_of_birth?: string | null;
  gender?: string | null;
  language?: string | null;
  school_link_status?: string | null;
  parents?: StudentParentRow[];
  attendance?: Array<{ percentage?: number | string | null }>;
}

export interface CreatedSchoolStudent extends SchoolStudentDetail {
  temporaryPassword?: string | null;
}

export interface EnrollmentRequestRow {
  id: string;
  status: string;
  name: string;
  student_code: string;
  username?: string | null;
  mobile?: string | null;
  email?: string | null;
  requested_grade: string;
  requested_class_id?: string | null;
  class_name?: string | null;
  section?: string | null;
  parent_linked?: boolean;
  parent_link_pending?: boolean;
  student_note?: string | null;
  requested_at: string;
}

export interface AttendanceRosterRow {
  id: string;
  student_code: string;
  roll_number?: string | null;
  name: string;
  attendance_status?: string | null;
  remark?: string | null;
}

export interface AttendanceSummaryRow {
  id: string;
  class_name: string;
  section?: string | null;
  total_students: number | string;
  present: number | string;
  absent: number | string;
  late: number | string;
  half_day: number | string;
  holiday?: number | string;
}

export interface AttendanceSaveResponse {
  marked: number;
  records: Array<{ id: string; student_id: string; status: string }>;
}

export interface FeeInvoiceRow {
  id: string;
  student_id?: string;
  student_code: string;
  name: string;
  class_name?: string | null;
  section?: string | null;
  term: number | string;
  invoice_number?: string | null;
  amount_due: number | string;
  amount_paid: number | string;
  amount_waived?: number | string;
  outstanding: number | string;
  status: string;
  due_date?: string | null;
}

export interface FeeOverviewData {
  academicYear: string;
  summary: Record<string, number> & { amountDue?: number; collected?: number; outstanding?: number };
  invoices: FeeInvoiceRow[];
}

export interface FeeStructureRow {
  id: string;
  class_name: string;
  term: number | string;
  fee_head: string;
  amount: number | string;
  due_date?: string | null;
  is_optional?: boolean;
}

export interface FeeStructuresData {
  academicYear: string;
  structures: FeeStructureRow[];
}

export interface FeeReceiptData {
  receiptNumber?: string | null;
  payment?: {
    amount?: number | string | null;
    mode?: string | null;
    reference?: string | null;
    paid_at?: string | null;
  };
}

export interface GenerateInvoicesResponse { created: number; }
export interface FeeReminderResponse { sent: number; }
export interface ParentLinkResponse { status?: string; }

export interface TimetableRow {
  id?: string;
  day: string;
  period_number: number;
  start_time: string;
  end_time: string;
  subject_code?: string | null;
  teacher_id?: string | null;
  room_number?: string | null;
  is_break: boolean;
  break_label?: string | null;
  subject?: string | null;
  teacher_name?: string | null;
}

export interface TimetableInputRow {
  day: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subjectCode: string | null;
  teacherId: string | null;
  roomNumber?: string;
  isBreak: boolean;
  breakLabel?: string;
}

export interface SchoolExamRow {
  id: string;
  title: string;
  status: string;
  start_time: string;
  end_time?: string | null;
  class_names?: string[] | null;
  subject_codes?: string[] | null;
  total_questions?: number | null;
  question_count?: number | null;
  scored_attempts?: number | null;
  marks_per_question?: number | string | null;
}

export interface SchoolResultSummaryRow {
  exam_id: string;
  exam_name: string;
  class_name?: string | null;
  section?: string | null;
  avg_score?: number | string | null;
  pass_count?: number | string | null;
  total_attempts?: number | string | null;
}

export interface SchoolResultStudentRow {
  student_id: string;
  student_code: string;
  roll_number?: string | null;
  name: string;
  class_name?: string | null;
  section?: string | null;
  total_marks?: number | string | null;
  percentage?: number | string | null;
  correct_count?: number | null;
  wrong_count?: number | null;
  skipped_count?: number | null;
  rank_school?: number | null;
  submitted_at?: string | null;
}

export interface SchoolResultDetail {
  exam: SchoolExamRow;
  students: SchoolResultStudentRow[];
}

export const getSchoolProfile = () => api.get<ApiEnvelope<SchoolProfileData>>('/school/profile');
export const updateSchoolProfile = (data: SchoolPayload) => api.patch<ApiEnvelope<SchoolProfileData>>('/school/profile', data);
export const getOverview = () => api.get<ApiEnvelope<SchoolOverviewData>>('/school/overview');

export const getStudents = (params: SchoolQueryParams = {}) => api.get<ApiListResponse<SchoolStudentListRow>>('/school/students', { params });
export const addStudent = (data: SchoolPayload) => api.post<ApiEnvelope<CreatedSchoolStudent>>('/school/students', data);
export const bulkAddStudents = (students: readonly SchoolPayload[]) => api.post<ApiEnvelope<{ created: CreatedSchoolStudent[] }>>('/school/students/bulk', { students });
export const getStudentDetail = (studentId: string) => api.get<ApiEnvelope<SchoolStudentDetail>>(`/school/students/${studentId}`);
export const updateStudent = (studentId: string, data: SchoolPayload) => api.patch<ApiEnvelope<SchoolStudentDetail>>(`/school/students/${studentId}`, data);
export const linkStudentParent = (studentId: string, data: SchoolPayload) => api.post<ApiEnvelope<ParentLinkResponse>>(`/school/students/${studentId}/parent-link`, data);
export const getEnrollmentRequests = (status = 'PENDING') => api.get<ApiEnvelope<EnrollmentRequestRow[]>>('/school/enrollment-requests', { params: { status } });
export const reviewEnrollmentRequest = (requestId: string, data: SchoolPayload) => api.patch<ApiEnvelope<EnrollmentRequestRow>>(`/school/enrollment-requests/${requestId}`, data);

export const getClasses = (includeInactive = false) => api.get<ApiEnvelope<SchoolClassRow[]>>('/school/classes', { params: { includeInactive } });
export const createClass = (data: SchoolPayload) => api.post<ApiEnvelope<SchoolClassRow>>('/school/classes', data);
export const updateClass = (classId: string, data: SchoolPayload) => api.patch<ApiEnvelope<SchoolClassRow>>(`/school/classes/${classId}`, data);
export const archiveClass = (classId: string) => api.delete<ApiEnvelope<SchoolClassRow>>(`/school/classes/${classId}`);
export const getSubjects = () => api.get<ApiEnvelope<SchoolSubjectRow[]>>('/school/subjects');

export const getTeachers = () => api.get<ApiEnvelope<SchoolTeacherRow[]>>('/school/teachers');
export const addTeacher = (data: SchoolPayload) => api.post<ApiEnvelope<SchoolTeacherRow>>('/school/teachers', data);
export const updateTeacher = (teacherId: string, data: SchoolPayload) => api.patch<ApiEnvelope<SchoolTeacherRow>>(`/school/teachers/${teacherId}`, data);
export const deactivateTeacher = (teacherId: string) => api.delete<ApiEnvelope<SchoolTeacherRow>>(`/school/teachers/${teacherId}`);

export const getAttendanceRoster = (classId: string, date: string) => api.get<ApiEnvelope<AttendanceRosterRow[]>>('/school/attendance/roster', { params: { classId, date } });
export const markAttendance = (data: SchoolPayload) => api.post<ApiEnvelope<AttendanceSaveResponse>>('/school/attendance', data);
export const getAttendanceSummary = (date: string) => api.get<ApiEnvelope<AttendanceSummaryRow[]>>('/school/attendance', { params: { date } });

export const getFeeOverview = (year?: string | number) => api.get<ApiEnvelope<FeeOverviewData>>('/school/fees', { params: { year } });
export const getFeeStructures = (year?: string | number) => api.get<ApiEnvelope<FeeStructuresData>>('/school/fees/structures', { params: { year } });
export const saveFeeStructure = (data: SchoolPayload) => api.put<ApiEnvelope<FeeStructureRow>>('/school/fees/structures', data);
export const generateFeeInvoices = (data: SchoolPayload) => api.post<ApiEnvelope<GenerateInvoicesResponse>>('/school/fees/generate', data);
export const recordPayment = (data: SchoolPayload) => api.post<ApiEnvelope<FeeReceiptData>>('/school/fees/payment', data);
export const getFeePayments = (invoiceId: string) => api.get<ApiEnvelope<FeeReceiptData[]>>('/school/fees/payments', { params: { invoiceId } });
export const sendFeeReminders = () => api.post<ApiEnvelope<FeeReminderResponse>>('/school/fees/reminders');

export const getTimetable = (classId: string) => api.get<ApiEnvelope<TimetableRow[]>>(`/school/timetable/${classId}`);
export const saveTimetable = (classId: string, periods: readonly TimetableInputRow[]) => api.put<ApiEnvelope<TimetableRow[]>>(`/school/timetable/${classId}`, { periods });

export const getSchoolExams = () => api.get<ApiEnvelope<SchoolExamRow[]>>('/school/exams');
export const getSchoolExam = (examId: string) => api.get<ApiEnvelope<SchoolExamRow>>(`/school/exams/${examId}`);
export const createSchoolExam = (data: SchoolPayload) => api.post<ApiEnvelope<SchoolExamRow>>('/school/exams', data);
export const addSchoolExamQuestions = (examId: string, questions: readonly SchoolPayload[]) => api.post<ApiEnvelope<SchoolExamRow>>(`/school/exams/${examId}/questions`, { questions });
export const updateSchoolExamStatus = (examId: string, status: string) => api.patch<ApiEnvelope<SchoolExamRow>>(`/school/exams/${examId}/status`, { status });
export const getResults = () => api.get<ApiEnvelope<SchoolResultSummaryRow[]>>('/school/results');
export const getResultDetail = (examId: string) => api.get<ApiEnvelope<SchoolResultDetail>>(`/school/results/${examId}`);

export const getAnnouncements = () => api.get<ApiEnvelope<SchoolAnnouncementRow[]>>('/school/announcements');
export const publishAnnouncement = (data: SchoolPayload) => api.post<ApiEnvelope<SchoolAnnouncementRow>>('/school/announcements', data);
