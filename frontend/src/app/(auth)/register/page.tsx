'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import {
  getStudentRegistrationOptions,
  registerPublicAccount,
  registerStudent,
  setPassword,
  updateProfile,
  type PublicRegistrationResult,
  type RegistrationSchoolOption,
  type SessionUser,
} from '@/services/authService';
import { completeStudentProfile, getProfileStatus } from '@/services/studentService';
import { createStudentParentLinkRequest } from '@/services/registrationLinkService';
import useAuthStore from '@/store/authStore';
import toast from 'react-hot-toast';

type RegistrationRole = 'STUDENT' | 'PARENT' | 'TEACHER' | 'SCHOOL_ADMIN';

const LANGUAGES = [
  ['hi', 'Hindi / हिंदी'], ['en', 'English'], ['ta', 'Tamil / தமிழ்'],
  ['te', 'Telugu / తెలుగు'], ['mr', 'Marathi / मराठी'], ['bn', 'Bengali / বাংলা'],
  ['gu', 'Gujarati / ગુજરાતી'], ['kn', 'Kannada / ಕನ್ನಡ'], ['or', 'Odia / ଓଡ଼ିଆ'],
] as const;

const ROLE_OPTIONS: Array<{ role: RegistrationRole; icon: string; title: string; sub: string }> = [
  { role: 'STUDENT', icon: '🎓', title: 'Student', sub: 'Learn, join a school and connect family' },
  { role: 'PARENT', icon: '👪', title: 'Parent / Guardian', sub: 'Follow verified child progress and school activity' },
  { role: 'TEACHER', icon: '👩‍🏫', title: 'Teacher / Educator', sub: 'Request membership in your school' },
  { role: 'SCHOOL_ADMIN', icon: '🏫', title: 'School / Institution', sub: 'Register your institution for platform verification' },
];

interface RegistrationForm {
  name: string;
  username: string;
  email: string;
  mobile: string;
  password: string;
  confirmPassword: string;
  language: string;

  gradeLevel: string;
  schoolId: string;
  classId: string;
  schoolNote: string;
  dateOfBirth: string;
  gender: string;
  parentName: string;
  parentMobile: string;
  parentEmail: string;
  parentRelation: 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'PARENT';

  studentCode: string;

  employeeId: string;
  designation: string;
  qualification: string;
  experienceYears: string;
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'VISITING';
  teacherNote: string;

  schoolName: string;
  udiseCode: string;
  board: string;
  affiliationNumber: string;
  principalName: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  schoolMobile: string;
  schoolEmail: string;
  website: string;
}

function usernameFromName(name: string | null | undefined): string {
  const parts = String(name || '').trim().toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return parts.length === 1 ? parts[0] : `${parts[0]}.${parts[parts.length - 1]}`;
}

function errorText(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: { message?: string }; message?: string } | undefined;
    return data?.error?.message || data?.message || fallback;
  }
  return err instanceof Error ? err.message || fallback : fallback;
}

const infoBox = { background: '#F5F8FC', border: '1px solid #DDE5EF', color: '#465269' } as const;
const warningBox = { background: '#FFF8E1', border: '1px solid #F0D88A', color: '#735400' } as const;
const successBox = { background: '#EEF9F1', border: '1px solid #B9DEC2', color: '#235B31' } as const;

