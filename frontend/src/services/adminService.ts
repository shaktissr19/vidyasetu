import api from './api';
import type {
  AdminAnalytics,
  AdminRevenue,
  AdminSchool,
  AdminUser,
  ApiEnvelope,
  ApiListResponse,
  PlatformConfigItem,
  SupportTicket,
} from '@/types/api';

export type AdminQueryParams = Record<string, string | number | boolean | null | undefined>;
type Payload = Record<string, unknown>;

export const getAnalytics = () => api.get<ApiEnvelope<AdminAnalytics>>('/admin/analytics');
export const listSchools = (params: AdminQueryParams = {}) => api.get<ApiListResponse<AdminSchool>>('/admin/schools', { params });
export const getSchool = (id: string) => api.get<ApiEnvelope<AdminSchool>>(`/admin/schools/${id}`);
export const updateSchoolStatus = (id: string, status: string) => api.patch<ApiEnvelope<AdminSchool>>(`/admin/schools/${id}/status`, { status });
export const listUsers = (params: AdminQueryParams = {}) => api.get<ApiListResponse<AdminUser>>('/admin/users', { params });
export const updateUserStatus = (id: string, status: string) => api.patch<ApiEnvelope<AdminUser>>(`/admin/users/${id}/status`, { status });
export const getTickets = (params: AdminQueryParams = {}) => api.get<ApiEnvelope<SupportTicket[]>>('/admin/support', { params });
export const updateTicket = (id: string, body: Payload) => api.patch<ApiEnvelope<SupportTicket>>(`/admin/support/${id}`, body);
export const getConfig = () => api.get<ApiEnvelope<PlatformConfigItem[]>>('/admin/config');
export const updateConfig = (key: string, value: unknown) => api.patch<ApiEnvelope<PlatformConfigItem>>('/admin/config', { key, value });
export const getRevenue = (params: AdminQueryParams = {}) => api.get<ApiEnvelope<AdminRevenue>>('/admin/revenue', { params });
export const listCompetitions = () => api.get<ApiEnvelope<unknown[]>>('/admin/competitions');
export const createExam = (body: Payload) => api.post<ApiEnvelope<unknown>>('/admin/competitions', body);
