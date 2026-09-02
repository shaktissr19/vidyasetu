'use client';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import DashSidebar from '@/components/layout/DashSidebar';
import useAuthStore from '@/store/authStore';

const MENU = [
  { href: '/admin/analytics', icon: '📊', label: 'Analytics', exact: true },
  { href: '/admin/schools', icon: '🏫', label: 'Schools' },
  { href: '/admin/users', icon: '👥', label: 'Users' },
  { href: '/admin/learning', icon: '📚', label: 'Learning Studio', exact: true },
  { href: '/admin/learning/imports', icon: '📥', label: 'Bulk Learning Import' },
  { href: '/admin/learning/practice', icon: '🧠', label: 'Question Bank' },
  { href: '/admin/learning/intake', icon: '🌐', label: 'OER Intake' },
  { href: '/admin/content', icon: '🗂️', label: 'Academic Content' },
  { href: '/admin/competitions', icon: '🏆', label: 'Competitions' },
  { href: '/admin/groups', icon: '🤝', label: 'Communities' },
  { href: '/admin/grievances', icon: '🛡️', label: 'Grievances' },
  { href: '/admin/revenue', icon: '💰', label: 'Revenue' },
  { href: '/admin/support', icon: '🎧', label: 'Support' },
  { href: '/admin/settings', icon: '⚙️', label: 'Settings' },
] as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { isLoggedIn, user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn) { router.replace('/login?role=admin'); return; }
    if (user?.role && user.role !== 'SUPER_ADMIN') router.replace('/login?role=admin');
  }, [isLoggedIn, user, router]);

  if (!isLoggedIn) return null;

  return (
    <div className="flex flex-col min-h-screen">
      <GlobalTopbar />
      <div className="dash-layout">
        <DashSidebar
          accentColor="#4FC3F7"
          profile={{ avatar: '⚙️', name: user?.name || 'Super Admin', subtitle: 'Platform Control', badge: '🔐 Admin' }}
          menuItems={MENU}
        />
        <main className="dash-main" style={{ background: '#182540' }}>{children}</main>
      </div>
    </div>
  );
}
