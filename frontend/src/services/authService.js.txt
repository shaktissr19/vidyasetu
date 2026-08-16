// services/authService.js
import api from './api';

export const sendOTP    = (mobile)            => api.post('/auth/send-otp',    { mobile });
export const verifyOTP  = (mobile, otp, dev)  => api.post('/auth/verify-otp',  { mobile, otp, deviceInfo: dev });
export const refreshToken = (refreshToken)    => api.post('/auth/refresh',     { refreshToken });
export const logout     = (refreshToken)      => api.post('/auth/logout',      { refreshToken });
export const updateProfile = (data)           => api.patch('/auth/profile',    data);
export const getMe      = ()                  => api.get('/auth/me');
