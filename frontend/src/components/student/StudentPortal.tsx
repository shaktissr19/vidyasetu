'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import useAuthStore from '@/store/authStore';
import { getDashboard } from '@/services/studentService';
import { getDashboardSnapshot, isNetworkOnlyFailure, saveDashboardSnapshot } from '@/lib/offlineLearning';
import { apiErrorStatus, apiErrorText } from '@/utils/errors';
import type { StudentDashboard } from '@/types/api';
import type { StudentSectionId, StudentSectionProps } from '@/types/studentPortal';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import GroupsHub from '@/components/groups/GroupsHub';
import DashboardSection from './sections/DashboardSection';
import LearningSection from './sections/LearningSection';
import ConceptMasteryPanel from './sections/ConceptMasteryPanel';
import HomeworkSection from './sections/HomeworkSection';
import AITutorSection from './sections/AITutorSection';
import DoubtForumSection from './sections/DoubtForumSection';
import ExamsSection from './sections/ExamsSection';
import AttendanceSection from './sections/AttendanceSection';
import LeaveCalendarSection from './sections/LeaveCalendarSection';
import TransportSection from './sections/TransportSection';
import DocumentsSection from './sections/DocumentsSection';
import MySchoolSection from './sections/MySchoolSection';
import ReportCardSection from './sections/ReportCardSection';
import NotificationsSection from './sections/NotificationsSection';
import OfflineSection from './sections/OfflineSection';
import ProfileSecuritySection from './sections/ProfileSecuritySection';
import styles from './StudentPortal.module.css';

const MENU: ReadonlyArray<readonly [StudentSectionId, string, string]> = [
  ['dashboard', '🏠', 'Dashboard'],
  ['subjects', '📚', 'Learning'],
  ['homework', '📝', 'Homework'],
  ['ai', '🤖', 'AI Tutor'],
  ['doubts', '💬', 'Doubt Forum'],
  ['exams', '🏆', 'Competitions'],
  ['groups', '🤝', 'Communities'],
  ['attendance', '📅', 'Attendance'],
  ['leave', '🩺', 'Leave & Calendar'],
  ['transport', '🚌', 'Transport & Safety'],
  ['documents', '📁', 'Records & Certificates'],
  ['school', '🏫', 'My School'],
  ['report', '📄', 'Report Card'],
  ['notifications', '🔔', 'Notifications'],
  ['offline', '📶', 'Offline Mode'],
  ['profile', '👤', 'Profile & Security'],
];

interface StudentPortalProps {
  initialSection?: StudentSectionId;
}

export default function StudentPortal({ initialSection = 'dashboard' }: StudentPortalProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [section, setSection] = useState<StudentSectionId>(initialSection);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [usingOfflineSnapshot, setUsingOfflineSnapshot] = useState(false);

  useEffect(() => { setSection(initialSection); }, [initialSection]);
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vs_access_token') : null;
    if (!token) router.replace('/login');
  }, [router]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const dashboardQuery = useQuery<StudentDashboard>({
    queryKey: ['student-dashboard', user?.id || 'active-session'],
    queryFn: async () => {
      try {
        const dashboard = (await getDashboard()).data.data;
        if (user?.id) await saveDashboardSnapshot(user.id, dashboard);
        setUsingOfflineSnapshot(false);
        return dashboard;
      } catch (error: unknown) {
        if (user?.id && isNetworkOnlyFailure(error)) {
          const snapshot = await getDashboardSnapshot(user.id);
          if (snapshot) {
            setUsingOfflineSnapshot(true);
            return snapshot;
          }
        }
        throw error;
      }
    },
    staleTime: 20_000,
    retry: 1,
  });

  const dashboard = dashboardQuery.data;
  const student = dashboard?.student;
  const dashboardStatus = apiErrorStatus(dashboardQuery.error);

  useEffect(() => {
    if (dashboardStatus === 401 || dashboardStatus === 403) {
      router.replace('/login');
      return;
    }
    if (dashboardStatus === 404) router.replace('/register?complete=1');
  }, [dashboardStatus, router]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  function goSection(id: string): void {
    const next = MENU.find(([menuId]) => menuId === id)?.[0];
    if (!next) return;
    setSection(next);
    setSidebarOpen(false);
    const href = next === 'dashboard' ? '/student' : `/student?section=${encodeURIComponent(next)}`;
    router.push(href, { scroll: false });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const shared: StudentSectionProps = {
    dashboard,
    student,
    notify: setToast,
    goSection,
    refreshDashboard: async () => dashboardQuery.refetch(),
  };

  let content: ReactNode;
  switch (section) {
    case 'subjects': content = <><LearningSection {...shared} /><ConceptMasteryPanel /></>; break;
    case 'homework': content = <HomeworkSection {...shared} />; break;
    case 'ai': content = <AITutorSection {...shared} />; break;
    case 'doubts': content = <DoubtForumSection {...shared} />; break;
    case 'exams': content = <ExamsSection {...shared} />; break;
    case 'groups': content = <GroupsHub title="Education Communities" subtitle="Learn, discuss and collaborate in moderated student, teacher, parent and school communities" accent="var(--forest)" />; break;
    case 'attendance': content = <AttendanceSection {...shared} />; break;
    case 'leave': content = <LeaveCalendarSection {...shared} />; break;
    case 'transport': content = <TransportSection />; break;
    case 'documents': content = <DocumentsSection {...shared} />; break;
    case 'school': content = <MySchoolSection {...shared} />; break;
    case 'report': content = <ReportCardSection {...shared} />; break;
    case 'notifications': content = <NotificationsSection {...shared} />; break;
    case 'offline': content = <OfflineSection {...shared} />; break;
    case 'profile': content = <ProfileSecuritySection {...shared} />; break;
    default: content = <DashboardSection {...shared} greeting={greeting} />;
  }

  if (dashboardQuery.isLoading || dashboardStatus === 404) {
    return (
      <div className={styles.shell}>
        <GlobalTopbar />
        <div className={styles.loading}>{dashboardStatus === 404 ? 'Opening Student account setup…' : 'Loading your Student workspace…'}</div>
      </div>
    );
  }

  if (dashboardQuery.isError) {
    return (
      <div className={styles.shell}>
        <GlobalTopbar />
        <div className={styles.loading}>
          <div>
            <div className={styles.error}>{apiErrorText(dashboardQuery.error, 'Could not load the Student workspace.')}</div>
            <button className={styles.primary} onClick={() => dashboardQuery.refetch()}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <GlobalTopbar />
      {usingOfflineSnapshot && (
        <div style={{ margin: '10px 18px 0', padding: '10px 14px', borderRadius: 10, background: '#FFF7E8', border: '1px solid #F7D79A', color: '#6B4A0B', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span>📶 You are viewing the last saved Student dashboard. Saved lessons and queued learning progress remain available in Offline Mode.</span>
          <button className={styles.secondary} onClick={() => goSection('offline')}>Open Offline Mode</button>
        </div>
      )}
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
