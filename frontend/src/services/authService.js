// services/authService.js
import api from './api';

export const loginWithPassword = (identifier, password, deviceInfo) =>
  api.post('/auth/login', { identifier, password, deviceInfo });

export const getStudentRegistrationOptions = () => api.get('/auth/student-registration-options');
export const registerStudent = (data) => api.post('/auth/register/student', data);

export const sendOTP = (mobile) => api.post('/auth/send-otp', { mobile });
export const verifyOTP = (mobile, otp, dev) => api.post('/auth/verify-otp', { mobile, otp, deviceInfo: dev });

export const forgotPassword = (identifier) => api.post('/auth/forgot-password', { identifier });
export const resetPassword = (identifier, otp, newPassword) =>
  api.post('/auth/reset-password', { identifier, otp, newPassword });
export const setPassword = (currentPassword, newPassword) =>
  api.post('/auth/set-password', { currentPassword, newPassword });

export const refreshToken = (refreshToken) => api.post('/auth/refresh', { refreshToken });
export const logout = (refreshToken) => api.post('/auth/logout', { refreshToken });
export const updateProfile = (data) => api.patch('/auth/profile', data);
export const getMe = () => api.get('/auth/me');
