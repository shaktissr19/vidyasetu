'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import {
  getStudentRegistrationOptions,
  registerStudent,
  setPassword,
  updateProfile,
  type RegistrationSchoolOption,
} from '@/services/authService';
import { completeStudentProfile, getProfileStatus } from '@/services/studentService';
import useAuthStore from '@/store/authStore';
import toast from 'react-hot-toast';

const LANGUAGES = [
  ['hi', 'Hindi / हिंदी'], ['en', 'English'], ['ta', 'Tamil / தமிழ்'],
  ['te', 'Telugu / తెలుగు'], ['mr', 'Marathi / मराठी'], ['bn', 'Bengali / বাংলা'],
  ['gu', 'Gujarati / ગુજરાતી'], ['kn', 'Kannada / ಕನ್ನಡ'], ['or', 'Odia / ଓଡ଼ିଆ'],
] as const;

interface RegistrationForm {
  name: string;
  username: string;
  email: string;
  mobile: string;
  password: string;
  confirmPassword: string;
  gradeLevel: string;
  schoolId: string;
  classId: string;
  schoolNote: string;
  dateOfBirth: string;
  gender: string;
  language: string;
  parentName: string;
  parentMobile: string;
  parentEmail: string;
  parentRelation: string;
}

function usernameFromName(name: string | null | undefined): string {
  const parts = String(name || '').trim().toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return parts.length === 1 ? parts[0] : `${parts[0]}.${parts[parts.length - 1]}`;
}

function errorText(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: { message?: string } } | undefined;
    return data?.error?.message || fallback;
  }
  return err instanceof Error ? err.message || fallback : fallback;
}

