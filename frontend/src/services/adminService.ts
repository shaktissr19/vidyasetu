import api from './api';

export type AdminQueryParams = Record<string, string | number | boolean | null | undefined>;
type Payload = Record<string, unknown>;

export const getAnalytics = () => api.get('/admin/analytics');
export const listSchools = (params: AdminQueryParams = {}) => api.get('/admin/schools', { params });
export const getSchool = (id: string) => api.get(`/admin/schools/${id}`);
export const updateSchoolStatus = (id: string, status: string) => api.patch(`/admin/schools/${id}/status`, { status });
export const listUsers = (params: AdminQueryParams = {}) => api.get('/admin/users', { params });
export const updateUserStatus = (id: string, status: string) => api.patch(`/admin/users/${id}/status`, { status });
export const getTickets = (params: AdminQueryParams = {}) => api.get('/admin/support', { params });
export const updateTicket = (id: string, body: Payload) => api.patch(`/admin/support/${id}`, body);
export const getConfig = () => api.get('/admin/config');
export const updateConfig = (key: string, value: unknown) => api.patch('/admin/config', { key, value });
export const getRevenue = (params: AdminQueryParams = {}) => api.get('/admin/revenue', { params });
export const listCompetitions = () => api.get('/admin/competitions');
export const createExam = (body: Payload) => api.post('/admin/competitions', body);
