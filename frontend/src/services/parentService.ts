import api from './api';

export const getChildren = () => api.get('/parent/children');
export const getChildDashboard = (id: string) => api.get(`/parent/children/${id}/dashboard`);
export const getChildAttendance = (id: string, year: string | number, month: string | number) =>
  api.get(`/parent/children/${id}/attendance?year=${year}&month=${month}`);
export const getChildFees = (id: string) => api.get(`/parent/children/${id}/fees`);
export const getMessages = (id: string) => api.get(`/parent/children/${id}/messages`);
export const sendMessage = (id: string, body: string) => api.post(`/parent/children/${id}/messages`, { body });
export const getNotifications = () => api.get('/parent/notifications');
