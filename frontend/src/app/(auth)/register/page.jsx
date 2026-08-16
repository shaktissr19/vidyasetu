'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { sendOTP, verifyOTP, updateProfile } from '@/services/authService';
import useAuthStore from '@/store/authStore';
import { useRedirectIfLoggedIn } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

const LANGUAGES = [
  { code: 'hi', label: 'Hindi / हिंदी' },
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'Tamil / தமிழ்' },
  { code: 'te', label: 'Telugu / తెలుగు' },
  { code: 'mr', label: 'Marathi / मराठी' },
  { code: 'bn', label: 'Bengali / বাংলা' },
  { code: 'gu', label: 'Gujarati / ગુજરાતી' },
  { code: 'kn', label: 'Kannada / ಕನ್ನಡ' },
];

const CLASSES = ['5','6','7','8','9','10','11','12'];

export default function RegisterPage() {
  const params     = useSearchParams();
  const isComplete = params.get('complete') === '1'; // coming from first login
  useRedirectIfLoggedIn(); // skip if already fully set up

  const router     = useRouter();
  const { setAuth, updateUser, user } = useAuthStore();

  const [step, setStep]       = useState(isComplete ? 'profile' : 'mobile');
  const [loading, setLoading] = useState(false);
  const [form, setForm]       = useState({
    mobile:   '',
    otp:      '',
    name:     user?.name || '',
    class:    '8',
    school:   '',
    language: 'hi',
  });

  function set(field, val) { setForm(prev => ({ ...prev, [field]: val })); }

  async function handleSendOTP(e) {
    e.preventDefault();
    if (form.mobile.length !== 10) { toast.error('Enter a valid 10-digit mobile number'); return; }
    setLoading(true);
    try {
      const res = await sendOTP(form.mobile);
      toast.success('OTP sent!');
      if (res.data?.data?.otp) toast(`Dev OTP: ${res.data.data.otp}`, { duration: 10000, icon: '🔑' });
      setStep('otp');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to send OTP');
    } finally { setLoading(false); }
  }

  async function handleVerifyOTP(e) {
    e.preventDefault();
    if (form.otp.length !== 6) { toast.error('Enter the 6-digit OTP'); return; }
    setLoading(true);
    try {
      const res = await verifyOTP(form.mobile, form.otp);
      const { accessToken, refreshToken, user } = res.data.data;
      setAuth(user, accessToken, refreshToken);
      setStep('profile');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Invalid OTP');
    } finally { setLoading(false); }
  }

  async function handleCompleteProfile(e) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Please enter your name'); return; }
    setLoading(true);
    try {
      await updateProfile({ name: form.name, language: form.language });
      updateUser({ name: form.name, language: form.language });
      toast.success('Profile complete! Welcome to VidyaSetu 🎉');
      router.push('/dashboard');
    } catch (err) {
      toast.error('Failed to save profile');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--white)' }}>
      <div className="w-full max-w-[440px]">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
            style={{ background: 'linear-gradient(135deg, var(--saffron), var(--saffron-light))' }}>🌉</div>
          <span className="font-display font-extrabold text-xl" style={{ color: 'var(--navy)' }}>VidyaSetu</span>
        </div>

        <div className="card p-8">
          {/* Steps */}
          {!isComplete && (
            <div className="flex items-center gap-2 mb-6">
              {['mobile', 'otp', 'profile'].map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                    style={{
                      background: step === s ? 'var(--saffron)' : ['mobile','otp','profile'].indexOf(step) > i ? 'var(--forest)' : 'var(--border)',
                      color: step === s || ['mobile','otp','profile'].indexOf(step) > i ? 'white' : 'var(--slate)',
                    }}>
                    {['mobile','otp','profile'].indexOf(step) > i ? '✓' : i + 1}
                  </div>
                  {i < 2 && <div className="flex-1 h-0.5 w-8" style={{ background: ['mobile','otp','profile'].indexOf(step) > i ? 'var(--forest)' : 'var(--border)' }} />}
                </div>
              ))}
            </div>
          )}

          {step === 'mobile' && (
            <form onSubmit={handleSendOTP}>
              <h2 className="font-display font-extrabold text-2xl mb-1" style={{ color: 'var(--navy)' }}>Join Free 🎓</h2>
              <p className="text-sm mb-5" style={{ color: 'var(--slate)' }}>Start your learning journey today</p>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>Mobile Number</label>
              <div className="flex gap-2 mb-4">
                <div className="px-3 py-2.5 rounded-xl text-sm font-semibold flex-shrink-0"
                  style={{ background: '#F0F4F8', color: 'var(--navy)', border: '1.5px solid var(--border)' }}>+91</div>
                <input type="tel" maxLength={10} className="input flex-1" placeholder="10-digit mobile number"
                  value={form.mobile} onChange={e => set('mobile', e.target.value.replace(/\D/g, ''))} autoFocus />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
                {loading ? 'Sending...' : 'Get OTP →'}
              </button>
              <p className="text-center text-xs mt-4" style={{ color: 'var(--slate)' }}>
                Already registered?{' '}
                <button type="button" onClick={() => router.push('/login')} className="font-semibold" style={{ color: 'var(--saffron)' }}>Sign in</button>
              </p>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleVerifyOTP} className="animate-fade-up">
              <h2 className="font-display font-extrabold text-2xl mb-1" style={{ color: 'var(--navy)' }}>Verify OTP 🔑</h2>
              <p className="text-sm mb-5" style={{ color: 'var(--slate)' }}>Sent to +91-{form.mobile}</p>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>OTP</label>
              <input type="text" maxLength={6} className="input tracking-[0.3em] font-bold text-center text-xl mb-4"
                placeholder="• • • • • •" value={form.otp} onChange={e => set('otp', e.target.value.replace(/\D/g, ''))} autoFocus />
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
                {loading ? 'Verifying...' : 'Verify & Continue →'}
              </button>
              <button type="button" onClick={() => setStep('mobile')} className="w-full text-center text-xs mt-3" style={{ color: 'var(--saffron)' }}>
                ← Change number
              </button>
            </form>
          )}

          {step === 'profile' && (
            <form onSubmit={handleCompleteProfile} className="animate-fade-up">
              <h2 className="font-display font-extrabold text-2xl mb-1" style={{ color: 'var(--navy)' }}>
                {isComplete ? 'Complete Profile ✨' : 'Almost done! 🎉'}
              </h2>
              <p className="text-sm mb-5" style={{ color: 'var(--slate)' }}>Tell us a bit about yourself</p>

              <div className="mb-4">
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>Full Name</label>
                <input type="text" className="input" placeholder="Enter your full name"
                  value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>Class</label>
                <select className="input select" value={form.class} onChange={e => set('class', e.target.value)}>
                  {CLASSES.map(c => <option key={c} value={c}>Class {c}</option>)}
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>School Name</label>
                <input type="text" className="input" placeholder="Your school name"
                  value={form.school} onChange={e => set('school', e.target.value)} />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>Preferred Language / भाषा चुनें</label>
                <select className="input select" value={form.language} onChange={e => set('language', e.target.value)}>
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3 text-base">
                {loading ? 'Saving...' : 'Start Learning Free 🚀'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
