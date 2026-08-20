import type { UserRole } from '@vidyasetu/contracts';
import api from './api';

type Payload = Record<string, unknown>;

export const loginWithPassword = (identifier: string, password: string, deviceInfo?: string) =>
  api.post('/auth/login', { identifier, password, deviceInfo });

export const getStudentRegistrationOptions = () => api.get('/auth/student-registration-options');
export const registerStudent = (data: Payload) => api.post('/auth/register/student', data);

export const sendOTP = (mobile: string) => api.post('/auth/send-otp', { mobile });
export const verifyOTP = (mobile: string, otp: string, dev?: string, role?: UserRole | string) =>
  api.post('/auth/verify-otp', { mobile, otp, deviceInfo: dev, role });

export const forgotPassword = (identifier: string) => api.post('/auth/forgot-password', { identifier });
export const resetPassword = (identifier: string, otp: string, newPassword: string) =>
  api.post('/auth/reset-password', { identifier, otp, newPassword });
export const setPassword = (currentPassword: string | null | undefined, newPassword: string) =>
  api.post('/auth/set-password', { currentPassword, newPassword });

export const refreshToken = (token: string) => api.post('/auth/refresh', { refreshToken: token });
export const logout = (token?: string | null) => api.post('/auth/logout', { refreshToken: token });
export const updateProfile = (data: Payload) => api.patch('/auth/profile', data);
export const getMe = () => api.get('/auth/me');
