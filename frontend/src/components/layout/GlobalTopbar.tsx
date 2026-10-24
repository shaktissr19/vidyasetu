'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { UserRole } from '@vidyasetu/contracts';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';
import { logout as apiLogout } from '@/services/authService';
import { getUnreadNotificationCount } from '@/services/notificationService';

const NAV: ReadonlyArray<readonly [string, string]> = [
  ['Home', '/'],
  ['Learn', '/learn'],
  ['Students', '/for-students'],
  ['Schools', '/for-schools'],
  ['Parents', '/for-parents'],
  ['Competitions', '/competition'],
  ['Communities', '/communities'],
  ['Platform Admin', '/platform-admin'],
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/communities' && pathname === '/groups-info') return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function accountPath(role?: UserRole): string {
  if (role === 'STUDENT') return '/student';
  if (role === 'SCHOOL_ADMIN' || role === 'TEACHER') return '/school/overview';
  if (role === 'PARENT') return '/parent/dashboard';
  if (role === 'SUPER_ADMIN') return '/admin/analytics';
  return '/';
}

function notificationPath(role?: UserRole): string {
  if (role === 'STUDENT') return '/student?section=notifications';
  return '/notification-center';
}

export default function GlobalTopbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoggedIn, refreshToken, logout } = useAuthStore();
  const { lang, toggleLang } = useLanguageStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const notificationsQuery = useQuery({
    queryKey: ['notification-unread-count'],
    queryFn: async () => Number((await getUnreadNotificationCount()).data.data?.count || 0),
    enabled: isLoggedIn,
    staleTime: 10_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const unreadCount = isLoggedIn ? Number(notificationsQuery.data || 0) : 0;

  async function handleLogout() {
    try {
      if (refreshToken) await apiLogout(refreshToken);
    } catch (_error: unknown) {}
    logout();
    router.replace('/login');
  }

  return (
    <header className={`global-topbar${pathname.startsWith('/admin') ? ' global-topbar-admin' : ''}`}>
      <Link href="/" className="global-topbar-brand">
        <div className="global-topbar-brand-icon">V</div>
        <div className="global-topbar-brand-name">
          Vidya<span>Setu</span>
        </div>
      </Link>

      <button className="global-topbar-control global-topbar-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="global-main-navigation" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? '✕ Close' : '☰ Menu'}</button>
      <nav id="global-main-navigation" className={`global-topbar-nav${menuOpen ? ' is-open' : ''}`} aria-label="Main navigation">
        {NAV.map(([label, href]) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} className={`global-topbar-link${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} onClick={() => setMenuOpen(false)}>{label}</Link>
          );
        })}
      </nav>

      <div className="global-topbar-actions">
        <button className="global-topbar-control" onClick={toggleLang}>
          {lang === 'hi' ? 'EN' : 'हिंदी'}
        </button>
        {isLoggedIn ? (
          <>
            <button
              className="global-topbar-control global-topbar-notifications"
              onClick={() => router.push(notificationPath(user?.role))}
              title={unreadCount ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'Notifications'}
              aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            >
              🔔
              {unreadCount > 0 && (
                <span className="global-topbar-notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </button>
            <button className="global-topbar-control global-topbar-dashboard" onClick={() => router.push(accountPath(user?.role))} title="Open your dashboard">
              My Dashboard
            </button>
            <button className="global-topbar-control global-topbar-logout" onClick={handleLogout}>Logout</button>
          </>
        ) : (
          <>
            <button className="global-topbar-control global-topbar-login" onClick={() => router.push('/login')}>Login</button>
            <button className="global-topbar-control global-topbar-create" onClick={() => router.push('/register')}>Create Account</button>
          </>
        )}
      </div>
    </header>
  );
}
