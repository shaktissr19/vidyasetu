import type { LanguageCode, UserRole } from '@vidyasetu/contracts';
import api from './api';
import type { ApiEnvelope, StudentProfile } from '@/types/api';

type Payload = Record<string, unknown>;

export interface SessionUser {
  id: string;
  name: string | null;
  username: string | null;
  email: string | null;
  mobile: string;
  role: UserRole;
  language: LanguageCode;
  studentCode: string | null;
  schoolLinkStatus: string | null;
  mustChangePassword: boolean;
}

export interface AuthSessionPayload {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
  isNewUser?: boolean;
}

export interface RegistrationClassOption {
  id: string;
  className: string;
  section: string;
  label: string;
  academicYear: string;
}

export interface RegistrationSchoolOption {
  id: string;
  name: string;
  name_hi?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  udise_code?: string | null;
  academic_year?: string | null;
  classes: RegistrationClassOption[];
}

export interface StudentRegistrationOptions {
  schools: RegistrationSchoolOption[];
  gradeLevels: string[];
}

export interface RegisteredStudentSummary {
  id: string;
  studentCode: string | null;
  gradeLevel: string;
  schoolLinkStatus: string;
  schoolName?: string | null;
  classLabel?: string | null;
}

export interface StudentRegistrationResult extends AuthSessionPayload {
  student: RegisteredStudentSummary;
  schoolRequest?: { id: string; status: string; requested_at?: string | null } | null;
  parentLinkStatus?: string;
}

export interface SendOtpResult {
  message?: string;
  otp?: string;
  resendAfterSeconds?: number;
}

export const loginWithPassword = (identifier: string, password: string, deviceInfo?: string) =>
  api.post<ApiEnvelope<AuthSessionPayload>>('/auth/login', { identifier, password, deviceInfo });

export const getStudentRegistrationOptions = () =>
  api.get<ApiEnvelope<StudentRegistrationOptions>>('/auth/student-registration-options');
export const registerStudent = (data: Payload) =>
  api.post<ApiEnvelope<StudentRegistrationResult>>('/auth/register/student', data);

export const sendOTP = (mobile: string, role?: UserRole | string) =>
  api.post<ApiEnvelope<SendOtpResult>>('/auth/send-otp', { mobile, role });
export const verifyOTP = (mobile: string, otp: string, dev?: string, role?: UserRole | string) =>
  api.post<ApiEnvelope<AuthSessionPayload>>('/auth/verify-otp', { mobile, otp, deviceInfo: dev, role });

export const forgotPassword = (identifier: string) =>
  api.post<ApiEnvelope<{ maskedMobile?: string; otp?: string }>>('/auth/forgot-password', { identifier });
export const resetPassword = (identifier: string, otp: string, newPassword: string) =>
  api.post<ApiEnvelope<{ message?: string }>>('/auth/reset-password', { identifier, otp, newPassword });
export const setPassword = (currentPassword: string | null | undefined, newPassword: string) =>
  api.post<ApiEnvelope<{ message?: string }>>('/auth/set-password', { currentPassword, newPassword });

export const refreshToken = (token: string) => api.post<ApiEnvelope<{ accessToken: string }>>('/auth/refresh', { refreshToken: token });
export const logout = (token?: string | null) => api.post<ApiEnvelope<{ message?: string }>>('/auth/logout', { refreshToken: token });
export const updateProfile = (data: Payload) => api.patch<ApiEnvelope<SessionUser>>('/auth/profile', data);
export const getMe = () => api.get<ApiEnvelope<StudentProfile & SessionUser>>('/auth/me');
