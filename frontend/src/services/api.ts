import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { RefreshTokenResponse } from '@vidyasetu/contracts';
import { getTrackedSessionExpiryReason, purgePersistedAuthSession, sessionReasonMessage } from '@/lib/sessionPolicy';

const BASE_URL = typeof window !== 'undefined'
  ? '/api/v1'
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1');

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

interface RefreshEnvelope {
  data: RefreshTokenResponse;
}

function redirectExpiredSession(): never {
  const reason = getTrackedSessionExpiryReason() || 'idle';
  const message = sessionReasonMessage(reason);
  window.sessionStorage.setItem('vs_session_expired_message', message);
  purgePersistedAuthSession();
  window.location.replace(`/login?reason=${reason}`);
  throw new Error(message);
}

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('vs_access_token');
    if (token && getTrackedSessionExpiryReason()) redirectExpiredSession();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error: unknown) => Promise.reject(error));

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error);

    const axiosError = error as AxiosError;
    const original = axiosError.config as RetryableRequestConfig | undefined;

    if (axiosError.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      try {
        if (typeof window !== 'undefined' && getTrackedSessionExpiryReason()) redirectExpiredSession();

        const refreshToken = typeof window !== 'undefined'
          ? localStorage.getItem('vs_refresh_token')
          : null;
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post<RefreshEnvelope>(`${BASE_URL}/auth/refresh`, { refreshToken });
        const newToken = data.data.accessToken;
        localStorage.setItem('vs_access_token', newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshError: unknown) {
        if (typeof window !== 'undefined') {
          purgePersistedAuthSession();
          window.location.replace('/login');
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

export default api;
