'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import type { UserRole } from '@vidyasetu/contracts';
import {
  loginWithPassword,
  sendOTP,
  verifyOTP,
  forgotPassword,
  resetPassword,
  type AuthSessionPayload,
} from '@/services/authService';
import useAuthStore from '@/store/authStore';
import { useRedirectIfLoggedIn } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

const ROLES: Array<{ key: UserRole; label: string }> = [
  { key: 'STUDENT', label: '🎓 Student' },
  { key: 'PARENT', label: '👩 Parent' },
  { key: 'SCHOOL_ADMIN', label: '🏫 School' },
  { key: 'TEACHER', label: '👩‍🏫 Teacher' },
  { key: 'SUPER_ADMIN', label: '⚙️ Platform Admin' },
];

const ROLE_DASHBOARDS: Record<UserRole, string> = {
  STUDENT: '/student',
  SCHOOL_ADMIN: '/school/overview',
  TEACHER: '/school/overview',
  PARENT: '/parent/dashboard',
  SUPER_ADMIN: '/admin/analytics',
};

const ROLE_PUBLIC_PATHS: Record<UserRole, string> = {
  STUDENT: '/for-students',
  SCHOOL_ADMIN: '/for-schools',
  TEACHER: '/for-schools',
  PARENT: '/for-parents',
  SUPER_ADMIN: '/platform-admin',
};

const ROLE_INTRO: Record<UserRole, {
  title: string;
  accent: string;
  copy: string;
  cards: Array<[string, string]>;
}> = {
  STUDENT: {
    title: 'Learning and school progress',
    accent: 'in one student workspace',
    copy: 'Sign in to your learning content, school-linked identity, attendance, report cards, competitions, doubts, offline resources and progress tools.',
    cards: [
      ['Student ID', 'Permanent VidyaSetu identity'],
      ['Learning', 'Subjects, content and doubts'],
      ['School Records', 'Attendance and report cards'],
      ['Participation', 'Competitions, XP and Groups'],
    ],
  },
  PARENT: {
    title: 'Your child’s school journey',
    accent: 'visible in one parent workspace',
    copy: 'Sign in to linked children, performance, attendance, report cards, fees, teacher messages, notifications and moderated Parent Groups.',
    cards: [
      ['Children', 'Switch between linked children'],
      ['Progress', 'Performance and report cards'],
      ['Attendance', 'School-record visibility'],
      ['Communication', 'Teacher messages and Groups'],
    ],
  },
  SCHOOL_ADMIN: {
    title: 'School academics and operations',
    accent: 'from one administration workspace',
    copy: 'Sign in to manage students, classes, teachers, enrollment requests, attendance, fees, timetables, exams, results and announcements.',
    cards: [
      ['Students', 'Roster and enrollment workflows'],
      ['Teachers', 'Staff and assignments'],
      ['Operations', 'Attendance, fees and timetable'],
      ['Academics', 'Exams, results and announcements'],
    ],
  },
  TEACHER: {
    title: 'Teaching context and school workflows',
    accent: 'inside the School workspace',
    copy: 'Teacher access uses the School workspace with role-aware permissions for assigned academic and operational activities.',
    cards: [
      ['Assignments', 'Class and subject context'],
      ['Attendance', 'Class roster workflows'],
      ['Academics', 'School exam context'],
      ['Communication', 'School-linked information'],
    ],
  },
  SUPER_ADMIN: {
    title: 'VidyaSetu network governance',
    accent: 'for authorised Platform Admins',
    copy: 'Sign in to platform analytics, schools, users, content, revenue, support, configuration, competitions and Group governance.',
    cards: [
      ['Analytics', 'Platform-level visibility'],
      ['Governance', 'Schools, users and Groups'],
      ['Operations', 'Support and configuration'],
      ['Platform', 'Content and competitions'],
    ],
  },
};

interface SearchParamsLike {
  get: (name: string) => string | null;
}

interface RoleMismatchError extends Error {
  roleMismatch?: boolean;
}

function roleFromParam(params: SearchParamsLike): UserRole {
  const value = params.get('role');
  if (value === 'school') return 'SCHOOL_ADMIN';
  if (value === 'teacher') return 'TEACHER';
  if (value === 'parent') return 'PARENT';
  if (value === 'admin') return 'SUPER_ADMIN';
  return 'STUDENT';
}

function errorText(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: { message?: string } } | undefined;
    return data?.error?.message || fallback;
  }
  return err instanceof Error ? err.message || fallback : fallback;
}

function isRoleMismatchError(err: unknown): err is RoleMismatchError {
  return err instanceof Error && 'roleMismatch' in err;
}

