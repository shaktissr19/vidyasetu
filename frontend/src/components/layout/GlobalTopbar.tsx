'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { UserRole } from '@vidyasetu/contracts';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';
import { logout as apiLogout } from '@/services/authService';

const NAV: ReadonlyArray<readonly [string, string]> = [
  ['Home', '/'],
  ['🏆 Olympiad', '/competition'],
  ['Student', '/student'],
  ['School', '/school/overview'],
  ['Parent', '/parent/dashboard'],
  ['Admin', '/admin/analytics'],
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`) || (href === '/student' && pathname.startsWith('/student'));
}

function accountPath(role?: UserRole): string {
  if (role === 'STUDENT') return '/student';
  if (role === 'SCHOOL_ADMIN' || role === 'TEACHER') return '/school/overview';
  if (role === 'PARENT') return '/parent/dashboard';
  if (role === 'SUPER_ADMIN') return '/admin/analytics';
  return '/';
}

export default function GlobalTopbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoggedIn, refreshToken, logout } = useAuthStore();
  const { lang, toggleLang } = useLanguageStore();

  async function handleLogout() {
    try {
      if (refreshToken) await apiLogout(refreshToken);
    } catch (_error: unknown) {}
    logout();
    router.replace('/login');
  }

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 1000, height: 66,
      background: 'rgba(255,255,255,0.98)', borderBottom: '2px solid #FF6B00',
      display: 'flex', alignItems: 'center', padding: '0 28px', gap: 18,
      boxShadow: '0 2px 10px rgba(13,27,62,0.06)',
    }}>
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#FF6B00,#FF9A3C)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 20 }}>🌉</div>
        <div style={{ fontFamily: "'Baloo 2',cursive", fontSize: 27, fontWeight: 800, color: '#0D1B3E', lineHeight: 1 }}>
          Vidya<span style={{ color: '#FF6B00' }}>Setu</span>
        </div>
      </Link>

      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, flex: 1, overflowX: 'auto' }}>
        {NAV.map(([label, href]) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} style={{
              textDecoration: 'none', whiteSpace: 'nowrap', padding: '10px 14px', borderRadius: 10,
              fontSize: 14, fontWeight: 700,
              color: active ? '#FF6B00' : '#5A6278',
              background: active ? '#FFF3E8' : 'transparent',
            }}>{label}</Link>
          );
        })}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#138808', fontSize: 13, fontWeight: 700 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#13A10E' }} /> Online
        </span>
        <button onClick={toggleLang} style={{ border: '1px solid #D9DEE8', background: '#fff', color: '#0D1B3E', padding: '8px 10px', borderRadius: 9, fontWeight: 700, cursor: 'pointer' }}>
          {lang === 'hi' ? 'EN' : 'हिंदी'}
        </button>
        {isLoggedIn ? (
          <>
            <button onClick={() => router.push(accountPath(user?.role))} title="Back to dashboard" style={{ border: 'none', background: '#F5F7FA', color: '#0D1B3E', padding: '8px 12px', borderRadius: 9, fontWeight: 700, cursor: 'pointer' }}>
              {user?.name?.split(' ')[0] || 'Account'}
            </button>
            <button onClick={handleLogout} style={{ border: '2px solid #FF6B00', background: '#fff', color: '#FF6B00', padding: '8px 16px', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>Logout</button>
          </>
        ) : (
          <>
            <button onClick={() => router.push('/login')} style={{ border: '2px solid #FF6B00', background: '#fff', color: '#FF6B00', padding: '8px 16px', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>Login</button>
            <button onClick={() => router.push('/register')} style={{ border: 'none', background: 'linear-gradient(135deg,#FF6B00,#FF9A3C)', color: '#fff', padding: '10px 16px', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>Join Free</button>
          </>
        )}
      </div>
    </header>
  );
}
