'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { sendOTP, verifyOTP } from '@/services/authService';
import useAuthStore from '@/store/authStore';
import { useRedirectIfLoggedIn } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

const ROLES = [
  { key: 'STUDENT',      label: '🎓 Student',  hi: 'छात्र'  },
  { key: 'PARENT',       label: '👩 Parent',   hi: 'अभिभावक' },
  { key: 'SCHOOL_ADMIN', label: '🏫 School',   hi: 'विद्यालय' },
  { key: 'SUPER_ADMIN',  label: '⚙️ Admin',   hi: 'एडमिन'  },
];

const ROLE_DASHBOARDS = {
  STUDENT:      '/student',
  SCHOOL_ADMIN: '/school/overview',
  PARENT:       '/parent/dashboard',
  SUPER_ADMIN:  '/admin/analytics',
};

export default function LoginPage() {
  useRedirectIfLoggedIn();
  const params     = useSearchParams();
  const router     = useRouter();
  const { setAuth } = useAuthStore();

  const [step,   setStep]   = useState('mobile'); // 'mobile' | 'otp'
  const [mobile, setMobile] = useState('');
  const [otp,    setOtp]    = useState('');
  const [loading, setLoading] = useState(false);
  const [role,   setRole]   = useState(params.get('role') === 'school' ? 'SCHOOL_ADMIN' : 'STUDENT');

  async function handleSendOTP(e) {
    e.preventDefault();
    if (mobile.length !== 10) { toast.error('Enter a valid 10-digit mobile number'); return; }
    setLoading(true);
    try {
      const res = await sendOTP(mobile);
      toast.success('OTP sent to +91-' + mobile);
      setStep('otp');
      // Dev mode: show OTP
      if (res.data?.data?.otp) toast(`Dev OTP: ${res.data.data.otp}`, { duration: 10000, icon: '🔑' });
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to send OTP');
    } finally { setLoading(false); }
  }

  async function handleVerifyOTP(e) {
    e.preventDefault();
    if (otp.length !== 6) { toast.error('Enter the 6-digit OTP'); return; }
    setLoading(true);
    try {
      const res = await verifyOTP(mobile, otp);
      const { accessToken, refreshToken, user } = res.data.data;
      setAuth(user, accessToken, refreshToken);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}! 👋`);

      // If new user, go to complete profile first
      if (res.data.data.isNewUser) {
        router.push('/register?complete=1');
      } else {
        router.push(ROLE_DASHBOARDS[user.role] || '/student');
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Invalid OTP');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--white)' }}>
      {/* Left panel — decorative */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 60%, #1A3A6E 100%)' }}>
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, var(--saffron), transparent)', transform: 'translate(30%, -30%)' }} />
        <div className="absolute bottom-0 left-0 w-56 h-56 rounded-full opacity-8"
          style={{ background: 'radial-gradient(circle, var(--forest), transparent)', transform: 'translate(-30%, 30%)' }} />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
              style={{ background: 'linear-gradient(135deg, var(--saffron), var(--saffron-light))' }}>🌉</div>
            <span className="font-display font-extrabold text-2xl text-white">VidyaSetu</span>
          </div>
          <h1 className="font-display font-extrabold text-4xl text-white leading-tight mb-4">
            Bharat ke har<br /><span style={{ color: 'var(--saffron-light)' }}>student</span> ke liye
          </h1>
          <p className="text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
            India's rural education OS. Learn NCERT, compete in Olympiads, win scholarships. Works offline in Hindi and 8 regional languages.
          </p>
        </div>

        {/* Stats */}
        <div className="relative z-10 grid grid-cols-2 gap-4">
          {[['1.2L+', 'Students learning'], ['3,412', 'Schools onboarded'], ['₹5L', 'Monthly prize pool'], ['9', 'Regional languages']].map(([n, l]) => (
            <div key={n} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <div className="font-display font-extrabold text-2xl text-white">{n}</div>
              <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-[400px]">
          {/* Logo (mobile) */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
              style={{ background: 'linear-gradient(135deg, var(--saffron), var(--saffron-light))' }}>🌉</div>
            <span className="font-display font-extrabold text-xl" style={{ color: 'var(--navy)' }}>VidyaSetu</span>
          </div>

          <h2 className="font-display font-extrabold text-3xl mb-1" style={{ color: 'var(--navy)' }}>
            Welcome back! 👋
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>
            No password needed — sign in with OTP
          </p>

          {/* Role tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl mb-6" style={{ background: 'var(--saffron-pale)' }}>
            {ROLES.map((r) => (
              <button key={r.key} onClick={() => setRole(r.key)}
                className="py-2 px-1 rounded-lg text-xs font-bold transition-all"
                style={{
                  background: role === r.key ? 'white' : 'transparent',
                  color:      role === r.key ? 'var(--saffron)' : 'var(--slate)',
                  boxShadow:  role === r.key ? '0 2px 8px rgba(255,107,0,0.15)' : 'none',
                }}>
                {r.label}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={step === 'mobile' ? handleSendOTP : handleVerifyOTP}>
            {/* Mobile */}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>
                Mobile Number
              </label>
              <div className="flex gap-2">
                <div className="px-3 py-2.5 rounded-xl text-sm font-semibold flex-shrink-0"
                  style={{ background: '#F0F4F8', color: 'var(--navy)', border: '1.5px solid var(--border)' }}>
                  +91
                </div>
                <input
                  type="tel" maxLength={10} value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                  placeholder="10-digit mobile number"
                  className="input flex-1" disabled={step === 'otp'}
                  autoFocus
                />
              </div>
            </div>

            {/* OTP */}
            {step === 'otp' && (
              <div className="mb-4 animate-fade-up">
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>
                  OTP <span className="font-normal text-xs" style={{ color: 'var(--slate)' }}>
                    (sent to +91-{mobile})
                  </span>
                </label>
                <input
                  type="text" maxLength={6} value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit OTP"
                  className="input tracking-[0.3em] font-bold text-center text-lg"
                  autoFocus
                />
                <button type="button" onClick={() => { setStep('mobile'); setOtp(''); }}
                  className="mt-2 text-xs" style={{ color: 'var(--saffron)' }}>
                  ← Change number
                </button>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="btn-primary w-full justify-center py-3 text-base mt-2"
              style={{ opacity: loading ? 0.7 : 1 }}>
              {loading
                ? (step === 'mobile' ? 'Sending...' : 'Verifying...')
                : (step === 'mobile' ? 'Send OTP →' : 'Verify & Login →')}
            </button>
          </form>

          <p className="text-center text-xs mt-4" style={{ color: 'var(--slate)' }}>
            New student?{' '}
            <button onClick={() => router.push('/register')}
              className="font-semibold" style={{ color: 'var(--saffron)' }}>
              Join VidyaSetu free
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
