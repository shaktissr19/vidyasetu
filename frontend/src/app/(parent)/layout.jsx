'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import DashSidebar from '@/components/layout/DashSidebar';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';

const MENU = (t) => [
  { href: '/parent/dashboard', icon: '🏠', label: t('डैशबोर्ड', 'Dashboard'), exact: true },
  { href: '/parent/attendance', icon: '📅', label: t('उपस्थिति', 'Attendance') },
  { href: '/parent/fees', icon: '💰', label: t('फीस', 'Fees') },
  { href: '/parent/messages', icon: '💬', label: t('संदेश', 'Messages') },
  { href: '/parent/notifications', icon: '🔔', label: t('सूचनाएँ', 'Notifications') },
];

export default function ParentLayout({ children }) {
  const { isLoggedIn, user } = useAuthStore();
  const { t } = useLanguageStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn) { router.replace('/login'); return; }
    if (user?.role && user.role !== 'PARENT') router.replace('/login');
  }, [isLoggedIn, user, router]);

  if (!isLoggedIn) return null;

  return (
    <div className="flex flex-col min-h-screen">
      <GlobalTopbar />
      <div className="dash-layout">
        <DashSidebar
          accentColor="var(--forest)"
          profile={{ avatar: '👩', name: user?.name || 'Parent', subtitle: t('अभिभावक पोर्टल', 'Parent Portal'), badge: '✅ Verified' }}
          menuItems={MENU(t)}
        />
        <main className="dash-main parent-main">{children}</main>
      </div>
    </div>
  );
}
