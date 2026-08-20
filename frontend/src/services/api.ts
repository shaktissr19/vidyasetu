import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { RefreshTokenResponse } from '@vidyasetu/contracts';

const BASE_URL = typeof window !== 'undefined'
  ? '/api/v1'
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1');

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

interface RefreshEnvelope {
  data: RefreshTokenResponse;
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
          localStorage.removeItem('vs_access_token');
          localStorage.removeItem('vs_refresh_token');
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

export default api;
