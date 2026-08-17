'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useAuthStore from '@/store/authStore';

const ROLE_DASHBOARDS = {
  STUDENT:      '/student',
  SCHOOL_ADMIN: '/school/overview',
  PARENT:       '/parent/dashboard',
  SUPER_ADMIN:  '/admin/analytics',
};

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
  }, [isLoggedIn, user, router, allowedRoles]);

  return { isLoggedIn, user };
}

export function useRedirectIfLoggedIn() {
  const { isLoggedIn, user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (isLoggedIn && user?.role) {
      router.replace(ROLE_DASHBOARDS[user.role] || '/student');
    }
  }, [isLoggedIn, user, router]);
}

export default useRequireAuth;
