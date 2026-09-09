import type { ReactNode } from 'react';
import GlobalTopbar from '@/components/layout/GlobalTopbar';

export default function NotificationCenterLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: '#F7F8FA' }}>
      <GlobalTopbar />
      {children}
    </div>
  );
}
