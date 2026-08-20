import api from './api';

export type SchoolQueryParams = Record<string, string | number | boolean | null | undefined>;

export const getSchoolProfile = () => api.get('/school/profile');
export const updateSchoolProfile = <T extends object>(data: T) => api.patch('/school/profile', data);
export const getOverview = () => api.get('/school/overview');

export const getStudents = (params: SchoolQueryParams = {}) => api.get('/school/students', { params });
export const addStudent = <T extends object>(data: T) => api.post('/school/students', data);
export const bulkAddStudents = <T extends object>(students: readonly T[]) => api.post('/school/students/bulk', { students });
export const getStudentDetail = (studentId: string) => api.get(`/school/students/${studentId}`);
export const updateStudent = <T extends object>(studentId: string, data: T) => api.patch(`/school/students/${studentId}`, data);
export const linkStudentParent = <T extends object>(studentId: string, data: T) => api.post(`/school/students/${studentId}/parent-link`, data);
export const getEnrollmentRequests = (status = 'PENDING') => api.get('/school/enrollment-requests', { params: { status } });
export const reviewEnrollmentRequest = <T extends object>(requestId: string, data: T) => api.patch(`/school/enrollment-requests/${requestId}`, data);

export const getClasses = (includeInactive = false) => api.get('/school/classes', { params: { includeInactive } });
export const createClass = <T extends object>(data: T) => api.post('/school/classes', data);
export const updateClass = <T extends object>(classId: string, data: T) => api.patch(`/school/classes/${classId}`, data);
export const archiveClass = (classId: string) => api.delete(`/school/classes/${classId}`);
export const getSubjects = () => api.get('/school/subjects');

export const getTeachers = () => api.get('/school/teachers');
export const addTeacher = <T extends object>(data: T) => api.post('/school/teachers', data);
export const updateTeacher = <T extends object>(teacherId: string, data: T) => api.patch(`/school/teachers/${teacherId}`, data);
export const deactivateTeacher = (teacherId: string) => api.delete(`/school/teachers/${teacherId}`);

export const getAttendanceRoster = (classId: string, date: string) => api.get('/school/attendance/roster', { params: { classId, date } });
export const markAttendance = <T extends object>(data: T) => api.post('/school/attendance', data);
export const getAttendanceSummary = (date: string) => api.get('/school/attendance', { params: { date } });

export const getFeeOverview = (year?: string | number) => api.get('/school/fees', { params: { year } });
export const getFeeStructures = (year?: string | number) => api.get('/school/fees/structures', { params: { year } });
export const saveFeeStructure = <T extends object>(data: T) => api.put('/school/fees/structures', data);
export const generateFeeInvoices = <T extends object>(data: T) => api.post('/school/fees/generate', data);
export const recordPayment = <T extends object>(data: T) => api.post('/school/fees/payment', data);
export const getFeePayments = (invoiceId: string) => api.get('/school/fees/payments', { params: { invoiceId } });
export const sendFeeReminders = () => api.post('/school/fees/reminders');

export const getTimetable = (classId: string) => api.get(`/school/timetable/${classId}`);
export const saveTimetable = <T extends object>(classId: string, periods: readonly T[]) => api.put(`/school/timetable/${classId}`, { periods });

export const getSchoolExams = () => api.get('/school/exams');
export const getSchoolExam = (examId: string) => api.get(`/school/exams/${examId}`);
export const createSchoolExam = <T extends object>(data: T) => api.post('/school/exams', data);
export const addSchoolExamQuestions = <T extends object>(examId: string, questions: readonly T[]) => api.post(`/school/exams/${examId}/questions`, { questions });
export const updateSchoolExamStatus = (examId: string, status: string) => api.patch(`/school/exams/${examId}/status`, { status });
export const getResults = () => api.get('/school/results');
export const getResultDetail = (examId: string) => api.get(`/school/results/${examId}`);

export const getAnnouncements = () => api.get('/school/announcements');
export const publishAnnouncement = <T extends object>(data: T) => api.post('/school/announcements', data);
