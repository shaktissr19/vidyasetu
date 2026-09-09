'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { UserRole } from '@vidyasetu/contracts';
import useAuthStore from '@/store/authStore';
import { getTrackedSessionExpiryReason } from '@/lib/sessionPolicy';

const ROLE_DASHBOARDS: Record<UserRole, string> = {
  STUDENT: '/student',
  SCHOOL_ADMIN: '/school/overview',
  TEACHER: '/school/overview',
  PARENT: '/parent/dashboard',
  SUPER_ADMIN: '/admin/analytics',
};

export function useRequireAuth(allowedRoles: readonly UserRole[] = []) {
  const { isLoggedIn, user, logout } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    const expiredReason = getTrackedSessionExpiryReason();
    if (expiredReason) {
      logout();
      router.replace(`/login?reason=${expiredReason}`);
      return;
    }
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    const role = user?.role;
    if (allowedRoles.length && role && !allowedRoles.includes(role)) {
      router.replace(ROLE_DASHBOARDS[role] || '/login');
    }
  }, [allowedRoles, isLoggedIn, logout, router, user]);

  return { isLoggedIn, user };
}

export function useRedirectIfLoggedIn() {
  const { isLoggedIn, user, logout } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    const expiredReason = getTrackedSessionExpiryReason();
    if (expiredReason) {
      logout();
      return;
    }
    const role = user?.role;
    if (isLoggedIn && role) router.replace(ROLE_DASHBOARDS[role] || '/student');
  }, [isLoggedIn, logout, router, user]);
}

export default useRequireAuth;
