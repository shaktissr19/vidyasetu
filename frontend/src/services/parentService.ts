import api from './api';
import type {
  ApiEnvelope,
  AttendanceSummary,
  ParentChild,
  ParentDashboard,
  ParentFee,
  ParentMessage,
  ParentNotification,
} from '@/types/api';

export const getChildren = () => api.get<ApiEnvelope<ParentChild[]>>('/parent/children');
export const getChildDashboard = (id: string) => api.get<ApiEnvelope<ParentDashboard>>(`/parent/children/${id}/dashboard`);
export const getChildAttendance = (id: string, year: string | number, month: string | number) =>
  api.get<ApiEnvelope<AttendanceSummary>>(`/parent/children/${id}/attendance?year=${year}&month=${month}`);
export const getChildFees = (id: string) => api.get<ApiEnvelope<ParentFee[]>>(`/parent/children/${id}/fees`);
export const getMessages = (id: string) => api.get<ApiEnvelope<ParentMessage[]>>(`/parent/children/${id}/messages`);
export const sendMessage = (id: string, body: string) => api.post<ApiEnvelope<ParentMessage>>(`/parent/children/${id}/messages`, { body });
export const getNotifications = () => api.get<ApiEnvelope<ParentNotification[]>>('/parent/notifications');
