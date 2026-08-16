'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useAuthStore from '@/store/authStore';

export default function DashSidebar({ menuItems = [], accentColor = 'var(--saffron)', profile = {} }) {
  const { user } = useAuthStore();
  const pathname = usePathname();

  return (
    <aside className="dash-sidebar" style={{ position: 'relative' }}>
      <div style={{ padding: '4px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${accentColor}33`, border: `1.5px solid ${accentColor}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
          }}>{profile.avatar || '👤'}</div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile.name || user?.name || 'User'}
            </p>
            <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
              {profile.subtitle || ''}
            </p>
          </div>
        </div>
        {profile.badge && (
          <div style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 20,
            background: `${accentColor}22`, border: `1px solid ${accentColor}44`,
            fontSize: '0.65rem', fontWeight: 700, color: accentColor,
          }}>{profile.badge}</div>
        )}
      </div>
      <nav style={{ marginTop: 8, paddingBottom: 40 }}>
        {menuItems.map(({ href, icon, label, exact }) => {
          const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');
          return (
            <Link key={href} href={href} className={`sidebar-link${isActive ? ' active' : ''}`}
              style={{ borderLeftColor: isActive ? accentColor : 'transparent' }}>
              <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>
              <span style={{ flex: 1 }}>{label}</span>
              {isActive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />}
            </Link>
          );
        })}
      </nav>
      <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center' }}>
        <p style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)' }}>vidyasetu.sbs · v1.0</p>
      </div>
    </aside>
  );
}
