const PUBLIC_AUTH_PATHS = new Set([
  'auth/student-registration-options',
  'auth/register/student',
  'auth/register',
  'auth/login',
  'auth/platform-admin/login',
  'auth/platform-admin/verify-otp',
  'auth/send-otp',
  'auth/verify-otp',
  'auth/forgot-password',
  'auth/reset-password',
]);

/**
 * Public authentication requests must work even when this browser still has
 * an expired token from an earlier session. Protected API requests continue
 * to use the normal session-expiry checks.
 */
export function isPublicAuthRequest(url?: string | null): boolean {
  if (!url) return false;

  const pathname = url
    .split(/[?#]/, 1)[0]
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/\/$/, '')
    .replace(/^\//, '')
    .replace(/^api\/v\d+\//, '');

  return PUBLIC_AUTH_PATHS.has(pathname);
}
