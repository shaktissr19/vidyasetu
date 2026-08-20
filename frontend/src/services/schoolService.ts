import api from './api';
import type {
  ApiEnvelope,
  ApiListResponse,
  AttendanceRecord,
  AttendanceSummary,
  EnrollmentRequest,
  FeeOverview,
  FeePaymentReceipt,
  FeeStructureRow,
  SchoolAnnouncement,
  SchoolClass,
  SchoolExam,
  SchoolOverview,
  SchoolProfile,
  SchoolResultRow,
  SchoolStudent,
  SchoolSubject,
  SchoolTeacher,
  TimetablePeriod,
} from '@/types/api';

export type SchoolQueryParams = Record<string, string | number | boolean | null | undefined>;
type Payload = Record<string, unknown>;

export const getSchoolProfile = () => api.get<ApiEnvelope<SchoolProfile>>('/school/profile');
export const updateSchoolProfile = (data: Payload) => api.patch<ApiEnvelope<SchoolProfile>>('/school/profile', data);
export const getOverview = () => api.get<ApiEnvelope<SchoolOverview>>('/school/overview');

export const getStudents = (params: SchoolQueryParams = {}) => api.get<ApiListResponse<SchoolStudent>>('/school/students', { params });
export const addStudent = (data: Payload) => api.post<ApiEnvelope<SchoolStudent>>('/school/students', data);
export const bulkAddStudents = (students: readonly Payload[]) => api.post<ApiEnvelope<{ created?: number; students?: SchoolStudent[] }>>('/school/students/bulk', { students });
export const getStudentDetail = (studentId: string) => api.get<ApiEnvelope<SchoolStudent>>(`/school/students/${studentId}`);
export const updateStudent = (studentId: string, data: Payload) => api.patch<ApiEnvelope<SchoolStudent>>(`/school/students/${studentId}`, data);
export const linkStudentParent = (studentId: string, data: Payload) => api.post<ApiEnvelope<Record<string, unknown>>>(`/school/students/${studentId}/parent-link`, data);
export const getEnrollmentRequests = (status = 'PENDING') => api.get<ApiEnvelope<EnrollmentRequest[]>>('/school/enrollment-requests', { params: { status } });
export const reviewEnrollmentRequest = (requestId: string, data: Payload) => api.patch<ApiEnvelope<EnrollmentRequest>>(`/school/enrollment-requests/${requestId}`, data);

export const getClasses = (includeInactive = false) => api.get<ApiEnvelope<SchoolClass[]>>('/school/classes', { params: { includeInactive } });
export const createClass = (data: Payload) => api.post<ApiEnvelope<SchoolClass>>('/school/classes', data);
export const updateClass = (classId: string, data: Payload) => api.patch<ApiEnvelope<SchoolClass>>(`/school/classes/${classId}`, data);
export const archiveClass = (classId: string) => api.delete<ApiEnvelope<{ id?: string }>>(`/school/classes/${classId}`);
export const getSubjects = () => api.get<ApiEnvelope<SchoolSubject[]>>('/school/subjects');

export const getTeachers = () => api.get<ApiEnvelope<SchoolTeacher[]>>('/school/teachers');
export const addTeacher = (data: Payload) => api.post<ApiEnvelope<SchoolTeacher & { username?: string; password?: string }>>('/school/teachers', data);
export const updateTeacher = (teacherId: string, data: Payload) => api.patch<ApiEnvelope<SchoolTeacher>>(`/school/teachers/${teacherId}`, data);
export const deactivateTeacher = (teacherId: string) => api.delete<ApiEnvelope<{ id?: string }>>(`/school/teachers/${teacherId}`);

export const getAttendanceRoster = (classId: string, date: string) => api.get<ApiEnvelope<AttendanceRecord[]>>('/school/attendance/roster', { params: { classId, date } });
export const markAttendance = (data: Payload) => api.post<ApiEnvelope<AttendanceSummary>>('/school/attendance', data);
export const getAttendanceSummary = (date: string) => api.get<ApiEnvelope<AttendanceSummary>>('/school/attendance', { params: { date } });

export const getFeeOverview = (year?: string | number) => api.get<ApiEnvelope<FeeOverview>>('/school/fees', { params: { year } });
export const getFeeStructures = (year?: string | number) => api.get<ApiEnvelope<FeeStructureRow[]>>('/school/fees/structures', { params: { year } });
export const saveFeeStructure = (data: Payload) => api.put<ApiEnvelope<FeeStructureRow[]>>('/school/fees/structures', data);
export const generateFeeInvoices = (data: Payload) => api.post<ApiEnvelope<FeeOverview>>('/school/fees/generate', data);
export const recordPayment = (data: Payload) => api.post<ApiEnvelope<FeePaymentReceipt>>('/school/fees/payment', data);
export const getFeePayments = (invoiceId: string) => api.get<ApiEnvelope<FeePaymentReceipt[]>>('/school/fees/payments', { params: { invoiceId } });
export const sendFeeReminders = () => api.post<ApiEnvelope<{ sent?: number }>>('/school/fees/reminders');

export const getTimetable = (classId: string) => api.get<ApiEnvelope<TimetablePeriod[]>>(`/school/timetable/${classId}`);
export const saveTimetable = (classId: string, periods: readonly Payload[]) => api.put<ApiEnvelope<TimetablePeriod[]>>(`/school/timetable/${classId}`, { periods });

export const getSchoolExams = () => api.get<ApiEnvelope<SchoolExam[]>>('/school/exams');
export const getSchoolExam = (examId: string) => api.get<ApiEnvelope<SchoolExam>>(`/school/exams/${examId}`);
export const createSchoolExam = (data: Payload) => api.post<ApiEnvelope<SchoolExam>>('/school/exams', data);
export const addSchoolExamQuestions = (examId: string, questions: readonly Payload[]) => api.post<ApiEnvelope<SchoolExam>>(`/school/exams/${examId}/questions`, { questions });
export const updateSchoolExamStatus = (examId: string, status: string) => api.patch<ApiEnvelope<SchoolExam>>(`/school/exams/${examId}/status`, { status });
export const getResults = () => api.get<ApiEnvelope<SchoolResultRow[]>>('/school/results');
export const getResultDetail = (examId: string) => api.get<ApiEnvelope<SchoolResultRow[]>>(`/school/results/${examId}`);

export const getAnnouncements = () => api.get<ApiEnvelope<SchoolAnnouncement[]>>('/school/announcements');
export const publishAnnouncement = (data: Payload) => api.post<ApiEnvelope<SchoolAnnouncement>>('/school/announcements', data);
