import { Suspense } from 'react';

function AuthLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--white)' }}>
      <div className="text-sm font-semibold" style={{ color: 'var(--slate)' }}>Loading VidyaSetu…</div>
    </div>
  );
}

export default function AuthLayout({ children }) {
  return <Suspense fallback={<AuthLoading />}>{children}</Suspense>;
}