export default function RegisterPage() {
  const params = useSearchParams();
  const isComplete = params.get('complete') === '1';
  const router = useRouter();
  const { user, setAuth, updateUser } = useAuthStore();

  const [role, setRole] = useState<RegistrationRole>('STUDENT');
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [schools, setSchools] = useState<RegistrationSchoolOption[]>([]);
  const [gradeLevels, setGradeLevels] = useState<string[]>(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
  const [connectSchool, setConnectSchool] = useState(true);
  const [addParent, setAddParent] = useState(false);
  const [linkChild, setLinkChild] = useState(false);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [pendingResult, setPendingResult] = useState<PublicRegistrationResult | null>(null);
  const [form, setForm] = useState<RegistrationForm>({
    name: user?.name && !String(user.name).startsWith('Student ') ? user.name : '',
    username: user?.username || '',
    email: user?.email || '',
    mobile: user?.mobile || '',
    password: '',
    confirmPassword: '',
    language: user?.language || 'hi',
    gradeLevel: '8',
    schoolId: '',
    classId: '',
    schoolNote: '',
    dateOfBirth: '',
    gender: '',
    parentName: '',
    parentMobile: '',
    parentEmail: '',
    parentRelation: 'PARENT',
    studentCode: '',
    employeeId: '',
    designation: 'Teacher',
    qualification: '',
    experienceYears: '0',
    employmentType: 'FULL_TIME',
    teacherNote: '',
    schoolName: '',
    udiseCode: '',
    board: '',
    affiliationNumber: '',
    principalName: '',
    address: '',
    city: '',
    district: '',
    state: 'Uttar Pradesh',
    pincode: '',
    schoolMobile: '',
    schoolEmail: '',
    website: '',
  });

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === form.schoolId) || null,
    [schools, form.schoolId],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingOptions(true);
      try {
        if (isComplete) {
          setRole('STUDENT');
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
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    }
    void load();
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
    setForm((prev) => ({
      ...prev,
      schoolId,
      classId: role === 'STUDENT' ? classRow?.id || '' : prev.classId,
      gradeLevel: role === 'STUDENT' ? classRow?.className || prev.gradeLevel : prev.gradeLevel,
    }));
  }

  function handleGradeChange(gradeLevel: string) {
    const classRow = selectedSchool?.classes?.find((row) => row.className === gradeLevel);
    setForm((prev) => ({ ...prev, gradeLevel, classId: connectSchool ? classRow?.id || '' : '' }));
  }

  function validateShared(): string | null {
    if (form.name.trim().length < 2) return role === 'SCHOOL_ADMIN' ? 'Enter the authorised representative name' : 'Enter your full name';
    if (form.username && form.username.trim().length < 3) return 'Username needs at least 3 characters';
    if (!isComplete && form.mobile.length !== 10) return 'Enter a valid 10-digit mobile number';
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) return 'Enter a valid email address';
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) return 'Password needs at least 8 characters, one letter and one number';
    if (form.password !== form.confirmPassword) return 'Passwords do not match';
    return null;
  }

  function validate(): string | null {
    const shared = validateShared();
    if (shared) return shared;
    if (role === 'STUDENT') {
      if (!form.gradeLevel) return 'Select your class/grade';
      if (connectSchool && (!form.schoolId || !form.classId)) return 'Select your school and matching class/section';
      if (addParent && !form.parentMobile && !form.parentEmail) return 'Enter a Parent mobile number or email, or turn off Parent linking';
    }
    if (role === 'PARENT' && linkChild && !form.studentCode.trim()) return 'Enter the Student ID, or turn off child linking for now';
    if (role === 'TEACHER' && !form.schoolId) return 'Select the School you want to join';
    if (role === 'SCHOOL_ADMIN') {
      if (form.schoolName.trim().length < 2) return 'Enter the School / Institution name';
      if (form.pincode && !/^\d{6}$/.test(form.pincode)) return 'School PIN code must be 6 digits';
      if (form.schoolMobile && form.schoolMobile.length !== 10) return 'School contact mobile must be 10 digits';
    }
    return null;
  }

  async function submitStudent() {
    const common = {
      name: form.name.trim(),
      username: form.username.trim() || undefined,
      email: form.email.trim() || undefined,
      password: form.password,
      language: form.language,
      gradeLevel: form.gradeLevel,
      schoolId: connectSchool ? form.schoolId : null,
      classId: connectSchool ? form.classId : null,
      schoolNote: connectSchool ? form.schoolNote.trim() || undefined : undefined,
      dateOfBirth: form.dateOfBirth || null,
      gender: form.gender || null,
    };
    const parent = addParent ? {
      parentName: form.parentName.trim() || undefined,
      parentMobile: form.parentMobile || undefined,
      parentEmail: form.parentEmail.trim() || undefined,
      parentRelation: form.parentRelation,
    } : {};

    if (isComplete) {
      await updateProfile({ username: common.username, email: common.email || null, name: common.name, language: common.language });
      await setPassword(null, common.password);
      const profileResponse = await completeStudentProfile(common);
      if (addParent) await createStudentParentLinkRequest(parent);
      const student = profileResponse.data.data.student;
      updateUser({
        name: common.name,
        username: common.username || user?.username || null,
        email: common.email || null,
        studentCode: student.studentCode,
        schoolLinkStatus: student.schoolLinkStatus,
      });
      toast.success(`Student account ready. Student ID: ${student.studentCode || 'created'}.`);
      router.replace('/student');
      return;
    }

    const response = await registerStudent({ ...common, ...parent, mobile: form.mobile, deviceInfo: navigator.userAgent });
    const payload = response.data.data;
    setAuth(payload.user, payload.accessToken, payload.refreshToken);
    toast.success(payload.parentLinkStatus === 'AWAITING_PARENT'
      ? `Welcome to VidyaSetu. Student ID: ${payload.student.studentCode}. Parent confirmation is pending.`
      : `Welcome to VidyaSetu. Student ID: ${payload.student.studentCode}.`);
    router.replace('/student');
  }

  async function submitPublicRole() {
    const base = {
      role,
      name: form.name.trim(),
      username: form.username.trim() || undefined,
      email: form.email.trim() || undefined,
      mobile: form.mobile,
      password: form.password,
      language: form.language,
      deviceInfo: navigator.userAgent,
    };

    const roleData = role === 'PARENT' ? {
      studentCode: linkChild ? form.studentCode.trim() : undefined,
      parentRelation: linkChild ? form.parentRelation : undefined,
    } : role === 'TEACHER' ? {
      schoolId: form.schoolId,
      employeeId: form.employeeId.trim() || undefined,
      designation: form.designation.trim() || 'Teacher',
      qualification: form.qualification.trim() || undefined,
      experienceYears: Number(form.experienceYears || 0),
      employmentType: form.employmentType,
      teacherNote: form.teacherNote.trim() || undefined,
    } : {
      schoolName: form.schoolName.trim(),
      udiseCode: form.udiseCode.trim() || undefined,
      board: form.board.trim() || undefined,
      affiliationNumber: form.affiliationNumber.trim() || undefined,
      principalName: form.principalName.trim() || undefined,
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      district: form.district.trim() || undefined,
      state: form.state.trim() || undefined,
      pincode: form.pincode || undefined,
      schoolMobile: form.schoolMobile || undefined,
      schoolEmail: form.schoolEmail.trim() || undefined,
      website: form.website.trim() || undefined,
    };

    const response = await registerPublicAccount({ ...base, ...roleData });
    const payload = response.data.data;
    if (role === 'PARENT' && payload.accessToken && payload.refreshToken) {
      setAuth(payload.user as SessionUser, payload.accessToken, payload.refreshToken);
      toast.success(payload.relationshipStatus === 'PENDING_STUDENT_CONFIRMATION'
        ? 'Parent account created. Child access will activate after the Student confirms you.'
        : 'Parent account created. You can connect a child from your Parent workspace.');
      router.replace('/dashboard');
      return;
    }

    setPendingResult(payload);
    toast.success(role === 'TEACHER' ? 'Teacher registration submitted to the School.' : 'School registration submitted for platform verification.');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const issue = validate();
    if (issue) return toast.error(issue);
    setLoading(true);
    try {
      if (role === 'STUDENT') await submitStudent();
      else await submitPublicRole();
    } catch (err: unknown) {
      toast.error(errorText(err, 'Registration failed'));
    } finally {
      setLoading(false);
    }
  }

  if (pendingResult) {
    const isTeacher = pendingResult.user.role === 'TEACHER';
    return (
      <div className="min-h-[calc(100vh-66px)] py-10 px-4" style={{ background: '#F7F8FA' }}>
        <div className="w-full max-w-[680px] mx-auto card p-8 text-center">
          <div className="text-5xl mb-4">{isTeacher ? '👩‍🏫' : '🏫'}</div>
          <h1 className="font-display font-extrabold text-3xl" style={{ color: 'var(--navy)' }}>
            {isTeacher ? 'Teacher request submitted' : 'School application submitted'}
          </h1>
          <p className="mt-3 text-sm leading-6" style={{ color: 'var(--slate)' }}>{pendingResult.message}</p>
          <div className="mt-5 p-4 rounded-xl text-left" style={successBox}>
            <div className="font-bold">Account: {pendingResult.user.username || pendingResult.user.mobile}</div>
            <div className="text-sm mt-1">Status: {pendingResult.approvalStatus}</div>
            <div className="text-sm">Relationship: {pendingResult.relationshipStatus.replaceAll('_', ' ')}</div>
          </div>
          <div className="mt-5 p-4 rounded-xl text-sm text-left" style={warningBox}>
            {isTeacher
              ? 'Creating a Teacher account does not make you a member of a School. The selected School must approve the request. Only then will VidyaSetu create the official Teacher membership and enable the School workspace.'
              : 'A School representative cannot self-approve an institution. Platform verification activates the School and the representative account together.'}
          </div>
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            <button className="btn-primary" onClick={() => router.push('/login')}>Go to Sign in</button>
            <button className="btn-ghost" onClick={() => { setPendingResult(null); setRole('STUDENT'); }}>Register another account</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-66px)] py-8 px-4" style={{ background: '#F7F8FA' }}>
      <div className="w-full max-w-[1040px] mx-auto">
        <div className="mb-6">
          <h1 className="font-display font-extrabold text-3xl" style={{ color: 'var(--navy)' }}>
            {isComplete ? 'Complete your Student account' : 'Create your VidyaSetu account'}
          </h1>
          <p className="text-sm mt-1 max-w-3xl" style={{ color: 'var(--slate)' }}>
            {isComplete
              ? 'Finish your Student identity. School and Parent connections are verified relationships, not automatic access.'
              : 'Choose who you are. Each person or institution gets its own identity; School, Teacher, Student and Parent relationships are verified before data is shared.'}
          </p>
        </div>

        {!isComplete && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              {ROLE_OPTIONS.map((option) => {
                const active = role === option.role;
                return (
                  <button
                    key={option.role}
                    type="button"
                    onClick={() => { setRole(option.role); setPendingResult(null); }}
                    className="card p-4 text-left transition-all"
                    style={{ border: active ? '2px solid var(--saffron)' : '1px solid var(--border)', background: active ? '#FFF8ED' : '#fff' }}
                  >
                    <div className="text-2xl">{option.icon}</div>
                    <div className="font-display font-bold mt-2" style={{ color: 'var(--navy)' }}>{option.title}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{option.sub}</div>
                  </button>
                );
              })}
            </div>
            <div className="rounded-xl p-3 text-xs mb-6" style={infoBox}>
              🔐 <b>Platform Admin is intentionally not available for public registration.</b> Platform Admin accounts must be provisioned by an authorised administrator; selecting a role can never grant administrative privilege.
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-5">
          <section className="card p-6 h-fit">
            <h2 className="font-display font-bold text-xl mb-4" style={{ color: 'var(--navy)' }}>1. Account identity</h2>
            <label className="block text-sm font-semibold mb-1">{role === 'SCHOOL_ADMIN' ? 'Authorised representative name' : 'Full Name'}</label>
            <input className="input mb-4" value={form.name} onChange={(e) => handleName(e.target.value)} placeholder={role === 'SCHOOL_ADMIN' ? 'Principal / authorised administrator' : 'Aarav Sharma'} />

            <label className="block text-sm font-semibold mb-1">Username <span className="font-normal" style={{ color: 'var(--slate)' }}>(optional)</span></label>
            <input className="input mb-1" value={form.username} onChange={(e) => { setUsernameTouched(true); set('username', e.target.value.replace(/\s/g, '').toLowerCase()); }} placeholder="firstname.lastname" />
            <div className="text-xs mb-4" style={{ color: 'var(--slate)' }}>Leave blank and VidyaSetu will allocate an available username.</div>

            <label className="block text-sm font-semibold mb-1">Email <span className="font-normal" style={{ color: 'var(--slate)' }}>(optional)</span></label>
            <input type="email" className="input mb-4" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@example.com" />

            {!isComplete && (
              <>
                <label className="block text-sm font-semibold mb-1">Mobile Number</label>
                <input className="input mb-4" maxLength={10} value={form.mobile} onChange={(e) => set('mobile', e.target.value.replace(/\D/g, ''))} placeholder="10-digit mobile" />
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block text-sm font-semibold mb-1">Password</label><input type="password" className="input" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="8+ characters" /></div>
              <div><label className="block text-sm font-semibold mb-1">Confirm</label><input type="password" className="input" value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} placeholder="Repeat password" /></div>
            </div>

            <label className="block text-sm font-semibold mb-1 mt-4">Preferred Language</label>
            <select className="input select" value={form.language} onChange={(e) => set('language', e.target.value)}>{LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select>
          </section>

          <div className="space-y-5">
            {role === 'STUDENT' && (
              <>
                <section className="card p-6">
                  <h2 className="font-display font-bold text-xl mb-4" style={{ color: 'var(--navy)' }}>2. Student profile</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div><label className="block text-sm font-semibold mb-1">Class / Grade</label><select className="input select" value={form.gradeLevel} onChange={(e) => handleGradeChange(e.target.value)}>{gradeLevels.map((grade) => <option key={grade} value={grade}>Class {grade}</option>)}</select></div>
                    <div><label className="block text-sm font-semibold mb-1">Date of Birth</label><input type="date" className="input" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} /></div>
                    <div><label className="block text-sm font-semibold mb-1">Gender</label><select className="input select" value={form.gender} onChange={(e) => set('gender', e.target.value)}><option value="">Prefer not to say</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select></div>
                  </div>
                </section>

                <section className="card p-6">
                  <div className="flex items-center justify-between mb-3"><div><h2 className="font-display font-bold text-xl" style={{ color: 'var(--navy)' }}>3. Request School connection</h2><p className="text-xs" style={{ color: 'var(--slate)' }}>Optional · School approval required</p></div><input type="checkbox" checked={connectSchool} onChange={(e) => setConnectSchool(e.target.checked)} /></div>
                  {connectSchool && <>
                    <label className="block text-sm font-semibold mb-1">School</label>
                    <select className="input select mb-4" value={form.schoolId} onChange={(e) => handleSchoolChange(e.target.value)} disabled={loadingOptions}>
                      {!schools.length && <option value="">No active school available</option>}
                      {schools.map((school) => <option key={school.id} value={school.id}>{school.name}{school.city ? ` — ${school.city}` : ''}</option>)}
                    </select>
                    <label className="block text-sm font-semibold mb-1">Class / Section at School</label>
                    <select className="input select mb-4" value={form.classId} onChange={(e) => { const row = selectedSchool?.classes?.find((classRow) => classRow.id === e.target.value); setForm((prev) => ({ ...prev, classId: e.target.value, gradeLevel: row?.className || prev.gradeLevel })); }}>
                      <option value="">Select class</option>
                      {(selectedSchool?.classes || []).map((classRow) => <option key={classRow.id} value={classRow.id}>Class {classRow.label} · {classRow.academicYear}</option>)}
                    </select>
                    <label className="block text-sm font-semibold mb-1">Note to School <span className="font-normal" style={{ color: 'var(--slate)' }}>(optional)</span></label>
                    <textarea className="input" rows={2} value={form.schoolNote} onChange={(e) => set('schoolNote', e.target.value)} placeholder="Admission number or detail that helps the School verify you" />
                    <div className="text-xs mt-3 p-3 rounded-lg" style={warningBox}>Selecting a School does <b>not</b> enrol you. The School must verify the request before official attendance, fees, tests and roster data are connected.</div>
                  </>}
                </section>

                <section className="card p-6">
                  <div className="flex items-center justify-between mb-3"><div><h2 className="font-display font-bold text-xl" style={{ color: 'var(--navy)' }}>4. Invite Parent / Guardian</h2><p className="text-xs" style={{ color: 'var(--slate)' }}>Optional · two-sided confirmation</p></div><input type="checkbox" checked={addParent} onChange={(e) => setAddParent(e.target.checked)} /></div>
                  {addParent && <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3"><div><label className="block text-sm font-semibold mb-1">Parent Name</label><input className="input" value={form.parentName} onChange={(e) => set('parentName', e.target.value)} /></div><div><label className="block text-sm font-semibold mb-1">Relation</label><select className="input select" value={form.parentRelation} onChange={(e) => set('parentRelation', e.target.value as RegistrationForm['parentRelation'])}><option value="PARENT">Parent</option><option value="FATHER">Father</option><option value="MOTHER">Mother</option><option value="GUARDIAN">Guardian</option></select></div></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="block text-sm font-semibold mb-1">Parent Mobile</label><input className="input" maxLength={10} value={form.parentMobile} onChange={(e) => set('parentMobile', e.target.value.replace(/\D/g, ''))} placeholder="10-digit mobile" /></div><div><label className="block text-sm font-semibold mb-1">Parent Email</label><input type="email" className="input" value={form.parentEmail} onChange={(e) => set('parentEmail', e.target.value)} /></div></div>
                    <div className="text-xs mt-3 p-3 rounded-lg" style={infoBox}>The Parent receives a pending relationship. Even an existing Parent account gets <b>no Student access</b> until the Parent confirms this invitation.</div>
                  </>}
                </section>
              </>
            )}

            {role === 'PARENT' && (
              <section className="card p-6">
                <div className="flex items-center justify-between mb-4"><div><h2 className="font-display font-bold text-xl" style={{ color: 'var(--navy)' }}>2. Connect a child</h2><p className="text-xs" style={{ color: 'var(--slate)' }}>Optional during registration</p></div><input type="checkbox" checked={linkChild} onChange={(e) => setLinkChild(e.target.checked)} /></div>
                {linkChild ? <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="block text-sm font-semibold mb-1">Student ID</label><input className="input" value={form.studentCode} onChange={(e) => set('studentCode', e.target.value.toUpperCase())} placeholder="Permanent VidyaSetu Student ID" /></div><div><label className="block text-sm font-semibold mb-1">Your relation</label><select className="input select" value={form.parentRelation} onChange={(e) => set('parentRelation', e.target.value as RegistrationForm['parentRelation'])}><option value="PARENT">Parent</option><option value="FATHER">Father</option><option value="MOTHER">Mother</option><option value="GUARDIAN">Guardian</option></select></div></div>
                  <div className="text-xs mt-4 p-3 rounded-lg" style={warningBox}><b>Privacy protection:</b> typing a Student ID never reveals Student data. VidyaSetu only creates a request. The Student must confirm the relationship before this Parent account can see the child.</div>
                </> : <div className="text-sm p-4 rounded-xl" style={infoBox}>Create the Parent account now. You can connect one or more children later through verified relationship requests.</div>}
              </section>
            )}

            {role === 'TEACHER' && (
              <section className="card p-6">
                <h2 className="font-display font-bold text-xl mb-4" style={{ color: 'var(--navy)' }}>2. Request School membership</h2>
                <label className="block text-sm font-semibold mb-1">School</label>
                <select className="input select mb-4" value={form.schoolId} onChange={(e) => handleSchoolChange(e.target.value)} disabled={loadingOptions}>
                  <option value="">Select your School</option>
                  {schools.map((school) => <option key={school.id} value={school.id}>{school.name}{school.city ? ` — ${school.city}` : ''}</option>)}
                </select>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="block text-sm font-semibold mb-1">Employee ID <span className="font-normal" style={{ color: 'var(--slate)' }}>(optional)</span></label><input className="input" value={form.employeeId} onChange={(e) => set('employeeId', e.target.value)} /></div>
                  <div><label className="block text-sm font-semibold mb-1">Designation</label><input className="input" value={form.designation} onChange={(e) => set('designation', e.target.value)} /></div>
                  <div><label className="block text-sm font-semibold mb-1">Qualification</label><input className="input" value={form.qualification} onChange={(e) => set('qualification', e.target.value)} /></div>
                  <div><label className="block text-sm font-semibold mb-1">Experience (years)</label><input type="number" min="0" max="60" className="input" value={form.experienceYears} onChange={(e) => set('experienceYears', e.target.value)} /></div>
                  <div><label className="block text-sm font-semibold mb-1">Employment</label><select className="input select" value={form.employmentType} onChange={(e) => set('employmentType', e.target.value as RegistrationForm['employmentType'])}><option value="FULL_TIME">Full time</option><option value="PART_TIME">Part time</option><option value="CONTRACT">Contract</option><option value="VISITING">Visiting</option></select></div>
                </div>
                <label className="block text-sm font-semibold mb-1 mt-4">Note to School <span className="font-normal" style={{ color: 'var(--slate)' }}>(optional)</span></label>
                <textarea className="input" rows={3} value={form.teacherNote} onChange={(e) => set('teacherNote', e.target.value)} placeholder="Any detail that helps the School verify your employment" />
                <div className="text-xs mt-4 p-3 rounded-lg" style={warningBox}>The account starts as <b>Pending</b>. The School must approve your membership before the official Teacher record and School workspace access are activated. Class and subject assignments remain controlled by the School.</div>
              </section>
            )}

            {role === 'SCHOOL_ADMIN' && (
              <section className="card p-6">
                <h2 className="font-display font-bold text-xl mb-4" style={{ color: 'var(--navy)' }}>2. School / Institution details</h2>
                <label className="block text-sm font-semibold mb-1">School / Institution name</label><input className="input mb-3" value={form.schoolName} onChange={(e) => set('schoolName', e.target.value)} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="block text-sm font-semibold mb-1">UDISE code <span className="font-normal" style={{ color: 'var(--slate)' }}>(if applicable)</span></label><input className="input" value={form.udiseCode} onChange={(e) => set('udiseCode', e.target.value)} /></div>
                  <div><label className="block text-sm font-semibold mb-1">Board</label><input className="input" value={form.board} onChange={(e) => set('board', e.target.value)} placeholder="CBSE / ICSE / State Board" /></div>
                  <div><label className="block text-sm font-semibold mb-1">Affiliation number</label><input className="input" value={form.affiliationNumber} onChange={(e) => set('affiliationNumber', e.target.value)} /></div>
                  <div><label className="block text-sm font-semibold mb-1">Principal / Head</label><input className="input" value={form.principalName} onChange={(e) => set('principalName', e.target.value)} /></div>
                </div>
                <label className="block text-sm font-semibold mb-1 mt-4">Address</label><textarea className="input" rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                  <div><label className="block text-sm font-semibold mb-1">City</label><input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
                  <div><label className="block text-sm font-semibold mb-1">District</label><input className="input" value={form.district} onChange={(e) => set('district', e.target.value)} /></div>
                  <div><label className="block text-sm font-semibold mb-1">State</label><input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} /></div>
                  <div><label className="block text-sm font-semibold mb-1">PIN code</label><input className="input" maxLength={6} value={form.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))} /></div>
                  <div><label className="block text-sm font-semibold mb-1">School mobile</label><input className="input" maxLength={10} value={form.schoolMobile} onChange={(e) => set('schoolMobile', e.target.value.replace(/\D/g, ''))} placeholder="Optional" /></div>
                  <div><label className="block text-sm font-semibold mb-1">School email</label><input type="email" className="input" value={form.schoolEmail} onChange={(e) => set('schoolEmail', e.target.value)} /></div>
                </div>
                <label className="block text-sm font-semibold mb-1 mt-4">Website <span className="font-normal" style={{ color: 'var(--slate)' }}>(optional)</span></label><input className="input" value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://school.example.org" />
                <div className="text-xs mt-4 p-3 rounded-lg" style={warningBox}>Registration creates a <b>Pending institution application</b>, not an active School. A Platform Admin must verify the institution and authorised representative. This prevents duplicate claiming or unauthorised takeover of a School.</div>
              </section>
            )}

            <button type="submit" disabled={loading || loadingOptions} className="btn-primary w-full justify-center py-3 text-base">
              {loading ? 'Submitting…' : isComplete ? 'Complete Student Account →' : role === 'STUDENT' ? 'Create Student Account →' : role === 'PARENT' ? 'Create Parent Account →' : role === 'TEACHER' ? 'Submit Teacher Request →' : 'Submit School Application →'}
            </button>
            <p className="text-center text-xs" style={{ color: 'var(--slate)' }}>Already registered? <button type="button" onClick={() => router.push('/login')} className="font-semibold" style={{ color: 'var(--saffron)' }}>Sign in</button></p>
          </div>
        </form>
      </div>
    </div>
  );
}
