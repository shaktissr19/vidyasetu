import api from './api';

export const getAnalytics     = ()              => api.get('/admin/analytics');
export const listSchools      = (params)        => api.get('/admin/schools', { params });
export const getSchool        = (id)            => api.get(`/admin/schools/${id}`);
export const updateSchoolStatus = (id, status)  => api.patch(`/admin/schools/${id}/status`, { status });
export const listUsers        = (params)        => api.get('/admin/users', { params });
export const updateUserStatus = (id, status)    => api.patch(`/admin/users/${id}/status`, { status });
export const getTickets       = (params)        => api.get('/admin/support', { params });
export const updateTicket     = (id, body)      => api.patch(`/admin/support/${id}`, body);
export const getConfig        = ()              => api.get('/admin/config');
export const updateConfig     = (key, value)    => api.patch('/admin/config', { key, value });
export const getRevenue       = (params)        => api.get('/admin/revenue', { params });
export const listCompetitions = ()              => api.get('/admin/competitions');
export const createExam       = (body)          => api.post('/admin/competitions', body);
