'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getOverview, getSchoolProfile, updateSchoolProfile } from '@/services/schoolService';
import { SectionHeader, CardSkeleton } from '@/components/ui/index';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

const errorText = e => e?.response?.data?.error?.message || e?.message || 'Request failed';

export default function SchoolProfilePage() {
  const { user } = useAuthStore();
  const { t } = useLanguageStore();
  const qc = useQueryClient();
  const canEdit = ['SCHOOL_ADMIN','SUPER_ADMIN'].includes(user?.role);
  const profileQ = useQuery({ queryKey: ['school-profile'], queryFn: () => getSchoolProfile().then(r => r.data.data) });
  const overviewQ = useQuery({ queryKey: ['school-overview'], queryFn: () => getOverview().then(r => r.data.data) });
  const [form, setForm] = useState({});

  useEffect(() => {
    if (!profileQ.data) return;
    const p = profileQ.data;
    setForm({
      name: p.name || '', nameHi: p.name_hi || '', udiseCode: p.udise_code || '',
      board: p.board || '', affiliationNumber: p.affiliation_number || '', principalName: p.principal_name || '',
      address: p.address || '', city: p.city || '', district: p.district || '', state: p.state || '', pincode: p.pincode || '',
      mobile: p.mobile || '', email: p.email || '', website: p.website || '', academicYear: p.academic_year || '',
      adminName: p.admin_name || '', adminEmail: p.admin_email || '',
    });
  }, [profileQ.data]);

  const save = useMutation({
    mutationFn: () => updateSchoolProfile(Object.fromEntries(Object.entries(form).filter(([,v]) => v !== ''))),
    onSuccess: async () => { toast.success('School profile updated'); await Promise.all([qc.invalidateQueries({queryKey:['school-profile']}),qc.invalidateQueries({queryKey:['school-overview']})]); },
    onError: e => toast.error(errorText(e)),
  });

  if (profileQ.isLoading) return <div className="grid md:grid-cols-2 gap-4"><CardSkeleton/><CardSkeleton/></div>;
  const onboarding = overviewQ.data?.onboarding;
  const checks = onboarding?.checks || {};

  const Field = ({ label, keyName, type='text', placeholder='' }) => <div>
    <label className="text-xs font-bold mb-1 block" style={{ color:'var(--slate)' }}>{label}</label>
    <input type={type} className="input" disabled={!canEdit} value={form[keyName] || ''} placeholder={placeholder} onChange={e=>setForm(f=>({...f,[keyName]:e.target.value}))}/>
  </div>;

  return <div className="animate-fade-up max-w-5xl">
    <SectionHeader title={`🏫 ${t('स्कूल प्रोफ़ाइल', 'School Profile & Setup')}`} sub={t('स्कूल की पहचान, शैक्षणिक वर्ष और सेटअप स्थिति', 'Identity, academic year and operational setup')}/>

    {onboarding && <div className="card mb-5">
      <div className="flex items-center justify-between mb-3"><h3 className="font-display font-bold" style={{color:'var(--navy)'}}>Setup readiness</h3><span className="font-bold" style={{color:onboarding.isComplete?'var(--forest)':'var(--saffron)'}}>{onboarding.completed}/{onboarding.total}</span></div>
      <div className="grid sm:grid-cols-5 gap-2">
        {[['profile','School Profile'],['classes','Classes'],['teachers','Teachers'],['students','Students'],['fees','Fees']].map(([k,l])=><div key={k} className="p-3 rounded-xl text-xs font-bold" style={{background:checks[k]?'var(--forest-pale)':'var(--saffron-pale)',color:checks[k]?'var(--forest)':'var(--saffron)'}}>{checks[k]?'✓':'○'} {l}</div>)}
      </div>
    </div>}

    {!canEdit && <div className="card mb-5 text-sm" style={{borderLeft:'4px solid var(--saffron)',color:'var(--slate)'}}>Teacher access is read-only. School profile changes are managed by the School Administrator.</div>}

    <div className="card mb-5">
      <h3 className="font-display font-bold mb-4" style={{color:'var(--navy)'}}>School identity</h3>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="School Name" keyName="name"/><Field label="Hindi Name" keyName="nameHi"/>
        <Field label="UDISE Code" keyName="udiseCode"/><div><label className="text-xs font-bold mb-1 block" style={{color:'var(--slate)'}}>Board</label><select className="input select" disabled={!canEdit} value={form.board||''} onChange={e=>setForm(f=>({...f,board:e.target.value}))}><option value="">Select board</option>{['CBSE','ICSE','UP_BOARD','STATE_BOARD','NIOS','IB','CAMBRIDGE','OTHER'].map(x=><option key={x}>{x}</option>)}</select></div>
        <Field label="Affiliation Number" keyName="affiliationNumber"/><Field label="Principal Name" keyName="principalName"/>
        <Field label="Academic Year" keyName="academicYear" placeholder="2026-27"/>
      </div>
    </div>

    <div className="card mb-5">
      <h3 className="font-display font-bold mb-4" style={{color:'var(--navy)'}}>Contact & address</h3>
      <div className="grid md:grid-cols-2 gap-4"><Field label="Address" keyName="address"/><Field label="City" keyName="city"/><Field label="District" keyName="district"/><Field label="State" keyName="state"/><Field label="Pincode" keyName="pincode"/><Field label="School Mobile" keyName="mobile"/><Field label="School Email" keyName="email" type="email"/><Field label="Website" keyName="website"/></div>
    </div>

    <div className="card">
      <h3 className="font-display font-bold mb-4" style={{color:'var(--navy)'}}>Administrator</h3>
      <div className="grid md:grid-cols-2 gap-4"><Field label="Administrator Name" keyName="adminName"/><Field label="Administrator Email" keyName="adminEmail" type="email"/></div>
      {canEdit && <button className="btn-primary mt-5" disabled={save.isPending} onClick={()=>save.mutate()}>{save.isPending?'Saving…':'Save School Profile'}</button>}
    </div>
  </div>;
}
