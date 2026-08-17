'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import useAuthStore from '@/store/authStore';
import { logout as apiLogout } from '@/services/authService';
import { getDashboard } from '@/services/studentService';
import DashboardSection from './sections/DashboardSection';
import SubjectsSection from './sections/SubjectsSection';
import AITutorSection from './sections/AITutorSection';
import DoubtForumSection from './sections/DoubtForumSection';
import ExamsSection from './sections/ExamsSection';
import AttendanceSection from './sections/AttendanceSection';
import GamificationSection from './sections/GamificationSection';
import LeaderboardSection from './sections/LeaderboardSection';
import ReportCardSection from './sections/ReportCardSection';
import OfflineSection from './sections/OfflineSection';
import styles from './StudentPortal.module.css';

const MENU = [
  ['dashboard', '🏠', 'Dashboard'],
  ['subjects', '📚', 'My Subjects'],
  ['ai', '🤖', 'AI Tutor'],
  ['doubts', '💬', 'Doubt Forum'],
  ['exams', '📝', 'Exams'],
  ['attendance', '📅', 'Attendance'],
  ['gamification', '🎮', 'Badges & XP'],
  ['leaderboard', '🏆', 'Leaderboard'],
  ['report', '📄', 'Report Card'],
  ['offline', '📶', 'Offline Mode'],
];

const TOP_NAV = [
  ['Home', '/'],
  ['🏆 Olympiad', '/competition'],
  ['Student', '/student'],
  ['School ERP', '/school/overview'],
  ['Parent', '/parent/dashboard'],
  ['Admin', '/admin/analytics'],
];

function apiData(response) {
  return response?.data?.data;
}

export default function StudentPortal() {
  const router = useRouter();
  const { user, refreshToken, logout } = useAuthStore();
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
    if (status === 401) {
      router.replace('/login');
      return;
    }
    if (status === 404) {
      router.replace('/register?complete=1');
    }
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

  async function handleLogout() {
    try {
      if (refreshToken) await apiLogout(refreshToken);
    } catch (_) {
      // Local logout must still succeed if the server token has expired.
    } finally {
      logout();
      router.replace('/login');
    }
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
    case 'gamification': content = <GamificationSection {...shared} />; break;
    case 'leaderboard': content = <LeaderboardSection {...shared} />; break;
    case 'report': content = <ReportCardSection {...shared} />; break;
    case 'offline': content = <OfflineSection {...shared} />; break;
    default: content = <DashboardSection {...shared} greeting={greeting} />;
  }

  if (dashboardQuery.isLoading || dashboardQuery.error?.response?.status === 404) {
    return <div className={styles.shell}><div className={styles.loading}>{dashboardQuery.error?.response?.status === 404 ? 'Opening Student profile setup…' : 'Loading your VidyaSetu Student workspace…'}</div></div>;
  }

  if (dashboardQuery.isError) {
    return (
      <div className={styles.shell}>
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
      <header className={styles.topbar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className={styles.mobileMenu} onClick={() => setSidebarOpen(v => !v)} aria-label="Open Student menu">☰</button>
          <button className={styles.brand} onClick={() => router.push('/')}>
            <span className={styles.brandIcon}>🌉</span>
            <span className={styles.brandText}>Vidya<span>Setu</span></span>
          </button>
        </div>

        <nav className={styles.topNav} aria-label="Main navigation">
          {TOP_NAV.map(([label, href]) => (
            <button key={label} className={label === 'Student' ? styles.activeTop : ''} onClick={() => router.push(href)}>{label}</button>
          ))}
        </nav>

        <div className={styles.topActions}>
          <div className={styles.online}><span className={styles.onlineDot} />Online</div>
          <button className={styles.logoutBtn} onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
          <div className={styles.profile}>
            <div className={styles.avatar}>{student?.profilePhoto ? '🎓' : (student?.name?.toLowerCase().includes('priya') ? '👧' : '👦')}</div>
            <div className={styles.profileName}>{student?.name || user?.name || 'Student'}</div>
            <div className={styles.profileMeta}>Class {student?.classLabel || '—'} · {student?.schoolName || 'VidyaSetu School'}</div>
            <div className={styles.xpPill}>⭐ {Number(student?.xpTotal || 0).toLocaleString('en-IN')} XP · Level {student?.xpLevel || 1}</div>
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
