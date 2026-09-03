'use client';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import DashSidebar from '@/components/layout/DashSidebar';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';

type Translate = (hi: string, en?: string) => string;

const ADMIN_MENU = (t: Translate) => [
  { href: '/school/overview', icon: '🏠', label: t('ओवरव्यू', 'Overview'), exact: true },
  { href: '/school/enrollments', icon: '✅', label: t('नामांकन अनुरोध', 'Enrollment Requests') },
  { href: '/school/students', icon: '👨‍🎓', label: t('छात्र', 'Students') },
  { href: '/school/classes', icon: '🏷️', label: t('कक्षाएँ और सेक्शन', 'Classes & Sections') },
  { href: '/school/teachers', icon: '👩‍🏫', label: t('शिक्षक', 'Teachers') },
  { href: '/school/attendance', icon: '📅', label: t('उपस्थिति', 'Attendance') },
  { href: '/school/fees', icon: '💰', label: t('फीस', 'Fees') },
  { href: '/school/timetable', icon: '🗓️', label: t('टाइमटेबल', 'Timetable') },
  { href: '/school/homework', icon: '📝', label: t('होमवर्क', 'Homework') },
  { href: '/school/exams', icon: '📝', label: t('परीक्षाएँ', 'Exams') },
  { href: '/school/results', icon: '📊', label: t('परिणाम', 'Results') },
  { href: '/school/announcements', icon: '📢', label: t('घोषणाएँ', 'Announcements') },
  { href: '/school/grievances', icon: '🛡️', label: t('अभिभावक शिकायतें', 'Parent Concerns') },
  { href: '/school/groups', icon: '🤝', label: t('शिक्षा समुदाय', 'Communities') },
  { href: '/school/profile', icon: '🏫', label: t('स्कूल प्रोफ़ाइल', 'School Profile') },
];

const TEACHER_MENU = (t: Translate) => [
  { href: '/school/overview', icon: '🏠', label: t('ओवरव्यू', 'Overview'), exact: true },
  { href: '/school/students', icon: '👨‍🎓', label: t('छात्र', 'Students') },
  { href: '/school/attendance', icon: '📅', label: t('उपस्थिति', 'Attendance') },
  { href: '/school/timetable', icon: '🗓️', label: t('टाइमटेबल', 'Timetable') },
  { href: '/school/homework', icon: '📝', label: t('होमवर्क', 'Homework') },
  { href: '/school/results', icon: '📊', label: t('परिणाम', 'Results') },
  { href: '/school/announcements', icon: '📢', label: t('घोषणाएँ', 'Announcements') },
  { href: '/school/groups', icon: '🤝', label: t('शिक्षा समुदाय', 'Communities') },
  { href: '/school/profile', icon: '🏫', label: t('स्कूल प्रोफ़ाइल', 'School Profile') },
];

export default function SchoolLayout({ children }: { children: ReactNode }) {
  const { isLoggedIn, user } = useAuthStore();
  const { t } = useLanguageStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn) { router.replace('/login?role=school'); return; }
    if (user?.role && !['SCHOOL_ADMIN', 'SUPER_ADMIN', 'TEACHER'].includes(user.role)) {
      router.replace('/login?role=school');
    }
  }, [isLoggedIn, user, router]);

  if (!isLoggedIn || (user?.role && !['SCHOOL_ADMIN', 'SUPER_ADMIN', 'TEACHER'].includes(user.role))) return null;

  const isTeacher = user?.role === 'TEACHER';
  return (
    <div className="flex flex-col min-h-screen">
      <GlobalTopbar />
      <div className="dash-layout">
        <DashSidebar
          accentColor="var(--saffron)"
          profile={{
            avatar: isTeacher ? '👩‍🏫' : '🏫',
            name: user?.name || (isTeacher ? 'Teacher' : 'School Admin'),
            subtitle: isTeacher ? 'Teacher' : 'School Administrator',
            badge: isTeacher ? '📚 Staff' : '✅ Verified',
          }}
          menuItems={(isTeacher ? TEACHER_MENU : ADMIN_MENU)(t)}
        />
        <main className="dash-main">{children}</main>
      </div>
    </div>
  );
}