export default function LoginPage() {
  useRedirectIfLoggedIn();
  const params = useSearchParams();
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const [role, setRole] = useState<UserRole>(() => roleFromParam(params));
  const [method, setMethod] = useState<'password' | 'otp'>('password');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const [recoveryOtp, setRecoveryOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const intro = ROLE_INTRO[role];
  const identifierLabel = role === 'STUDENT' ? 'Username / Email / Student ID' : 'Username / Email';
  const identifierPlaceholder = role === 'STUDENT' ? 'aarav.sharma or VS26-0100001' : 'username or email';

  function completeLogin(payload: AuthSessionPayload) {
    const { accessToken, refreshToken, user } = payload;
    if (user.role !== role) {
      throw Object.assign(new Error(`This account is registered as ${user.role.replaceAll('_', ' ').toLowerCase()}. Select the matching login tab.`), { roleMismatch: true });
    }
    setAuth(user, accessToken, refreshToken);
    toast.success(`Welcome back, ${user.name?.split(' ')[0] || 'User'}! 👋`);
    router.replace(ROLE_DASHBOARDS[user.role] || '/');
  }

  async function handlePasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (identifier.trim().length < 3 || !password) return toast.error(`Enter your ${identifierLabel.toLowerCase()} and password`);
    setLoading(true);
    try {
      const response = await loginWithPassword(identifier.trim(), password, navigator.userAgent);
      completeLogin(response.data.data);
    } catch (err: unknown) {
      toast.error(isRoleMismatchError(err) && err.roleMismatch ? err.message : errorText(err, 'Login failed'));
    } finally { setLoading(false); }
  }

  async function handleSendOTP(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (mobile.length !== 10) return toast.error('Enter a valid 10-digit mobile number');
    setLoading(true);
    try {
      const response = await sendOTP(mobile);
      setOtpSent(true);
      toast.success(`OTP sent to +91-${mobile}`);
      if (response.data?.data?.otp) toast(`Dev OTP: ${response.data.data.otp}`, { duration: 10000, icon: '🔑' });
    } catch (err: unknown) {
      toast.error(errorText(err, 'Failed to send OTP'));
    } finally { setLoading(false); }
  }

  async function handleVerifyOTP(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (otp.length !== 6) return toast.error('Enter the 6-digit OTP');
    setLoading(true);
    try {
      const response = await verifyOTP(mobile, otp, navigator.userAgent, role);
      const payload = response.data.data;
      if (payload.isNewUser && role === 'STUDENT') {
        setAuth(payload.user, payload.accessToken, payload.refreshToken);
        router.replace('/register?complete=1');
        return;
      }
      completeLogin(payload);
    } catch (err: unknown) {
      toast.error(isRoleMismatchError(err) && err.roleMismatch ? err.message : errorText(err, 'Invalid OTP'));
    } finally { setLoading(false); }
  }

  async function handleRecoverySend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (identifier.trim().length < 3) return toast.error(`Enter your ${identifierLabel.toLowerCase()} first`);
    setLoading(true);
    try {
      const response = await forgotPassword(identifier.trim());
      setRecoverySent(true);
      toast.success(`Recovery OTP sent to ${response.data?.data?.maskedMobile || 'your registered mobile'}`);
      if (response.data?.data?.otp) toast(`Dev OTP: ${response.data.data.otp}`, { duration: 10000, icon: '🔑' });
    } catch (err: unknown) {
      toast.error(errorText(err, 'Could not start password recovery'));
    } finally { setLoading(false); }
  }

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      await resetPassword(identifier.trim(), recoveryOtp, newPassword);
      toast.success('Password reset successfully. Sign in with your new password.');
      setRecovery(false);
      setRecoverySent(false);
      setRecoveryOtp('');
      setPassword('');
      setNewPassword('');
    } catch (err: unknown) {
      toast.error(errorText(err, 'Password reset failed'));
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-[calc(100vh-66px)] flex" style={{ background: 'var(--white)' }}>
      <div className="hidden lg:flex flex-col justify-between w-[42%] p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 60%, #1A3A6E 100%)' }}>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-extrabold text-white" style={{ background: 'linear-gradient(135deg,var(--saffron),var(--saffron-light))' }}>V</div>
            <span className="font-display font-extrabold text-2xl text-white">VidyaSetu</span>
          </div>
          <h1 className="font-display font-extrabold text-4xl text-white leading-tight mb-4">
            {intro.title}<br /><span style={{ color: 'var(--saffron-light)' }}>{intro.accent}</span>
          </h1>
          <p className="text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.68)' }}>{intro.copy}</p>
          <button
            onClick={() => router.push(ROLE_PUBLIC_PATHS[role])}
            className="mt-5 text-sm font-bold"
            style={{ color: 'var(--saffron-light)', background: 'transparent', border: 0, cursor: 'pointer' }}
          >
            Learn what this module includes
          </button>
        </div>
        <div className="relative z-10 grid grid-cols-2 gap-4">
          {intro.cards.map(([name, label]) => (
            <div key={name} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <div className="font-display font-extrabold text-lg text-white">{name}</div>
              <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[470px]">
          <h2 className="font-display font-extrabold text-3xl mb-1" style={{ color: 'var(--navy)' }}>Welcome back</h2>
          <p className="text-sm mb-5" style={{ color: 'var(--slate)' }}>Choose your account type and sign-in method.</p>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 p-1 rounded-xl mb-4" style={{ background: 'var(--saffron-pale)' }}>
            {ROLES.map((item) => (
              <button key={item.key} onClick={() => setRole(item.key)} className="py-2 px-1 rounded-lg text-xs font-bold"
                style={{ background: role === item.key ? 'white' : 'transparent', color: role === item.key ? 'var(--saffron)' : 'var(--slate)', boxShadow: role === item.key ? '0 2px 8px rgba(255,107,0,.15)' : 'none' }}>
                {item.label}
              </button>
            ))}
          </div>

          {!recovery && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl mb-5" style={{ background: '#F0F4F8' }}>
              <button onClick={() => setMethod('password')} className="py-2 rounded-lg text-sm font-bold"
                style={{ background: method === 'password' ? 'white' : 'transparent', color: method === 'password' ? 'var(--navy)' : 'var(--slate)', boxShadow: method === 'password' ? '0 2px 7px rgba(13,27,62,.08)' : 'none' }}>
                Password Login
              </button>
              <button onClick={() => setMethod('otp')} className="py-2 rounded-lg text-sm font-bold"
                style={{ background: method === 'otp' ? 'white' : 'transparent', color: method === 'otp' ? 'var(--navy)' : 'var(--slate)', boxShadow: method === 'otp' ? '0 2px 7px rgba(13,27,62,.08)' : 'none' }}>
                OTP Login
              </button>
            </div>
          )}

          {recovery ? (
            <form onSubmit={recoverySent ? handleReset : handleRecoverySend}>
              <h3 className="font-display font-bold text-xl mb-1" style={{ color: 'var(--navy)' }}>Reset password</h3>
              <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>We will verify the registered mobile number with OTP.</p>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>{identifierLabel}</label>
              <input className="input mb-4" value={identifier} onChange={(e) => setIdentifier(e.target.value)} disabled={recoverySent} placeholder={identifierPlaceholder} />
              {recoverySent && (
                <>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>Recovery OTP</label>
                  <input className="input mb-4 text-center tracking-[0.3em] font-bold" maxLength={6} value={recoveryOtp} onChange={(e) => setRecoveryOtp(e.target.value.replace(/\D/g, ''))} placeholder="6-digit OTP" />
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>New password</label>
                  <input className="input mb-4" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="8+ characters with a letter and number" />
                </>
              )}
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">{loading ? 'Please wait…' : recoverySent ? 'Reset Password' : 'Send Recovery OTP'}</button>
              <button type="button" className="w-full text-center text-xs mt-3" style={{ color: 'var(--saffron)' }} onClick={() => { setRecovery(false); setRecoverySent(false); }}>Back to login</button>
            </form>
          ) : method === 'password' ? (
            <form onSubmit={handlePasswordLogin}>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>{identifierLabel}</label>
              <input className="input mb-4" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={identifierPlaceholder} autoFocus />
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-semibold" style={{ color: 'var(--navy)' }}>Password</label>
                <button type="button" onClick={() => setRecovery(true)} className="text-xs font-semibold" style={{ color: 'var(--saffron)' }}>Forgot password?</button>
              </div>
              <input className="input mb-4" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3 text-base">{loading ? 'Signing in…' : 'Sign In'}</button>
            </form>
          ) : (
            <form onSubmit={otpSent ? handleVerifyOTP : handleSendOTP}>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>Registered Mobile Number</label>
              <div className="flex gap-2 mb-4">
                <div className="px-3 py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#F0F4F8', border: '1.5px solid var(--border)' }}>+91</div>
                <input type="tel" maxLength={10} className="input flex-1" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} disabled={otpSent} placeholder="10-digit mobile number" />
              </div>
              {otpSent && (
                <input className="input mb-4 text-center tracking-[0.3em] font-bold" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="6-digit OTP" autoFocus />
              )}
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">{loading ? 'Please wait…' : otpSent ? 'Verify & Login' : 'Send OTP'}</button>
              {otpSent && <button type="button" className="w-full text-center text-xs mt-3" style={{ color: 'var(--saffron)' }} onClick={() => { setOtpSent(false); setOtp(''); }}>Change number</button>}
            </form>
          )}

          {role === 'STUDENT' && !recovery && (
            <p className="text-center text-xs mt-5" style={{ color: 'var(--slate)' }}>
              New student? <button onClick={() => router.push('/register')} className="font-semibold" style={{ color: 'var(--saffron)' }}>Create Student account</button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