export default function RegisterPage() {
  const params = useSearchParams();
  const isComplete = params.get('complete') === '1';
  const router = useRouter();
  const { user, setAuth, updateUser } = useAuthStore();

  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [schools, setSchools] = useState<RegistrationSchoolOption[]>([]);
  const [gradeLevels, setGradeLevels] = useState<string[]>(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
  const [connectSchool, setConnectSchool] = useState(true);
  const [addParent, setAddParent] = useState(true);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [form, setForm] = useState<RegistrationForm>({
    name: user?.name && !String(user.name).startsWith('Student ') ? user.name : '',
    username: user?.username || '',
    email: user?.email || '',
    mobile: user?.mobile || '',
    password: '',
    confirmPassword: '',
    gradeLevel: '8',
    schoolId: '',
    classId: '',
    schoolNote: '',
    dateOfBirth: '',
    gender: '',
    language: user?.language || 'hi',
    parentName: '',
    parentMobile: '',
    parentEmail: '',
    parentRelation: 'PARENT',
  });

  const selectedSchool = useMemo(() => schools.find((school) => school.id === form.schoolId) || null, [schools, form.schoolId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingOptions(true);
      try {
        if (isComplete) {
          const token = localStorage.getItem('vs_access_token');
          if (!token) { router.replace('/login'); return; }
          const status = await getProfileStatus();
          if (status.data?.data?.complete) { router.replace('/student'); return; }
        }
        const response = await getStudentRegistrationOptions();
        if (cancelled) return;
        const data = response.data.data;
        const nextSchools = data.schools || [];
        setSchools(nextSchools);
        setGradeLevels(data.gradeLevels || gradeLevels);
        const first = nextSchools[0];
        const firstClass = first?.classes?.find((row) => row.className === form.gradeLevel) || first?.classes?.[0];
        setForm((prev) => ({
          ...prev,
          schoolId: prev.schoolId || first?.id || '',
          classId: prev.classId || firstClass?.id || '',
          username: prev.username || usernameFromName(prev.name),
        }));
      } catch (err: unknown) {
        toast.error(errorText(err, 'Could not load registration options'));
      } finally { if (!cancelled) setLoadingOptions(false); }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete, router]);

  function set<K extends keyof RegistrationForm>(field: K, value: RegistrationForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleName(value: string) {
    setForm((prev) => ({ ...prev, name: value, username: usernameTouched ? prev.username : usernameFromName(value) }));
  }

  function handleSchoolChange(schoolId: string) {
    const school = schools.find((row) => row.id === schoolId);
    const classRow = school?.classes?.find((row) => row.className === form.gradeLevel) || school?.classes?.[0];
    setForm((prev) => ({ ...prev, schoolId, classId: classRow?.id || '', gradeLevel: classRow?.className || prev.gradeLevel }));
  }

  function handleGradeChange(gradeLevel: string) {
    const classRow = selectedSchool?.classes?.find((row) => row.className === gradeLevel);
    setForm((prev) => ({ ...prev, gradeLevel, classId: connectSchool ? classRow?.id || '' : '' }));
  }

  function validate(): string | null {
    if (form.name.trim().length < 2) return 'Enter your full name';
    if (form.username.trim().length < 3) return 'Choose a username with at least 3 characters';
    if (!isComplete && form.mobile.length !== 10) return 'Enter a valid 10-digit mobile number';
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) return 'Password needs at least 8 characters, one letter and one number';
    if (form.password !== form.confirmPassword) return 'Passwords do not match';
    if (!form.gradeLevel) return 'Select your class/grade';
    if (connectSchool && (!form.schoolId || !form.classId)) return 'Select your school and matching class/section';
    if (addParent && !form.parentMobile && !form.parentEmail) return 'Enter a parent mobile number or email, or turn off Parent linking';
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const issue = validate();
    if (issue) return toast.error(issue);
    setLoading(true);
    try {
      const common = {
        name: form.name.trim(),
        username: form.username.trim(),
        email: form.email.trim() || undefined,
        password: form.password,
        language: form.language,
        gradeLevel: form.gradeLevel,
        schoolId: connectSchool ? form.schoolId : null,
        classId: connectSchool ? form.classId : null,
        schoolNote: connectSchool ? form.schoolNote.trim() || undefined : undefined,
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || null,
        parentName: addParent ? form.parentName.trim() || undefined : undefined,
        parentMobile: addParent ? form.parentMobile || undefined : undefined,
        parentEmail: addParent ? form.parentEmail.trim() || undefined : undefined,
        parentRelation: addParent ? form.parentRelation : undefined,
        deviceInfo: navigator.userAgent,
      };

      if (isComplete) {
        await updateProfile({ username: common.username, email: common.email || null, name: common.name, language: common.language });
        await setPassword(null, common.password);
        const profileResponse = await completeStudentProfile({
          name: common.name,
          language: common.language,
          gradeLevel: common.gradeLevel,
          schoolId: common.schoolId,
          classId: common.classId,
          schoolNote: common.schoolNote,
          dateOfBirth: common.dateOfBirth,
          gender: common.gender,
          parentName: common.parentName,
          parentMobile: common.parentMobile,
          parentEmail: common.parentEmail,
          parentRelation: common.parentRelation,
        });
        const student = profileResponse.data.data.student;
        updateUser({ name: common.name, username: common.username, email: common.email || null, studentCode: student.studentCode, schoolLinkStatus: student.schoolLinkStatus });
        toast.success(`Student account ready. Your Student ID is ${student.studentCode || 'created'}.`);
      } else {
        const response = await registerStudent({ ...common, mobile: form.mobile });
        const payload = response.data.data;
        setAuth(payload.user, payload.accessToken, payload.refreshToken);
        toast.success(`Welcome to VidyaSetu. Student ID: ${payload.student.studentCode}`);
      }
      router.replace('/student');
    } catch (err: unknown) {
      toast.error(errorText(err, 'Student registration failed'));
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-[calc(100vh-66px)] py-8 px-4" style={{ background: '#F7F8FA' }}>
      <div className="w-full max-w-[860px] mx-auto">
        <div className="mb-6">
          <h1 className="font-display font-extrabold text-3xl" style={{ color: 'var(--navy)' }}>{isComplete ? 'Complete your Student account' : 'Create Student account'} 🎓</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Your username, email and permanent Student ID can be used for sign-in. School linking is verified by the school before you enter its official roster.</p>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="card p-6">
            <h2 className="font-display font-bold text-xl mb-4" style={{ color: 'var(--navy)' }}>1. Account & Student identity</h2>
            <label className="block text-sm font-semibold mb-1">Full Name</label>
            <input className="input mb-4" value={form.name} onChange={(e) => handleName(e.target.value)} placeholder="Aarav Sharma" />

            <label className="block text-sm font-semibold mb-1">Username</label>
            <input className="input mb-1" value={form.username} onChange={(e) => { setUsernameTouched(true); set('username', e.target.value.replace(/\s/g, '').toLowerCase()); }} placeholder="aarav.sharma" />
            <div className="text-xs mb-4" style={{ color: 'var(--slate)' }}>We suggest firstname.lastname. You can choose another available username.</div>

            <label className="block text-sm font-semibold mb-1">Email <span className="font-normal" style={{ color: 'var(--slate)' }}>(optional)</span></label>
            <input type="email" className="input mb-4" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="student@example.com" />

            {!isComplete && <><label className="block text-sm font-semibold mb-1">Mobile Number</label><input className="input mb-4" maxLength={10} value={form.mobile} onChange={(e) => set('mobile', e.target.value.replace(/\D/g, ''))} placeholder="10-digit mobile for recovery/OTP" /></>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block text-sm font-semibold mb-1">Password</label><input type="password" className="input" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="8+ characters" /></div>
              <div><label className="block text-sm font-semibold mb-1">Confirm</label><input type="password" className="input" value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} placeholder="Repeat password" /></div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <div><label className="block text-sm font-semibold mb-1">Class / Grade</label><select className="input select" value={form.gradeLevel} onChange={(e) => handleGradeChange(e.target.value)}>{gradeLevels.map((grade) => <option key={grade} value={grade}>Class {grade}</option>)}</select></div>
              <div><label className="block text-sm font-semibold mb-1">Language</label><select className="input select" value={form.language} onChange={(e) => set('language', e.target.value)}>{LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <div><label className="block text-sm font-semibold mb-1">Date of Birth</label><input type="date" className="input" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} /></div>
              <div><label className="block text-sm font-semibold mb-1">Gender</label><select className="input select" value={form.gender} onChange={(e) => set('gender', e.target.value)}><option value="">Prefer not to say</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select></div>
            </div>
          </section>

          <div className="space-y-5">
            <section className="card p-6">
              <div className="flex items-center justify-between mb-3"><div><h2 className="font-display font-bold text-xl" style={{ color: 'var(--navy)' }}>2. Connect your school</h2><p className="text-xs" style={{ color: 'var(--slate)' }}>Optional · school must approve</p></div><input type="checkbox" checked={connectSchool} onChange={(e) => setConnectSchool(e.target.checked)} /></div>
              {connectSchool && (
                <>
                  <label className="block text-sm font-semibold mb-1">School</label>
                  <select className="input select mb-4" value={form.schoolId} onChange={(e) => handleSchoolChange(e.target.value)} disabled={loadingOptions}>
                    {!schools.length && <option value="">No active school available</option>}
                    {schools.map((school) => <option key={school.id} value={school.id}>{school.name}{school.city ? ` — ${school.city}` : ''}</option>)}
                  </select>
                  <label className="block text-sm font-semibold mb-1">Class / Section at school</label>
                  <select className="input select mb-4" value={form.classId} onChange={(e) => { const row = selectedSchool?.classes?.find((classRow) => classRow.id === e.target.value); setForm((prev) => ({ ...prev, classId: e.target.value, gradeLevel: row?.className || prev.gradeLevel })); }}>
                    <option value="">Select class</option>
                    {(selectedSchool?.classes || []).map((classRow) => <option key={classRow.id} value={classRow.id}>Class {classRow.label} · {classRow.academicYear}</option>)}
                  </select>
                  <label className="block text-sm font-semibold mb-1">Note to school <span className="font-normal" style={{ color: 'var(--slate)' }}>(optional)</span></label>
                  <textarea className="input" rows={2} value={form.schoolNote} onChange={(e) => set('schoolNote', e.target.value)} placeholder="Admission number or any detail that helps the school verify you" />
                  <div className="text-xs mt-3 p-3 rounded-lg" style={{ background: '#FFF8E1', color: '#7A5A00' }}>Your request will be marked <b>Pending</b>. Attendance, school tests, fees and official report data activate after the school approves the link.</div>
                </>
              )}
            </section>

            <section className="card p-6">
              <div className="flex items-center justify-between mb-3"><div><h2 className="font-display font-bold text-xl" style={{ color: 'var(--navy)' }}>3. Parent / Guardian</h2><p className="text-xs" style={{ color: 'var(--slate)' }}>Recommended for school communication</p></div><input type="checkbox" checked={addParent} onChange={(e) => setAddParent(e.target.checked)} /></div>
              {addParent && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3"><div><label className="block text-sm font-semibold mb-1">Parent Name</label><input className="input" value={form.parentName} onChange={(e) => set('parentName', e.target.value)} /></div><div><label className="block text-sm font-semibold mb-1">Relation</label><select className="input select" value={form.parentRelation} onChange={(e) => set('parentRelation', e.target.value)}><option value="PARENT">Parent</option><option value="FATHER">Father</option><option value="MOTHER">Mother</option><option value="GUARDIAN">Guardian</option></select></div></div>
                  <label className="block text-sm font-semibold mb-1">Parent Mobile</label><input className="input mb-3" maxLength={10} value={form.parentMobile} onChange={(e) => set('parentMobile', e.target.value.replace(/\D/g, ''))} placeholder="10-digit mobile" />
                  <label className="block text-sm font-semibold mb-1">Parent Email <span className="font-normal" style={{ color: 'var(--slate)' }}>(optional)</span></label><input type="email" className="input" value={form.parentEmail} onChange={(e) => set('parentEmail', e.target.value)} />
                  <div className="text-xs mt-3" style={{ color: 'var(--slate)' }}>If this Parent already has a VidyaSetu account, the child link is created immediately. Otherwise a pending relationship is kept until the Parent claims it.</div>
                </>
              )}
            </section>

            <button type="submit" disabled={loading || loadingOptions} className="btn-primary w-full justify-center py-3 text-base">{loading ? 'Creating Student account…' : isComplete ? 'Complete Account →' : 'Create Student Account →'}</button>
            <p className="text-center text-xs" style={{ color: 'var(--slate)' }}>Already registered? <button type="button" onClick={() => router.push('/login')} className="font-semibold" style={{ color: 'var(--saffron)' }}>Sign in</button></p>
          </div>
        </form>
      </div>
    </div>
  );
}
