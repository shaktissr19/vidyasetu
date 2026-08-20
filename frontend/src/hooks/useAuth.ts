'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { UserRole } from '@vidyasetu/contracts';
import useAuthStore from '@/store/authStore';

const ROLE_DASHBOARDS: Record<UserRole, string> = {
  STUDENT: '/student',
  SCHOOL_ADMIN: '/school/overview',
  TEACHER: '/school/overview',
  PARENT: '/parent/dashboard',
  SUPER_ADMIN: '/admin/analytics',
};

export function useRequireAuth(allowedRoles: readonly UserRole[] = []) {
  const { isLoggedIn, user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/login');
      return;
    }
    const role = user?.role;
    if (allowedRoles.length && role && !allowedRoles.includes(role)) {
      router.replace(ROLE_DASHBOARDS[role] || '/login');
    }
  }, [isLoggedIn, user, router, allowedRoles]);

  return { isLoggedIn, user };
}

export function useRedirectIfLoggedIn() {
  const { isLoggedIn, user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    const role = user?.role;
    if (isLoggedIn && role) router.replace(ROLE_DASHBOARDS[role] || '/student');
  }, [isLoggedIn, user, router]);
}

export default useRequireAuth;
