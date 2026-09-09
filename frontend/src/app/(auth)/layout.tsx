import type { ReactNode } from 'react';
import { Suspense } from 'react';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import SessionExpiryNotice from '@/components/auth/SessionExpiryNotice';

function AuthLoading() {
  return (
    <div className="min-h-[calc(100vh-66px)] flex items-center justify-center" style={{ background: 'var(--white)' }}>
      <div className="text-sm font-semibold" style={{ color: 'var(--slate)' }}>Loading VidyaSetu…</div>
    </div>
  );
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <GlobalTopbar />
      <SessionExpiryNotice />
      <Suspense fallback={<AuthLoading />}>{children}</Suspense>
    </>
  );
}
