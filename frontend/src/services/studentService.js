// services/studentService.js
import api from './api';

export const getDashboard = () => api.get('/student/dashboard');
export const getAttendance = (year, month) => api.get(`/student/attendance/${year}/${month}`);
export const getBadges = () => api.get('/student/badges');
export const getLeaderboard = (scope = 'class') => api.get(`/student/leaderboard?scope=${scope}`);
export const getReportCard = (term, year) => api.get('/student/report-card', { params: { term, year } });
export const markContentComplete = (itemId) => api.post(`/student/content/${itemId}/complete`);
export const getNotifications = () => api.get('/student/notifications');
export const markNotifRead = (id) => api.patch(`/student/notifications/${id}/read`);
export const getOfflineDownloads = () => api.get('/student/offline-downloads');
export const removeOfflineDownload = (contentItemId) => api.delete(`/student/offline-downloads/${contentItemId}`);
