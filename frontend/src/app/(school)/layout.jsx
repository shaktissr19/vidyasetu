'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import DashSidebar from '@/components/layout/DashSidebar';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';

const MENU = (t) => [
  { href: '/school/overview', icon: '🏠', label: t('ओवरव्यू', 'Overview'), exact: true },
  { href: '/school/enrollments', icon: '✅', label: t('नामांकन अनुरोध', 'Enrollment Requests') },
  { href: '/school/students', icon: '👨‍🎓', label: t('छात्र', 'Students') },
  { href: '/school/teachers', icon: '👩‍🏫', label: t('शिक्षक', 'Teachers') },
  { href: '/school/attendance', icon: '📅', label: t('उपस्थिति', 'Attendance') },
  { href: '/school/fees', icon: '💰', label: t('फीस', 'Fees') },
  { href: '/school/timetable', icon: '🗓️', label: t('टाइमटेबल', 'Timetable') },
  { href: '/school/results', icon: '📊', label: t('परिणाम', 'Results') },
  { href: '/school/announcements', icon: '📢', label: t('घोषणाएँ', 'Announcements') },
  { href: '/school/onboarding', icon: '🚀', label: t('सेटअप', 'Setup Guide') },
];

export default function SchoolLayout({ children }) {
  const { isLoggedIn, user } = useAuthStore();
  const { t } = useLanguageStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn) { router.replace('/login?role=school'); return; }
    if (user?.role && !['SCHOOL_ADMIN','SUPER_ADMIN'].includes(user.role)) router.replace('/login?role=school');
  }, [isLoggedIn, user, router]);

  if (!isLoggedIn) return null;

  return (
    <div className="flex flex-col min-h-screen">
      <GlobalTopbar />
      <div className="dash-layout">
        <DashSidebar
          accentColor="var(--saffron)"
          profile={{ avatar: '🏫', name: user?.name || 'School Admin', subtitle: 'School Administrator', badge: '✅ Verified' }}
          menuItems={MENU(t)}
        />
        <main className="dash-main">{children}</main>
      </div>
    </div>
  );
}
