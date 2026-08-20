import axios from 'axios';

export function apiErrorText(error: unknown, fallback = 'Request failed'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: { message?: string }; message?: string } | undefined;
    return data?.error?.message || data?.message || error.message || fallback;
  }
  return error instanceof Error ? error.message || fallback : fallback;
}

export function apiErrorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}
