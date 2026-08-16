'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useAuthStore from '@/store/authStore';

const ROLE_DASHBOARDS = {
  STUDENT:      '/dashboard',
  SCHOOL_ADMIN: '/school/overview',
  PARENT:       '/parent/dashboard',
  SUPER_ADMIN:  '/admin/analytics',
};

/**
 * Redirect to login if not authenticated.
 * Optionally restrict to specific roles.
 */
export function useRequireAuth(allowedRoles = []) {
  const { isLoggedIn, user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    if (allowedRoles.length && user?.role && !allowedRoles.includes(user.role)) {
      const dest = ROLE_DASHBOARDS[user.role] || '/login';
      router.replace(dest);
    }
  }, [isLoggedIn, user, router]);

  return { isLoggedIn, user };
}

/**
 * Redirect to role dashboard if already logged in.
 * Used on login/register pages.
 */
export function useRedirectIfLoggedIn() {
  const { isLoggedIn, user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (isLoggedIn && user?.role) {
      router.replace(ROLE_DASHBOARDS[user.role] || '/dashboard');
    }
  }, [isLoggedIn, user, router]);
}

export default useRequireAuth;
