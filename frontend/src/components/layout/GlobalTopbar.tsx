'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { UserRole } from '@vidyasetu/contracts';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';
import { logout as apiLogout } from '@/services/authService';

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
      position: 'sticky', top: 0, zIndex: 1000, minHeight: 66,
      background: 'rgba(255,255,255,0.98)', borderBottom: '2px solid #FF6B00',
      display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14,
      boxShadow: '0 2px 10px rgba(13,27,62,0.06)',
    }}>
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#FF6B00,#FF9A3C)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 20 }}>V</div>
        <div style={{ fontFamily: "'Baloo 2',cursive", fontSize: 27, fontWeight: 800, color: '#0D1B3E', lineHeight: 1 }}>
          Vidya<span style={{ color: '#FF6B00' }}>Setu</span>
        </div>
      </Link>

      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, flex: 1, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {NAV.map(([label, href]) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} style={{
              textDecoration: 'none', whiteSpace: 'nowrap', padding: '9px 10px', borderRadius: 10,
              fontSize: 13, fontWeight: 700,
              color: active ? '#FF6B00' : '#5A6278',
              background: active ? '#FFF3E8' : 'transparent',
            }}>{label}</Link>
          );
        })}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button onClick={toggleLang} style={{ border: '1px solid #D9DEE8', background: '#fff', color: '#0D1B3E', padding: '8px 10px', borderRadius: 9, fontWeight: 700, cursor: 'pointer' }}>
          {lang === 'hi' ? 'EN' : 'हिंदी'}
        </button>
        {isLoggedIn ? (
          <>
            <button onClick={() => router.push(accountPath(user?.role))} title="Open your dashboard" style={{ border: 'none', background: '#F5F7FA', color: '#0D1B3E', padding: '8px 12px', borderRadius: 9, fontWeight: 700, cursor: 'pointer' }}>
              My Dashboard
            </button>
            <button onClick={handleLogout} style={{ border: '2px solid #FF6B00', background: '#fff', color: '#FF6B00', padding: '8px 14px', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>Logout</button>
          </>
        ) : (
          <>
            <button onClick={() => router.push('/login')} style={{ border: '2px solid #FF6B00', background: '#fff', color: '#FF6B00', padding: '8px 14px', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>Login</button>
            <button onClick={() => router.push('/register')} style={{ border: 'none', background: 'linear-gradient(135deg,#FF6B00,#FF9A3C)', color: '#fff', padding: '10px 15px', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>Create Account</button>
          </>
        )}
      </div>
    </header>
  );
}
