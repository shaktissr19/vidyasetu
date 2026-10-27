'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import DashSidebar, { type SidebarMenuItem, type SidebarProfile } from '@/components/layout/DashSidebar';

interface ResponsiveDashboardShellProps {
  children: ReactNode;
  menuItems: readonly SidebarMenuItem[];
  profile: SidebarProfile;
  accentColor?: string;
  shellClassName?: string;
  mainClassName?: string;
  menuLabel?: string;
}

export default function ResponsiveDashboardShell({
  children,
  menuItems,
  profile,
  accentColor,
  shellClassName = '',
  mainClassName = '',
  menuLabel = 'Open navigation menu',
}: ResponsiveDashboardShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  return (
    <div className={`responsive-dashboard-shell flex flex-col min-h-screen ${shellClassName}`.trim()}>
      <GlobalTopbar />
      <div className="dash-layout">
        <DashSidebar
          id="role-navigation"
          className={menuOpen ? 'role-sidebar-open' : ''}
          onNavigate={() => setMenuOpen(false)}
          accentColor={accentColor}
          profile={profile}
          menuItems={menuItems}
        />
        <main className={`dash-main ${mainClassName}`.trim()}>
          <div className="role-mobile-toolbar">
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls="role-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? 'Close menu' : `☰ ${menuLabel}`}
            </button>
          </div>
          {menuOpen && (
            <button
              type="button"
              className="role-mobile-backdrop"
              aria-label="Close navigation menu"
              onClick={() => setMenuOpen(false)}
            />
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
