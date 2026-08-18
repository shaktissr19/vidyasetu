// services/schoolService.js
import api from './api';

export const getOverview          = ()                         => api.get('/school/overview');
export const getStudents          = (params)                   => api.get('/school/students', { params });
export const addStudent           = (data)                     => api.post('/school/students', data);
export const getEnrollmentRequests = (status = 'PENDING')      => api.get('/school/enrollment-requests', { params: { status } });
export const reviewEnrollmentRequest = (requestId, data)       => api.patch(`/school/enrollment-requests/${requestId}`, data);
export const markAttendance       = (data)                     => api.post('/school/attendance', data);
export const getAttendanceSummary = (date)                     => api.get('/school/attendance', { params: { date } });
export const getFeeOverview       = (year)                     => api.get('/school/fees', { params: { year } });
export const recordPayment        = (data)                     => api.post('/school/fees/payment', data);
export const sendFeeReminders     = ()                         => api.post('/school/fees/reminders');
export const getTimetable         = (classId)                  => api.get(`/school/timetable/${classId}`);
export const saveTimetable        = (classId, periods)         => api.put(`/school/timetable/${classId}`, { periods });
export const getResults           = ()                         => api.get('/school/results');
export const getAnnouncements     = ()                         => api.get('/school/announcements');
export const publishAnnouncement  = (data)                     => api.post('/school/announcements', data);
export const getTeachers          = ()                         => api.get('/school/teachers');
export const getClasses           = ()                         => api.get('/school/classes');
