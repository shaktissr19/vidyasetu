'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import useAuthStore from '@/store/authStore';
import { getDashboard } from '@/services/studentService';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import DashboardSection from './sections/DashboardSection';
import SubjectsSection from './sections/SubjectsSection';
import AITutorSection from './sections/AITutorSection';
import DoubtForumSection from './sections/DoubtForumSection';
import ExamsSection from './sections/ExamsSection';
import AttendanceSection from './sections/AttendanceSection';
import MySchoolSection from './sections/MySchoolSection';
import ReportCardSection from './sections/ReportCardSection';
import OfflineSection from './sections/OfflineSection';
import ProfileSecuritySection from './sections/ProfileSecuritySection';
import styles from './StudentPortal.module.css';

const MENU = [
  ['dashboard', '🏠', 'Dashboard'],
  ['subjects', '📚', 'My Subjects'],
  ['ai', '🤖', 'AI Tutor'],
  ['doubts', '💬', 'Doubt Forum'],
  ['exams', '📝', 'Exams'],
  ['attendance', '📅', 'Attendance'],
  ['school', '🏫', 'My School'],
  ['report', '📄', 'Report Card'],
  ['offline', '📶', 'Offline Mode'],
  ['profile', '👤', 'Profile & Security'],
];

function apiData(response) { return response?.data?.data; }

export default function StudentPortal() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [section, setSection] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vs_access_token') : null;
    if (!token) router.replace('/login');
  }, [router]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const dashboardQuery = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: async () => apiData(await getDashboard()),
    staleTime: 20_000,
    retry: 1,
  });

  const dashboard = dashboardQuery.data;
  const student = dashboard?.student;

  useEffect(() => {
    const status = dashboardQuery.error?.response?.status;
    if (status === 401 || status === 403) {
      router.replace('/login');
      return;
    }
    if (status === 404) router.replace('/register?complete=1');
  }, [dashboardQuery.error, router]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  function goSection(id) {
    setSection(id);
    setSidebarOpen(false);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const shared = {
    dashboard,
    student,
    notify: setToast,
    goSection,
    refreshDashboard: dashboardQuery.refetch,
  };

  let content;
  switch (section) {
    case 'subjects': content = <SubjectsSection {...shared} />; break;
    case 'ai': content = <AITutorSection {...shared} />; break;
    case 'doubts': content = <DoubtForumSection {...shared} />; break;
    case 'exams': content = <ExamsSection {...shared} />; break;
    case 'attendance': content = <AttendanceSection {...shared} />; break;
    case 'school': content = <MySchoolSection {...shared} />; break;
    case 'report': content = <ReportCardSection {...shared} />; break;
    case 'offline': content = <OfflineSection {...shared} />; break;
    case 'profile': content = <ProfileSecuritySection {...shared} />; break;
    default: content = <DashboardSection {...shared} greeting={greeting} />;
  }

  if (dashboardQuery.isLoading || dashboardQuery.error?.response?.status === 404) {
    return (
      <div className={styles.shell}>
        <GlobalTopbar />
        <div className={styles.loading}>{dashboardQuery.error?.response?.status === 404 ? 'Opening Student account setup…' : 'Loading your Student workspace…'}</div>
      </div>
    );
  }

  if (dashboardQuery.isError) {
    return (
      <div className={styles.shell}>
        <GlobalTopbar />
        <div className={styles.loading}>
          <div>
            <div className={styles.error}>{dashboardQuery.error?.response?.data?.error?.message || 'Could not load the Student workspace.'}</div>
            <button className={styles.primary} onClick={() => dashboardQuery.refetch()}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <GlobalTopbar />
      <div className={styles.layout}>
        <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
          <button className={styles.mobileMenu} onClick={() => setSidebarOpen(v => !v)} aria-label="Toggle Student menu">☰ Student Menu</button>
          <div className={styles.profile}>
            <div className={styles.avatar}>{student?.name?.toLowerCase().includes('priya') ? '👧' : '👦'}</div>
            <div className={styles.profileName}>{student?.name || user?.name || 'Student'}</div>
            <div className={styles.profileMeta}>{student?.classLabel || `Class ${student?.gradeLevel || '—'}`}{student?.schoolName ? ` · ${student.schoolName}` : ''}</div>
            <div className={styles.xpPill} style={{ background: '#EEF4FF', color: '#0D1B3E' }}>ID: {student?.studentCode || '—'}</div>
            {student?.schoolLinkStatus === 'PENDING' && <div className={styles.profileMeta} style={{ marginTop: 7 }}>⏳ School approval pending</div>}
            {student?.schoolLinkStatus === 'APPROVED' && <div className={styles.profileMeta} style={{ marginTop: 7 }}>✅ School verified</div>}
          </div>
          <nav className={styles.sideNav} aria-label="Student module">
            {MENU.map(([id, icon, label]) => (
              <button key={id} className={`${styles.sideButton} ${section === id ? styles.sideButtonActive : ''}`} onClick={() => goSection(id)}>
                <span className={styles.sideIcon}>{icon}</span>{label}
              </button>
            ))}
          </nav>
        </aside>

        <main className={styles.main}>{content}</main>
      </div>
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
