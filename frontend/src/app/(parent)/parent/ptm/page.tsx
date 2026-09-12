'use client';

import { useEffect,useMemo,useState } from 'react';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import ParentChildSwitcher from '@/components/parent/ParentChildSwitcher';
import { useParentChildContext } from '@/hooks/useParentChildContext';
import { getParentLearningSupport } from '@/services/learningSupportService';
import { bookParentPtmSlot,cancelParentPtmBooking,getParentPtmBookings,getParentPtmOptions } from '@/services/ptmService';
import useLanguageStore from '@/store/languageStore';
import { apiErrorText } from '@/utils/errors';

const local=(value?:string)=>value?new Date(value).toLocaleString('en-IN'):'—';

export default function ParentPtmPage(){
  const {t}=useLanguageStore();
  const qc=useQueryClient();
  const {children,selectedChildId:studentId,setSelectedChildId}=useParentChildContext();
  const [interventionId,setInterventionId]=useState('');
  useEffect(()=>{if(typeof window==='undefined')return;const params=new URLSearchParams(window.location.search);const queryStudent=params.get('studentId');const queryIntervention=params.get('interventionId');if(queryStudent)setSelectedChildId(queryStudent);if(queryIntervention)setInterventionId(queryIntervention);},[setSelectedChildId]);
  const supportQ=useQuery({queryKey:['parent-learning-support',studentId],queryFn:()=>getParentLearningSupport(studentId!).then(r=>r.data.data),enabled:Boolean(studentId)});
  const optionsQ=useQuery({queryKey:['parent-ptm-options',studentId],queryFn:()=>getParentPtmOptions(studentId!).then(r=>r.data.data||[]),enabled:Boolean(studentId)});
  const bookingsQ=useQuery({queryKey:['parent-ptm-bookings',studentId],queryFn:()=>getParentPtmBookings(studentId!).then(r=>r.data.data||[]),enabled:Boolean(studentId)});
  const refresh=async()=>{await Promise.all([qc.invalidateQueries({queryKey:['parent-ptm-options',studentId]}),qc.invalidateQueries({queryKey:['parent-ptm-bookings',studentId]}),qc.invalidateQueries({queryKey:['parent-learning-support',studentId]})]);};
  const bookM=useMutation({mutationFn:(slotId:string)=>{if(!studentId)throw new Error('No child selected');return bookParentPtmSlot(studentId,slotId,{interventionId:interventionId||null});},onSuccess:async()=>{toast.success(t('PTM बुक हो गई','PTM booked'));await refresh();},onError:(e:unknown)=>toast.error(apiErrorText(e,'Could not book PTM'))});
  const cancelM=useMutation({mutationFn:(bookingId:string)=>cancelParentPtmBooking(bookingId),onSuccess:async()=>{toast.success(t('PTM रद्द हुई','PTM cancelled'));await refresh();},onError:(e:unknown)=>toast.error(apiErrorText(e,'Could not cancel PTM'))});
  const error=optionsQ.error||bookingsQ.error;
  const upcoming=(bookingsQ.data||[]).filter(b=>b.status==='BOOKED');
  const eligibleInterventions=useMemo(()=>(supportQ.data?.interventions||[]).filter(i=>!['RESOLVED','CLOSED'].includes(i.status)),[supportQ.data]);

  return <div className="animate-fade-up space-y-5">
    <div><h1 className="font-display font-extrabold text-2xl" style={{color:'var(--navy)'}}>🤝 {t('अभिभावक–शिक्षक बैठक','Parent–Teacher Meetings')}</h1><p className="text-sm mt-1" style={{color:'var(--slate)'}}>{t('सीखने के प्रमाण और शिक्षक हस्तक्षेप के आधार पर सही शिक्षक के साथ फॉलो-अप बुक करें।','Book follow-up with the right Teacher using learning evidence and intervention context.')}</p></div>
    <ParentChildSwitcher children={children} selectedChildId={studentId} onSelect={(id)=>{setSelectedChildId(id);setInterventionId('');}} />
    {error&&<div className="card" style={{color:'#B42318'}}>{apiErrorText(error)}</div>}

    <div className="card" style={{borderLeft:'4px solid var(--forest)'}}><label className="text-xs font-bold block mb-1.5">{t('लर्निंग हस्तक्षेप से लिंक करें (वैकल्पिक)','Link to a learning intervention (optional)')}</label><select className="input select max-w-2xl" value={interventionId} onChange={e=>setInterventionId(e.target.value)}><option value="">{t('सामान्य PTM — कोई हस्तक्षेप लिंक नहीं','General PTM — no intervention link')}</option>{eligibleInterventions.map(i=><option key={i.id} value={i.id}>{i.title} · {i.teacher_name||'Teacher'} · {i.status.replaceAll('_',' ')}</option>)}</select>{interventionId&&<p className="text-xs mt-2" style={{color:'var(--slate)'}}>{t('यह बैठक उसी लर्निंग सपोर्ट रिकॉर्ड और उसके फॉलो-अप से जुड़ी रहेगी।','This meeting will remain linked to the same learning-support record and follow-up.')}</p>}</div>

    <div className="card"><h2 className="font-bold text-lg mb-3">{t('आगामी बैठकें','Upcoming appointments')}</h2>{bookingsQ.isLoading?<p>Loading…</p>:!upcoming.length?<p className="text-sm" style={{color:'var(--slate)'}}>{t('इस बच्चे के लिए कोई PTM बुक नहीं है।','No PTM appointment is booked for this child.')}</p>:<div className="grid md:grid-cols-2 gap-3">{upcoming.map(b=><div key={b.id} className="p-4 rounded-xl" style={{border:'1px solid var(--border)',background:'#F8FBF9'}}><div className="font-bold">{b.session_title||'PTM'}</div><div className="text-sm mt-2"><b>{t('शिक्षक','Teacher')}:</b> {b.teacher_name||'—'}</div><div className="text-sm"><b>{t('समय','When')}:</b> {local(b.starts_at)}</div><div className="text-sm"><b>{t('स्थान','Location')}:</b> {b.location||'School campus'}</div>{b.intervention_title&&<div className="text-xs mt-2 p-2 rounded-lg" style={{background:'#FFF8EE'}}>🎯 {b.intervention_title}</div>}<button className="btn btn-outline mt-3 text-sm" disabled={cancelM.isPending} onClick={()=>cancelM.mutate(b.id)}>{t('बैठक रद्द करें','Cancel appointment')}</button></div>)}</div>}</div>

    <div className="card"><h2 className="font-bold text-lg mb-3">{t('उपलब्ध शिक्षक स्लॉट','Available Teacher slots')}</h2>{optionsQ.isLoading?<p>Loading…</p>:!(optionsQ.data||[]).length?<p className="text-sm" style={{color:'var(--slate)'}}>{t('अभी कोई बुक करने योग्य स्लॉट नहीं है।','No bookable PTM slots are currently open.')}</p>:<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">{(optionsQ.data||[]).map(s=><div key={s.id} className="p-4 rounded-xl" style={{border:'1px solid var(--border)'}}><div className="font-bold">{s.teacher_name||'Teacher'}</div>{s.subjects&&<div className="text-xs mt-1" style={{color:'var(--slate)'}}>{s.subjects}</div>}<div className="text-sm mt-3">{local(s.starts_at)}</div><div className="text-sm">{s.location||'School campus'}</div><button className="btn btn-primary mt-3 text-sm" disabled={bookM.isPending||!studentId} onClick={()=>bookM.mutate(s.id)}>{t('यह स्लॉट बुक करें','Book this slot')}</button></div>)}</div>}</div>

    <div className="card"><h2 className="font-bold text-lg mb-3">{t('बैठक और फॉलो-अप इतिहास','Meeting & follow-up history')}</h2><div className="overflow-x-auto"><table className="tbl"><thead><tr><th>{t('बैठक','Meeting')}</th><th>{t('शिक्षक','Teacher')}</th><th>{t('समय','Time')}</th><th>{t('स्थिति','Status')}</th><th>{t('सहमत कार्रवाई','Agreed action')}</th><th>{t('फॉलो-अप','Follow-up')}</th></tr></thead><tbody>{(bookingsQ.data||[]).map(b=><tr key={b.id}><td>{b.session_title||'PTM'}{b.intervention_title&&<div className="text-xs">🎯 {b.intervention_title}</div>}</td><td>{b.teacher_name||'—'}</td><td>{local(b.starts_at)}</td><td>{b.status}</td><td>{b.agreed_action||b.outcome_note||'—'}</td><td>{local(b.follow_up_at||undefined)}</td></tr>)}</tbody></table>{!bookingsQ.isLoading&&!(bookingsQ.data||[]).length&&<div className="py-6 text-center text-sm" style={{color:'var(--slate)'}}>{t('अभी कोई PTM इतिहास नहीं है।','No PTM history yet.')}</div>}</div></div>
  </div>;
}
