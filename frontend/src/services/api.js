import axios from 'axios';

// In Docker: Next.js rewrites /api/v1/* → backend:5000/api/v1/*
// In local dev (no Docker): direct to localhost:5000
const BASE_URL = typeof window !== 'undefined'
  ? '/api/v1'   // browser: use Next.js rewrite proxy
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1'); // SSR

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('vs_access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (err) => Promise.reject(err));

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('vs_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
        const newToken = data.data.accessToken;
        localStorage.setItem('vs_access_token', newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (_) {
        localStorage.removeItem('vs_access_token');
        localStorage.removeItem('vs_refresh_token');
        if (typeof window !== 'undefined') window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
