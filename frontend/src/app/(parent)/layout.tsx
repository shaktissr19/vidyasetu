'use client';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import DashSidebar from '@/components/layout/DashSidebar';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';

type Translate = (hi: string, en?: string) => string;

const MENU = (t: Translate) => [
  { href: '/parent/dashboard', icon: '🏠', label: t('अवलोकन', 'Overview'), exact: true },
  { href: '/parent/performance', icon: '📊', label: t('प्रदर्शन', 'Performance') },
  { href: '/parent/attendance', icon: '📅', label: t('उपस्थिति', 'Attendance') },
  { href: '/parent/notifications', icon: '🔔', label: t('सूचनाएँ', 'Notifications') },
  { href: '/parent/fees', icon: '💰', label: t('फीस', 'Fees') },
  { href: '/parent/report-card', icon: '📄', label: t('रिपोर्ट कार्ड', 'Report Card') },
  { href: '/parent/messages', icon: '💬', label: t('शिक्षक को संदेश', 'Message Teacher') },
  { href: '/parent/grievances', icon: '🛡️', label: t('चिंता और शिकायत', 'Concerns & Grievances') },
  { href: '/parent/groups', icon: '🌐', label: t('शिक्षा समुदाय', 'Community') },
];

export default function ParentLayout({ children }: { children: ReactNode }) {
  const { isLoggedIn, user } = useAuthStore();
  const { t } = useLanguageStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn) { router.replace('/login?role=parent'); return; }
    if (user?.role && user.role !== 'PARENT') router.replace('/login?role=parent');
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
