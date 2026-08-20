import api from './api';

type Payload = Record<string, unknown>;

export const getProfileStatus = () => api.get('/student/profile/status');
export const getProfileSetupOptions = () => api.get('/student/profile/setup-options');
export const completeStudentProfile = (payload: Payload) => api.post('/student/profile/complete', payload);

export const getDashboard = () => api.get('/student/dashboard');
export const getAttendance = (year: string | number, month: string | number) => api.get(`/student/attendance/${year}/${month}`);
export const getBadges = () => api.get('/student/badges');
export const getLeaderboard = (scope = 'class') => api.get(`/student/leaderboard?scope=${scope}`);
export const getReportCard = (term?: string | null, year?: string | number | null) => api.get('/student/report-card', { params: { term, year } });
export const markContentComplete = (itemId: string) => api.post(`/student/content/${itemId}/complete`);
export const getNotifications = () => api.get('/student/notifications');
export const markNotifRead = (id: string) => api.patch(`/student/notifications/${id}/read`);
export const getOfflineDownloads = () => api.get('/student/offline-downloads');
export const removeOfflineDownload = (contentItemId: string) => api.delete(`/student/offline-downloads/${contentItemId}`);
