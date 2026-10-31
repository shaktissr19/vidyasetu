'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import toast from 'react-hot-toast';
import { HERO_IMAGES } from '@/components/public/heroAssets';
import useAuthStore from '@/store/authStore';
import { useRedirectIfLoggedIn } from '@/hooks/useAuth';
import {
  startPlatformAdminLogin,
  verifyPlatformAdminLogin,
  type AuthSessionPayload,
  type PlatformAdminLoginChallenge,
} from '@/services/authService';

function responseMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as { error?: { message?: string } } | undefined;
    return body?.error?.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

export default function PlatformAdminLoginPage() {
  useRedirectIfLoggedIn();
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [challenge, setChallenge] = useState<PlatformAdminLoginChallenge | null>(null);
  const [loading, setLoading] = useState(false);

  async function startLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (identifier.trim().length < 3 || password.length === 0) {
      toast.error('Enter your administrator username or email and password.');
      return;
    }
    setLoading(true);
    try {
      const response = await startPlatformAdminLogin(identifier.trim(), password);
      const nextChallenge = response.data.data;
      setChallenge(nextChallenge);
      setOtp('');
      toast.success(`Verification code sent to ${nextChallenge.maskedMobile}.`);
      if (nextChallenge.otp) toast(`Development OTP: ${nextChallenge.otp}`, { duration: 10000, icon: '🔑' });
    } catch (error: unknown) {
      toast.error(responseMessage(error, 'Could not start administrator sign-in.'));
    } finally {
      setLoading(false);
    }
  }

  async function finishLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge || otp.length !== 6) {
      toast.error('Enter the six-digit verification code.');
      return;
    }
    setLoading(true);
    try {
      const response = await verifyPlatformAdminLogin(challenge.challengeId, otp, navigator.userAgent);
      const session: AuthSessionPayload = response.data.data;
      if (!['PLATFORM_ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
        throw new Error('This account is not authorized for the platform administrator workspace.');
      }
      setAuth(session.user, session.accessToken, session.refreshToken);
      toast.success(`Welcome back, ${session.user.name?.split(' ')[0] || 'Administrator'}.`);
      router.replace('/admin/analytics');
    } catch (error: unknown) {
      toast.error(responseMessage(error, 'Verification failed. Check the code and try again.'));
    } finally {
      setLoading(false);
    }
  }

  function restart() {
    setChallenge(null);
    setOtp('');
  }

  return (
    <main className="min-h-[calc(100vh-66px)] flex" style={{ background: 'var(--page-bg)' }}>
      <section
        className="hidden lg:flex w-[52%] xl:w-3/5 flex-col justify-between p-8 xl:p-12 text-white"
        style={{
          backgroundImage: `linear-gradient(180deg,rgba(6,24,51,.18),rgba(8,28,58,.88)),url('${HERO_IMAGES.admin}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
        aria-label="VidyaSetu platform administration"
      >
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-extrabold" style={{ background: 'var(--saffron)' }}>V</span>
          <span className="font-display font-extrabold text-2xl">VidyaSetu</span>
        </div>
        <div className="max-w-xl">
          <p className="text-sm font-bold tracking-[.16em] uppercase mb-3" style={{ color: 'var(--saffron-light)' }}>Authorized platform access</p>
          <h1 className="font-display font-extrabold text-4xl leading-tight mb-4">Platform governance<br />and operations</h1>
          <p className="text-base leading-relaxed text-white/85">Administrator access is verified against your assigned platform role and permissions.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['Platform Admin', 'Access only the areas granted to your account'],
            ['Super Admin', 'Manage platform ownership and administrator access'],
          ].map(([title, description]) => (
            <div key={title} className="rounded-2xl p-4" style={{ background: 'rgba(8,30,61,.72)', border: '1px solid rgba(255,255,255,.2)' }}>
              <h2 className="font-display font-bold text-lg">{title}</h2>
              <p className="text-sm mt-1 text-white/75">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="w-full lg:w-[48%] xl:w-2/5 flex items-center justify-center p-5 sm:p-8" style={{ background: 'var(--surface)' }}>
        <div className="w-full max-w-[470px]">
          <p className="text-sm font-extrabold tracking-[.14em] uppercase mb-2" style={{ color: 'var(--saffron)' }}>VidyaSetu administrators</p>
          <h2 className="font-display font-extrabold text-3xl mb-2" style={{ color: 'var(--navy)' }}>Secure sign in</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>
            Sign in with your administrator credentials, then verify the code sent to your registered mobile.
          </p>

          {challenge ? (
            <form onSubmit={finishLogin}>
              <div className="rounded-xl p-4 mb-5" style={{ background: 'var(--saffron-pale)', border: '1px solid var(--border)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--navy)' }}>Verification code sent to {challenge.maskedMobile}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>The code expires after 10 minutes and can only complete this sign-in attempt.</p>
              </div>
              <label htmlFor="platform-admin-otp" className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>Six-digit verification code</label>
              <input
                id="platform-admin-otp"
                className="input mb-4 text-center tracking-[.3em] font-bold"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
              />
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3 text-base">
                {loading ? 'Verifying…' : 'Verify and sign in'}
              </button>
              <button type="button" onClick={restart} disabled={loading} className="w-full text-center text-sm font-semibold mt-4" style={{ color: 'var(--saffron)' }}>
                Start again with password
              </button>
            </form>
          ) : (
            <form onSubmit={startLogin}>
              <label htmlFor="platform-admin-identifier" className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>Username or email</label>
              <input
                id="platform-admin-identifier"
                className="input mb-4"
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="Administrator username or email"
                autoFocus
              />
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="platform-admin-password" className="text-sm font-semibold" style={{ color: 'var(--navy)' }}>Password</label>
                <span className="text-xs" style={{ color: 'var(--slate)' }}>Need a reset? Contact the account owner.</span>
              </div>
              <input
                id="platform-admin-password"
                className="input mb-5"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
              />
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3 text-base">
                {loading ? 'Checking credentials…' : 'Continue'}
              </button>
            </form>
          )}

          <p className="text-center text-xs mt-6" style={{ color: 'var(--slate)' }}>
            VidyaSetu users? <a href="/login" className="font-bold" style={{ color: 'var(--saffron)' }}>Go to regular sign in</a>
          </p>
        </div>
      </section>
    </main>
  );
}
