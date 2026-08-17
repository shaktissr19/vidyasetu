'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { sendOTP, verifyOTP } from '@/services/authService';
import {
  completeStudentProfile,
  getProfileSetupOptions,
  getProfileStatus,
} from '@/services/studentService';
import useAuthStore from '@/store/authStore';
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
  { code: 'or', label: 'Odia / ଓଡ଼ିଆ' },
];

const ROLE_DASHBOARDS = {
  STUDENT: '/student',
  SCHOOL_ADMIN: '/school/overview',
  PARENT: '/parent/dashboard',
  SUPER_ADMIN: '/admin/analytics',
};

const errorText = (err, fallback) => err?.response?.data?.error?.message || fallback;

export default function RegisterPage() {
  const params = useSearchParams();
  const isComplete = params.get('complete') === '1';
  const router = useRouter();
  const { setAuth, updateUser, user } = useAuthStore();

  const [step, setStep] = useState(isComplete ? 'profile' : 'mobile');
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [schools, setSchools] = useState([]);
  const [form, setForm] = useState({
    mobile: '',
    otp: '',
    name: user?.name || '',
    schoolId: '',
    classId: '',
    language: user?.language || 'hi',
    dateOfBirth: '',
    gender: '',
  });

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  const selectedSchool = useMemo(
    () => schools.find(school => school.id === form.schoolId) || null,
    [schools, form.schoolId]
  );

  useEffect(() => {
    if (step !== 'profile') return;
    let cancelled = false;

    async function loadProfileSetup() {
      const token = typeof window !== 'undefined' ? localStorage.getItem('vs_access_token') : null;
      if (!token) {
        if (isComplete) router.replace('/login');
        return;
      }

      setLoadingOptions(true);
      try {
        const statusRes = await getProfileStatus();
        if (statusRes.data?.data?.complete) {
          router.replace('/student');
          return;
        }

        const optionsRes = await getProfileSetupOptions();
        const nextSchools = optionsRes.data?.data?.schools || [];
        if (cancelled) return;
        setSchools(nextSchools);

        const firstSchool = nextSchools[0];
        const firstClass = firstSchool?.classes?.[0];
        setForm(prev => ({
          ...prev,
          name: prev.name || user?.name || '',
          language: prev.language || user?.language || 'hi',
          schoolId: prev.schoolId || firstSchool?.id || '',
          classId: prev.classId || firstClass?.id || '',
        }));
      } catch (err) {
        if (err?.response?.status === 401) {
          router.replace('/login');
        } else {
          toast.error(errorText(err, 'Could not load school/class options'));
        }
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    }

    loadProfileSetup();
    return () => { cancelled = true; };
  }, [step, isComplete, router, user?.name, user?.language]);

  function handleSchoolChange(schoolId) {
    const school = schools.find(item => item.id === schoolId);
    setForm(prev => ({
      ...prev,
      schoolId,
      classId: school?.classes?.[0]?.id || '',
    }));
  }

  async function handleSendOTP(event) {
    event.preventDefault();
    if (form.mobile.length !== 10) {
      toast.error('Enter a valid 10-digit mobile number');
      return;
    }

    setLoading(true);
    try {
      const res = await sendOTP(form.mobile);
      toast.success(`OTP sent to +91-${form.mobile}`);
      if (res.data?.data?.otp) {
        toast(`Dev OTP: ${res.data.data.otp}`, { duration: 10000, icon: '🔑' });
      }
      setStep('otp');
    } catch (err) {
      toast.error(errorText(err, 'Failed to send OTP'));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTP(event) {
    event.preventDefault();
    if (form.otp.length !== 6) {
      toast.error('Enter the 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      const res = await verifyOTP(form.mobile, form.otp);
      const { accessToken, refreshToken, user: loggedInUser } = res.data.data;
      setAuth(loggedInUser, accessToken, refreshToken);

      if (loggedInUser.role !== 'STUDENT') {
        router.replace(ROLE_DASHBOARDS[loggedInUser.role] || '/');
        return;
      }

      setForm(prev => ({
        ...prev,
        name: loggedInUser.name || prev.name,
        language: loggedInUser.language || prev.language,
      }));
      setStep('profile');
    } catch (err) {
      toast.error(errorText(err, 'Invalid OTP'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteProfile(event) {
    event.preventDefault();
    if (!form.name.trim()) return toast.error('Please enter your full name');
    if (!form.schoolId) return toast.error('Please select your school');
    if (!form.classId) return toast.error('Please select your class and section');

    setLoading(true);
    try {
      const res = await completeStudentProfile({
        name: form.name.trim(),
        language: form.language,
        schoolId: form.schoolId,
        classId: form.classId,
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || null,
      });

      const student = res.data?.data?.student;
      updateUser({ name: student?.name || form.name.trim(), language: form.language });
      toast.success('Student profile completed. Welcome to VidyaSetu! 🎉');
      router.replace('/student');
    } catch (err) {
      toast.error(errorText(err, 'Failed to complete Student profile'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--white)' }}>
      <div className="w-full max-w-[500px]">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
            style={{ background: 'linear-gradient(135deg, var(--saffron), var(--saffron-light))' }}>🌉</div>
          <span className="font-display font-extrabold text-xl" style={{ color: 'var(--navy)' }}>VidyaSetu</span>
        </div>

        <div className="card p-8">
          {!isComplete && (
            <div className="flex items-center gap-2 mb-6">
              {['mobile', 'otp', 'profile'].map((item, index) => {
                const current = ['mobile', 'otp', 'profile'].indexOf(step);
                return (
                  <div key={item} className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{
                        background: step === item ? 'var(--saffron)' : current > index ? 'var(--forest)' : 'var(--border)',
                        color: step === item || current > index ? 'white' : 'var(--slate)',
                      }}>
                      {current > index ? '✓' : index + 1}
                    </div>
                    {index < 2 && <div className="h-0.5 w-8" style={{ background: current > index ? 'var(--forest)' : 'var(--border)' }} />}
                  </div>
                );
              })}
            </div>
          )}

          {step === 'mobile' && (
            <form onSubmit={handleSendOTP}>
              <h2 className="font-display font-extrabold text-2xl mb-1" style={{ color: 'var(--navy)' }}>Join VidyaSetu 🎓</h2>
              <p className="text-sm mb-5" style={{ color: 'var(--slate)' }}>Create your Student account with OTP.</p>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>Mobile Number</label>
              <div className="flex gap-2 mb-4">
                <div className="px-3 py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#F0F4F8', border: '1.5px solid var(--border)' }}>+91</div>
                <input type="tel" maxLength={10} className="input flex-1" placeholder="10-digit mobile number"
                  value={form.mobile} onChange={e => set('mobile', e.target.value.replace(/\D/g, ''))} autoFocus />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
                {loading ? 'Sending…' : 'Get OTP →'}
              </button>
              <p className="text-center text-xs mt-4" style={{ color: 'var(--slate)' }}>
                Already registered? <button type="button" onClick={() => router.push('/login')} className="font-semibold" style={{ color: 'var(--saffron)' }}>Sign in</button>
              </p>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleVerifyOTP}>
              <h2 className="font-display font-extrabold text-2xl mb-1" style={{ color: 'var(--navy)' }}>Verify OTP 🔑</h2>
              <p className="text-sm mb-5" style={{ color: 'var(--slate)' }}>Sent to +91-{form.mobile}</p>
              <input type="text" maxLength={6} className="input tracking-[0.3em] font-bold text-center text-xl mb-4"
                placeholder="• • • • • •" value={form.otp} onChange={e => set('otp', e.target.value.replace(/\D/g, ''))} autoFocus />
              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
                {loading ? 'Verifying…' : 'Verify & Continue →'}
              </button>
              <button type="button" onClick={() => { setStep('mobile'); set('otp', ''); }} className="w-full text-center text-xs mt-3" style={{ color: 'var(--saffron)' }}>← Change number</button>
            </form>
          )}

          {step === 'profile' && (
            <form onSubmit={handleCompleteProfile}>
              <h2 className="font-display font-extrabold text-2xl mb-1" style={{ color: 'var(--navy)' }}>Complete Student Profile ✨</h2>
              <p className="text-sm mb-5" style={{ color: 'var(--slate)' }}>Your school and class are stored as real VidyaSetu enrollment records.</p>

              {loadingOptions && <div className="text-sm mb-4" style={{ color: 'var(--slate)' }}>Loading schools and classes…</div>}

              <div className="mb-4">
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>Full Name</label>
                <input type="text" className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Enter your full name" autoFocus />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>School</label>
                <select className="input select" value={form.schoolId} onChange={e => handleSchoolChange(e.target.value)} disabled={loadingOptions || !schools.length}>
                  {!schools.length && <option value="">No active school available</option>}
                  {schools.map(school => (
                    <option key={school.id} value={school.id}>{school.name}{school.city ? ` — ${school.city}` : ''}</option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>Class / Section</label>
                <select className="input select" value={form.classId} onChange={e => set('classId', e.target.value)} disabled={!selectedSchool?.classes?.length}>
                  {!selectedSchool?.classes?.length && <option value="">No class configured</option>}
                  {(selectedSchool?.classes || []).map(classRow => (
                    <option key={classRow.id} value={classRow.id}>Class {classRow.label} · {classRow.academicYear}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>Date of Birth</label>
                  <input type="date" className="input" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>Gender</label>
                  <select className="input select" value={form.gender} onChange={e => set('gender', e.target.value)}>
                    <option value="">Prefer not to say</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--navy)' }}>Preferred Language / भाषा</label>
                <select className="input select" value={form.language} onChange={e => set('language', e.target.value)}>
                  {LANGUAGES.map(language => <option key={language.code} value={language.code}>{language.label}</option>)}
                </select>
              </div>

              <button type="submit" disabled={loading || loadingOptions || !schools.length || !form.classId} className="btn-primary w-full justify-center py-3 text-base">
                {loading ? 'Creating Student profile…' : 'Start Learning 🚀'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
