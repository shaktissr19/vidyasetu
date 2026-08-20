import { Suspense } from 'react';
import GlobalTopbar from '@/components/layout/GlobalTopbar';

function AuthLoading() {
  return (
    <div className="min-h-[calc(100vh-66px)] flex items-center justify-center" style={{ background: 'var(--white)' }}>
      <div className="text-sm font-semibold" style={{ color: 'var(--slate)' }}>Loading VidyaSetu…</div>
    </div>
  );
}

export default function AuthLayout({ children }) {
  return (
    <>
      <GlobalTopbar />
      <Suspense fallback={<AuthLoading />}>{children}</Suspense>
    </>
  );
}
