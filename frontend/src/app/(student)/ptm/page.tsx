'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getStudentPtmBookings } from '@/services/ptmService';
import useLanguageStore from '@/store/languageStore';
import { apiErrorText } from '@/utils/errors';

const local=(value?:string)=>value?new Date(value).toLocaleString('en-IN'):'—';

export default function StudentPtmPage(){
  const {t}=useLanguageStore();
  const q=useQuery({queryKey:['student-ptm-bookings'],queryFn:()=>getStudentPtmBookings().then(r=>r.data.data||[])});
  return <div className="animate-fade-up max-w-5xl mx-auto p-5 md:p-8">
    <div className="flex items-start justify-between gap-3 mb-5"><div><h1 className="font-display font-extrabold text-2xl" style={{color:'var(--navy)'}}>🤝 {t('PTM और फॉलो-अप','PTM & Follow-up')}</h1><p className="text-sm mt-1" style={{color:'var(--slate)'}}>{t('यह केवल देखने के लिए है। बैठक आपके अभिभावक और शिक्षक के बीच बुक होती है।','This is read-only. Meetings are booked between your Parent and Teacher.')}</p></div><Link href="/student" className="btn btn-outline text-sm">← {t('स्टूडेंट होम','Student home')}</Link></div>
    {q.isLoading?<div className="skeleton h-56 rounded-xl"/>:q.isError?<div className="card" style={{color:'#B42318'}}>{apiErrorText(q.error,'Could not load PTM')}</div>:<div className="space-y-3">{!q.data?.length?<div className="card text-center py-12" style={{color:'var(--slate)'}}>{t('अभी कोई PTM रिकॉर्ड नहीं है।','No PTM record yet.')}</div>:q.data.map(b=><div key={b.id} className="card" style={{borderLeft:b.intervention_id?'4px solid var(--saffron)':'4px solid var(--forest)'}}><div className="flex flex-wrap justify-between gap-3"><div><b>{b.session_title||'PTM'}</b><div className="text-sm mt-1" style={{color:'var(--slate)'}}>{b.teacher_name||'Teacher'} · {local(b.starts_at)} · {b.location||'School campus'}</div></div><span className="status-badge">{b.status}</span></div>{b.intervention_title&&<div className="mt-3 p-3 rounded-xl" style={{background:'#FFF8EE'}}><b className="text-sm">🎯 {b.intervention_title}</b><div className="text-xs mt-1" style={{color:'var(--slate)'}}>{t('यह बैठक आपके लर्निंग सपोर्ट फॉलो-अप से जुड़ी है।','This meeting is linked to your learning-support follow-up.')}</div></div>}{(b.agreed_action||b.outcome_note)&&<div className="mt-3 text-sm"><b>{t('सहमत अगला कदम','Agreed next action')}:</b> {b.agreed_action||b.outcome_note}</div>}{b.follow_up_at&&<div className="text-sm mt-1"><b>{t('फॉलो-अप','Follow-up')}:</b> {local(b.follow_up_at)}</div>}</div>)}</div>}
  </div>;
}
