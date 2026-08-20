import api from './api';
import type {
  ApiEnvelope,
  AttendanceSummary,
  LeaderboardRow,
  OfflineDownload,
  ParentNotification,
  ReportCardData,
  StudentBadge,
  StudentDashboard,
  StudentProfile,
} from '@/types/api';

type Payload = Record<string, unknown>;

export const getProfileStatus = () => api.get<ApiEnvelope<{ complete?: boolean; profileComplete?: boolean; student?: StudentProfile }>>('/student/profile/status');
export const getProfileSetupOptions = () => api.get<ApiEnvelope<Record<string, unknown>>>('/student/profile/setup-options');
export const completeStudentProfile = (payload: Payload) => api.post<ApiEnvelope<StudentProfile>>('/student/profile/complete', payload);

export const getDashboard = () => api.get<ApiEnvelope<StudentDashboard>>('/student/dashboard');
export const getAttendance = (year: string | number, month: string | number) => api.get<ApiEnvelope<AttendanceSummary>>(`/student/attendance/${year}/${month}`);
export const getBadges = () => api.get<ApiEnvelope<StudentBadge[]>>('/student/badges');
export const getLeaderboard = (scope = 'class') => api.get<ApiEnvelope<LeaderboardRow[]>>(`/student/leaderboard?scope=${scope}`);
export const getReportCard = (term?: string | null, year?: string | number | null) => api.get<ApiEnvelope<ReportCardData>>('/student/report-card', { params: { term, year } });
export const markContentComplete = (itemId: string) => api.post<ApiEnvelope<{ completed?: boolean }>>(`/student/content/${itemId}/complete`);
export const getNotifications = () => api.get<ApiEnvelope<ParentNotification[]>>('/student/notifications');
export const markNotifRead = (id: string) => api.patch<ApiEnvelope<{ id: string; is_read?: boolean }>>(`/student/notifications/${id}/read`);
export const getOfflineDownloads = () => api.get<ApiEnvelope<OfflineDownload[]>>('/student/offline-downloads');
export const removeOfflineDownload = (contentItemId: string) => api.delete<ApiEnvelope<{ removed?: boolean }>>(`/student/offline-downloads/${contentItemId}`);
