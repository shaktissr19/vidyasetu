// services/schoolService.js
import api from './api';

export const getSchoolProfile       = ()                         => api.get('/school/profile');
export const updateSchoolProfile    = (data)                     => api.patch('/school/profile', data);
export const getOverview            = ()                         => api.get('/school/overview');

export const getStudents            = (params)                   => api.get('/school/students', { params });
export const addStudent             = (data)                     => api.post('/school/students', data);
export const bulkAddStudents        = (students)                 => api.post('/school/students/bulk', { students });
export const getStudentDetail       = (studentId)                => api.get(`/school/students/${studentId}`);
export const updateStudent          = (studentId, data)          => api.patch(`/school/students/${studentId}`, data);
export const linkStudentParent      = (studentId, data)          => api.post(`/school/students/${studentId}/parent-link`, data);
export const getEnrollmentRequests  = (status = 'PENDING')       => api.get('/school/enrollment-requests', { params: { status } });
export const reviewEnrollmentRequest = (requestId, data)         => api.patch(`/school/enrollment-requests/${requestId}`, data);

export const getClasses             = (includeInactive = false)  => api.get('/school/classes', { params: { includeInactive } });
export const createClass            = (data)                     => api.post('/school/classes', data);
export const updateClass            = (classId, data)            => api.patch(`/school/classes/${classId}`, data);
export const archiveClass           = (classId)                  => api.delete(`/school/classes/${classId}`);
export const getSubjects            = ()                         => api.get('/school/subjects');

export const getTeachers            = ()                         => api.get('/school/teachers');
export const addTeacher             = (data)                     => api.post('/school/teachers', data);
export const updateTeacher          = (teacherId, data)          => api.patch(`/school/teachers/${teacherId}`, data);
export const deactivateTeacher      = (teacherId)                => api.delete(`/school/teachers/${teacherId}`);

export const getAttendanceRoster    = (classId, date)            => api.get('/school/attendance/roster', { params: { classId, date } });
export const markAttendance         = (data)                     => api.post('/school/attendance', data);
export const getAttendanceSummary   = (date)                     => api.get('/school/attendance', { params: { date } });

export const getFeeOverview         = (year)                     => api.get('/school/fees', { params: { year } });
export const getFeeStructures       = (year)                     => api.get('/school/fees/structures', { params: { year } });
export const saveFeeStructure       = (data)                     => api.put('/school/fees/structures', data);
export const generateFeeInvoices    = (data)                     => api.post('/school/fees/generate', data);
export const recordPayment          = (data)                     => api.post('/school/fees/payment', data);
export const getFeePayments         = (invoiceId)                => api.get('/school/fees/payments', { params: { invoiceId } });
export const sendFeeReminders       = ()                         => api.post('/school/fees/reminders');

export const getTimetable           = (classId)                  => api.get(`/school/timetable/${classId}`);
export const saveTimetable          = (classId, periods)         => api.put(`/school/timetable/${classId}`, { periods });

export const getSchoolExams         = ()                         => api.get('/school/exams');
export const getSchoolExam          = (examId)                   => api.get(`/school/exams/${examId}`);
export const createSchoolExam       = (data)                     => api.post('/school/exams', data);
export const addSchoolExamQuestions = (examId, questions)        => api.post(`/school/exams/${examId}/questions`, { questions });
export const updateSchoolExamStatus = (examId, status)           => api.patch(`/school/exams/${examId}/status`, { status });
export const getResults             = ()                         => api.get('/school/results');
export const getResultDetail        = (examId)                   => api.get(`/school/results/${examId}`);

export const getAnnouncements       = ()                         => api.get('/school/announcements');
export const publishAnnouncement    = (data)                     => api.post('/school/announcements', data);
