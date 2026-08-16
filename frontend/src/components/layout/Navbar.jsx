'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';
import { logout as apiLogout } from '@/services/authService';

const ROLE_LABEL = {
  STUDENT:      { en: 'Student', hi: 'छात्र' },
  SCHOOL_ADMIN: { en: 'School Admin', hi: 'विद्यालय प्रशासक' },
  PARENT:       { en: 'Parent', hi: 'अभिभावक' },
  SUPER_ADMIN:  { en: 'Super Admin', hi: 'सुपर एडमिन' },
};

const ROLE_ACCENT = {
  STUDENT:      'var(--saffron)',
  SCHOOL_ADMIN: 'var(--forest)',
  PARENT:       '#7B1FA2',
  SUPER_ADMIN:  '#1565C0',
};

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const { lang, toggleLang } = useLanguageStore();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    try { await apiLogout(); } catch (_) {}
    logout();
    router.replace('/login');
  };

  const roleInfo  = ROLE_LABEL[user?.role] || { en: '', hi: '' };
  const accent    = ROLE_ACCENT[user?.role] || 'var(--saffron)';
  const initial   = (user?.name || 'U')[0].toUpperCase();

  return (
    <nav style={{
      height: 62, background: 'var(--navy)', display: 'flex',
      alignItems: 'center', padding: '0 20px', gap: 12,
      borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0, zIndex: 100,
    }}>
      {/* Logo */}
      <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'linear-gradient(135deg,var(--saffron),var(--saffron-light))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Baloo 2',cursive", fontWeight: 800, color: 'white', fontSize: 15,
        }}>V</div>
        <span style={{ fontFamily: "'Baloo 2',cursive", fontWeight: 800, fontSize: '1.1rem', color: 'white' }}>
          VidyaSetu
        </span>
      </Link>

      {/* Role chip */}
      <div style={{
        marginLeft: 8, padding: '3px 10px', borderRadius: 20,
        background: `${accent}22`, border: `1px solid ${accent}55`,
        fontSize: '0.7rem', fontWeight: 700, color: accent, flexShrink: 0,
      }}>
        {lang === 'hi' ? roleInfo.hi : roleInfo.en}
      </div>

      <div style={{ flex: 1 }} />

      {/* Offline indicator */}
      <OfflineDot />

      {/* Lang toggle */}
      <button
        onClick={toggleLang}
        style={{
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8, padding: '4px 10px', color: 'white', fontSize: '0.75rem',
          fontWeight: 700, cursor: 'pointer', flexShrink: 0,
        }}
      >
        {lang === 'hi' ? 'EN' : 'हि'}
      </button>

      {/* User menu */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setMenuOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 10, padding: '5px 10px', cursor: 'pointer',
          }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: `linear-gradient(135deg,${accent},${accent}88)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 13, color: 'white',
          }}>{initial}</div>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'white', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.name?.split(' ')[0] || 'User'}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>▾</span>
        </button>

        {menuOpen && (
          <>
            <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
            <div style={{
              position: 'absolute', right: 0, top: 44, zIndex: 10, minWidth: 180,
              background: 'white', borderRadius: 12, boxShadow: 'var(--shadow-lg)',
              overflow: 'hidden', border: '1px solid var(--border)',
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--navy)' }}>{user?.name}</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--slate)', marginTop: 2 }}>{user?.mobile}</p>
              </div>
              <button
                onClick={handleLogout}
                style={{
                  width: '100%', padding: '11px 16px', background: 'none', border: 'none',
                  textAlign: 'left', cursor: 'pointer', fontSize: '0.875rem',
                  color: '#C62828', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                🚪 {lang === 'hi' ? 'लॉग आउट' : 'Log out'}
              </button>
            </div>
          </>
        )}
      </div>
    </nav>
  );
}

function OfflineDot() {
  const [online, setOnline] = useState(true);
  if (typeof window !== 'undefined') {
    window.addEventListener('online',  () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));
  }
  if (online) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#FFEBEE', borderRadius: 20, padding: '3px 10px' }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#C62828' }} />
      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#C62828' }}>Offline</span>
    </div>
  );
}
