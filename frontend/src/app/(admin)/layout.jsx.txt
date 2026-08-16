'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import DashSidebar from '@/components/layout/DashSidebar';
import useAuthStore from '@/store/authStore';

const MENU = [
  { href: '/admin/analytics',    icon: '📊', label: 'Analytics',    exact: true },
  { href: '/admin/schools',      icon: '🏫', label: 'Schools'      },
  { href: '/admin/users',        icon: '👥', label: 'Users'        },
  { href: '/admin/competitions', icon: '🏆', label: 'Competitions' },
  { href: '/admin/content',      icon: '📚', label: 'Content'      },
  { href: '/admin/revenue',      icon: '💰', label: 'Revenue'      },
  { href: '/admin/support',      icon: '🎧', label: 'Support'      },
  { href: '/admin/settings',     icon: '⚙️', label: 'Settings'     },
];

export default function AdminLayout({ children }) {
  const { isLoggedIn, user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn) { router.replace('/login'); return; }
    if (user?.role && user.role !== 'SUPER_ADMIN') router.replace('/login');
  }, [isLoggedIn, user, router]);

  if (!isLoggedIn) return null;

  return (
    <div className="flex flex-col min-h-screen" style={{ paddingTop: 62 }}>
      <Navbar />
      <div className="dash-layout">
        <DashSidebar
          accentColor="#4FC3F7"
          profile={{ avatar: '⚙️', name: user?.name || 'Super Admin', subtitle: 'Platform Control', badge: '🔐 Admin' }}
          menuItems={MENU}
        />
        <main className="dash-main" style={{ background: '#080F24' }}>{children}</main>
      </div>
    </div>
  );
}
