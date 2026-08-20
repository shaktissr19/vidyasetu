'use client';
import { useEffect, useState, type HTMLInputTypeAttribute } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getOverview, getSchoolProfile, updateSchoolProfile } from '@/services/schoolService';
import { SectionHeader, CardSkeleton } from '@/components/ui/index';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

interface SchoolProfileForm {
  name: string; nameHi: string; udiseCode: string; board: string; affiliationNumber: string;
  principalName: string; address: string; city: string; district: string; state: string; pincode: string;
  mobile: string; email: string; website: string; academicYear: string; adminName: string; adminEmail: string;
}

const blankForm: SchoolProfileForm = { name: '', nameHi: '', udiseCode: '', board: '', affiliationNumber: '', principalName: '', address: '', city: '', district: '', state: '', pincode: '', mobile: '', email: '', website: '', academicYear: '', adminName: '', adminEmail: '' };

export default function SchoolProfilePage() {
  const { user } = useAuthStore();
  const { t } = useLanguageStore();
  const qc = useQueryClient();
  const canEdit = Boolean(user?.role && ['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(user.role));
  const profileQ = useQuery({ queryKey: ['school-profile'], queryFn: () => getSchoolProfile().then((r) => r.data.data) });
  const overviewQ = useQuery({ queryKey: ['school-overview'], queryFn: () => getOverview().then((r) => r.data.data) });
  const [form, setForm] = useState<SchoolProfileForm>(blankForm);

  useEffect(() => {
    if (!profileQ.data) return;
    const p = profileQ.data;
    setForm({
      name: p.name || '', nameHi: p.name_hi || '', udiseCode: p.udise_code || '', board: p.board || '',
      affiliationNumber: p.affiliation_number || '', principalName: p.principal_name || '', address: p.address || '', city: p.city || '',
      district: p.district || '', state: p.state || '', pincode: p.pincode || '', mobile: p.mobile || '', email: p.email || '',
      website: p.website || '', academicYear: p.academic_year || '', adminName: p.admin_name || '', adminEmail: p.admin_email || '',
    });
  }, [profileQ.data]);

  const save = useMutation({
    mutationFn: () => updateSchoolProfile(Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ''))),
    onSuccess: async () => { toast.success('School profile updated'); await Promise.all([qc.invalidateQueries({ queryKey: ['school-profile'] }), qc.invalidateQueries({ queryKey: ['school-overview'] })]); },
    onError: (error: unknown) => toast.error(apiErrorText(error)),
  });

  if (profileQ.isLoading) return <div className="grid md:grid-cols-2 gap-4"><CardSkeleton /><CardSkeleton /></div>;
  const onboarding = overviewQ.data?.onboarding;
  const checks = onboarding?.checks || {};

  function Field({ label, keyName, type = 'text', placeholder = '' }: { label: string; keyName: keyof SchoolProfileForm; type?: HTMLInputTypeAttribute; placeholder?: string }) {
    return <div><label className="text-xs font-bold mb-1 block" style={{ color: 'var(--slate)' }}>{label}</label><input type={type} className="input" disabled={!canEdit} value={form[keyName]} placeholder={placeholder} onChange={(e) => setForm((current) => ({ ...current, [keyName]: e.target.value }))} /></div>;
  }

  return <div className="animate-fade-up max-w-5xl">
    <SectionHeader title={`🏫 ${t('स्कूल प्रोफ़ाइल', 'School Profile & Setup')}`} sub={t('स्कूल की पहचान, शैक्षणिक वर्ष और सेटअप स्थिति', 'Identity, academic year and operational setup')} />

    {onboarding && <div className="card mb-5"><div className="flex items-center justify-between mb-3"><h3 className="font-display font-bold" style={{ color: 'var(--navy)' }}>Setup readiness</h3><span className="font-bold" style={{ color: onboarding.isComplete ? 'var(--forest)' : 'var(--saffron)' }}>{onboarding.completed}/{onboarding.total}</span></div><div className="grid sm:grid-cols-5 gap-2">{[['profile', 'School Profile'], ['classes', 'Classes'], ['teachers', 'Teachers'], ['students', 'Students'], ['fees', 'Fees']].map(([key, label]) => <div key={key} className="p-3 rounded-xl text-xs font-bold" style={{ background: checks[key] ? 'var(--forest-pale)' : 'var(--saffron-pale)', color: checks[key] ? 'var(--forest)' : 'var(--saffron)' }}>{checks[key] ? '✓' : '○'} {label}</div>)}</div></div>}

    {!canEdit && <div className="card mb-5 text-sm" style={{ borderLeft: '4px solid var(--saffron)', color: 'var(--slate)' }}>Teacher access is read-only. School profile changes are managed by the School Administrator.</div>}

    <div className="card mb-5"><h3 className="font-display font-bold mb-4" style={{ color: 'var(--navy)' }}>School identity</h3><div className="grid md:grid-cols-2 gap-4"><Field label="School Name" keyName="name" /><Field label="Hindi Name" keyName="nameHi" /><Field label="UDISE Code" keyName="udiseCode" /><div><label className="text-xs font-bold mb-1 block" style={{ color: 'var(--slate)' }}>Board</label><select className="input select" disabled={!canEdit} value={form.board} onChange={(e) => setForm((current) => ({ ...current, board: e.target.value }))}><option value="">Select board</option>{['CBSE', 'ICSE', 'UP_BOARD', 'STATE_BOARD', 'NIOS', 'IB', 'CAMBRIDGE', 'OTHER'].map((board) => <option key={board}>{board}</option>)}</select></div><Field label="Affiliation Number" keyName="affiliationNumber" /><Field label="Principal Name" keyName="principalName" /><Field label="Academic Year" keyName="academicYear" placeholder="2026-27" /></div></div>

    <div className="card mb-5"><h3 className="font-display font-bold mb-4" style={{ color: 'var(--navy)' }}>Contact & address</h3><div className="grid md:grid-cols-2 gap-4"><Field label="Address" keyName="address" /><Field label="City" keyName="city" /><Field label="District" keyName="district" /><Field label="State" keyName="state" /><Field label="Pincode" keyName="pincode" /><Field label="School Mobile" keyName="mobile" /><Field label="School Email" keyName="email" type="email" /><Field label="Website" keyName="website" /></div></div>

    <div className="card"><h3 className="font-display font-bold mb-4" style={{ color: 'var(--navy)' }}>Administrator</h3><div className="grid md:grid-cols-2 gap-4"><Field label="Administrator Name" keyName="adminName" /><Field label="Administrator Email" keyName="adminEmail" type="email" /></div>{canEdit && <button className="btn-primary mt-5" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save School Profile'}</button>}</div>
  </div>;
}
