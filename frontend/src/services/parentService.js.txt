// services/parentService.js
import api from './api';

export const getChildren          = ()                           => api.get('/parent/children');
export const getChildDashboard    = (id)                         => api.get(`/parent/children/${id}/dashboard`);
export const getChildAttendance   = (id, y, m)                   => api.get(`/parent/children/${id}/attendance?year=${y}&month=${m}`);
export const getChildFees         = (id)                         => api.get(`/parent/children/${id}/fees`);
export const getMessages          = (id)                         => api.get(`/parent/children/${id}/messages`);
export const sendMessage          = (id, body)                   => api.post(`/parent/children/${id}/messages`, { body });
export const getNotifications     = ()                           => api.get('/parent/notifications');
