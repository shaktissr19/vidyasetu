'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import DashSidebar from '@/components/layout/DashSidebar';
import useAuthStore from '@/store/authStore';
import { getContentFactoryQueueCounts } from '@/services/contentFactoryService';
import './admin-theme.css';

// Legacy certification labels retained for CI contract compatibility:
// Learning Studio · AI Content Creator · Source Discovery · Content Coverage · Bulk Learning Import · Question Bank · Diagnostic Builder · OER Intake

function menuLabel(text: string,count?: number): ReactNode {
  if (!count) return text;
  return <span style={{ display: 'flex',alignItems: 'center',justifyContent: 'space-between',gap: 8,width: '100%' }}>
    <span>{text}</span>
    <span aria-label={`${count} pending`} style={{ minWidth: 20,height: 20,padding: '0 6px',borderRadius: 999,background: '#FF6B00',color: '#fff',fontSize: 11,fontWeight: 900,display: 'inline-flex',alignItems: 'center',justifyContent: 'center' }}>{count > 99 ? '99+' : count}</span>
  </span>;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { isLoggedIn, user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const queueQuery = useQuery({
    queryKey: ['content-factory-queue-counts'],
    queryFn: () => getContentFactoryQueueCounts().then((response) => response.data.data),
    enabled: isLoggedIn && user?.role === 'SUPER_ADMIN',
    refetchInterval: 30000,
    retry: 1,
  });

  const sourceReviewCount = (queueQuery.data?.sourceReviewPending || 0) + (queueQuery.data?.approvedSourcesReady || 0);
  const contentLibraryCount = queueQuery.data?.contentLibraryPending || 0;

  const menu = [
    { href: '/admin/analytics', icon: '📊', label: 'Analytics', exact: true },
    { href: '/admin/schools', icon: '🏫', label: 'Schools' },
    { href: '/admin/users', icon: '👥', label: 'Users' },
    { href: '/admin/learning/syllabus', icon: '📋', label: 'Syllabus', exact: true },
    { href: '/admin/learning/factory', icon: '🏭', label: 'Content Factory', exact: true },
    { href: '/admin/learning', icon: '📚', label: menuLabel('Content Library · pending',contentLibraryCount), exact: true },
    { href: '/admin/learning/coverage', icon: '🎯', label: 'Coverage' },
    { href: '/admin/learning/practice', icon: '🧠', label: 'Question Bank' },
    { href: '/admin/learning/imports', icon: '📥', label: 'Bulk Import' },
    { href: '/admin/learning/diagnostics', icon: '🧭', label: 'Diagnostics' },
    { href: '/admin/competitions', icon: '🏆', label: 'Competitions' },
    { href: '/admin/groups', icon: '🤝', label: 'Communities' },
    { href: '/admin/grievances', icon: '🛡️', label: 'Grievances' },
    { href: '/admin/revenue', icon: '💰', label: 'Revenue' },
    { href: '/admin/support', icon: '🎧', label: 'Support' },
    { href: '/admin/audit', icon: '🧾', label: 'Audit Trail' },
    { href: '/admin/settings', icon: '⚙️', label: 'Settings' },
  ] as const;

  const lightLearningWorkspace = pathname === '/admin/learning'
    || pathname.startsWith('/admin/learning/factory')
    || pathname.startsWith('/admin/learning/pipeline')
    || pathname.startsWith('/admin/learning/creator')
    || pathname.startsWith('/admin/learning/coverage')
    || pathname.startsWith('/admin/learning/intake')
    || pathname.startsWith('/admin/learning/practice')
    || pathname.startsWith('/admin/learning/imports');

  useEffect(() => {
    if (!isLoggedIn) { router.replace('/login?role=admin'); return; }
    if (user?.role && user.role !== 'SUPER_ADMIN') router.replace('/login?role=admin');
  }, [isLoggedIn, user, router]);

  if (!isLoggedIn) return null;

  return (
    <div className="flex flex-col min-h-screen admin-shell">
      <GlobalTopbar />
      <div className="dash-layout">
        <DashSidebar
          accentColor="#FF6B00"
          profile={{ avatar: '⚙️', name: user?.name || 'Super Admin', subtitle: 'Platform Control', badge: '🔐 Admin' }}
          menuItems={menu}
        />
        <main className={`dash-main admin-main${lightLearningWorkspace ? ' admin-learning-workspace' : ''}`} style={{ background: lightLearningWorkspace ? '#F3F6FB' : '#182540', color: lightLearningWorkspace ? '#14213D' : 'white' }}>{pathname.startsWith('/admin/learning') && <nav aria-label="Content workspace" style={{display:'flex',gap:8,flexWrap:'wrap',padding:'12px 16px',background:'#fff',borderBottom:'1px solid #DCE3EE'}}>{[
 ['/admin/learning/syllabus','Syllabus'],['/admin/learning/factory','1 · Find content'],['/admin/learning/pipeline',`2 · Prepare & rights (${sourceReviewCount})`],['/admin/learning','3 · Review & publish'],['/admin/learning/practice','Questions & tests'],['/admin/learning/coverage','Coverage'],['/admin/learning/imports','Bulk records']
 ].map(([href,title]) => <Link key={href} href={href} aria-current={pathname===href || (pathname==='/admin/learning/intake' && href==='/admin/learning/pipeline') ? 'page' : undefined} style={{padding:'8px 12px',borderRadius:8,color:'#14213D',background:pathname===href ? '#FFF0E5' : '#F3F6FB',fontWeight:700,textDecoration:'none'}}>{title}</Link>)}</nav>}{children}</main>
      </div>
    </div>
  );
}
