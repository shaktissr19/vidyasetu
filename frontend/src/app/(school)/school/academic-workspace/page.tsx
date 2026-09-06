'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { SectionHeader } from '@/components/ui/index';
import { getSchoolLearningTargets } from '@/services/learningVisibilityService';
import { createInterventionCommunity, createLearningIntervention, getTeacherAcademicWorkspace, updateLearningIntervention } from '@/services/learningSupportService';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';
import { apiErrorText } from '@/utils/errors';

export default function AcademicWorkspacePage() {
  const { t } = useLanguageStore();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [targetKey,setTargetKey]=useState('');
  const [conceptId,setConceptId]=useState('');
  const [studentIds,setStudentIds]=useState<string[]>([]);
  const [title,setTitle]=useState('');
  const [reason,setReason]=useState('');
  const [instructions,setInstructions]=useState('');
  const [priority,setPriority]=useState<'HIGH'|'FOCUS'|'ROUTINE'>('FOCUS');

  const targetsQ=useQuery({queryKey:['school-learning-insight-targets'],queryFn:()=>getSchoolLearningTargets().then((r)=>r.data.data||[])});
  const targets=targetsQ.data||[];
  useEffect(()=>{if(!targetKey&&targets.length){const x=targets[0];setTargetKey(`${x.class_id}|${x.subject_code}`);}},[targetKey,targets]);
  const selected=useMemo(()=>{const [classId,subjectCode]=targetKey.split('|');return targets.find((x)=>x.class_id===classId&&x.subject_code===subjectCode)||null;},[targetKey,targets]);
  const workspaceQ=useQuery({queryKey:['teacher-academic-workspace',selected?.class_id,selected?.subject_code],queryFn:()=>getTeacherAcademicWorkspace(selected!.class_id,selected!.subject_code).then((r)=>r.data.data),enabled:Boolean(selected),staleTime:10_000});
  const data=workspaceQ.data;

  const createMutation=useMutation({
    mutationFn:()=>createLearningIntervention({classId:selected!.class_id,subjectCode:selected!.subject_code,conceptId:conceptId||null,studentIds,title,reason,priority,actionPlan:{actionType:'FOCUSED_SUPPORT',instructions,estimatedMinutes:20}}),
    onSuccess:async()=>{toast.success(t('लर्निंग हस्तक्षेप बनाया गया','Learning intervention created'));setStudentIds([]);setTitle('');setReason('');setInstructions('');await qc.invalidateQueries({queryKey:['teacher-academic-workspace']});},
    onError:(error:unknown)=>toast.error(apiErrorText(error,'Could not create intervention')),
  });
  const statusMutation=useMutation({
    mutationFn:({id,status}:{id:string;status:'IN_PROGRESS'|'PTM_REQUESTED'|'RESOLVED'|'CLOSED'})=>updateLearningIntervention(id,status),
    onSuccess:async()=>{toast.success('Intervention updated');await qc.invalidateQueries({queryKey:['teacher-academic-workspace']});},
    onError:(error:unknown)=>toast.error(apiErrorText(error,'Could not update intervention')),
  });
  const communityMutation=useMutation({
    mutationFn:(id:string)=>createInterventionCommunity(id),
    onSuccess:async()=>{toast.success(t('कम्युनिटी अनुमोदन के लिए भेजी गई','Community sent for Platform approval'));await qc.invalidateQueries({queryKey:['teacher-academic-workspace']});},
    onError:(error:unknown)=>toast.error(apiErrorText(error,'Could not create learning Community')),
  });

  function toggleStudent(id:string){setStudentIds((current)=>current.includes(id)?current.filter((x)=>x!==id):[...current,id]);}
  const concept=conceptId?data?.learning.concepts.find((x)=>x.conceptId===conceptId):null;
  const canCreate=user?.role==='TEACHER';

  return <div className="animate-fade-up">
    <SectionHeader title={`🎯 ${t('शिक्षक अकादमिक वर्कस्पेस','Teacher Academic Workspace')}`} sub={t('लर्निंग प्रमाण को कक्षा कार्रवाई, परिवार सहयोग और फॉलो-अप में बदलें','Turn learning evidence into classroom action, family support and follow-up')} />
    <div className="card mb-5"><label className="text-xs font-bold block mb-1.5">{t('कक्षा और विषय','Class & Subject')}</label><select className="input select max-w-xl" value={targetKey} onChange={(e)=>{setTargetKey(e.target.value);setConceptId('');setStudentIds([]);}}>{targets.map((x)=><option key={`${x.class_id}-${x.subject_code}`} value={`${x.class_id}|${x.subject_code}`}>{x.class_name}{x.section?`-${x.section}`:''} · {x.subject_name}</option>)}</select></div>

    {workspaceQ.isLoading||targetsQ.isLoading?<div className="space-y-4"><div className="skeleton h-32 rounded-xl"/><div className="skeleton h-72 rounded-xl"/></div>:workspaceQ.isError?<div className="card" style={{color:'#B42318'}}>{apiErrorText(workspaceQ.error,'Could not load academic workspace')}</div>:data?<>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="card"><div className="text-2xl font-black" style={{color:'#B42318'}}>{data.learning.summary.studentsNeedingReview}</div><div className="text-xs">{t('समीक्षा चाहिए','Students needing review')}</div></div>
        <div className="card"><div className="text-2xl font-black" style={{color:'#9A6500'}}>{data.diagnostics.summary.activeMisconceptionStudents}</div><div className="text-xs">{t('गलतफहमी संकेत','Misconception signals')}</div></div>
        <div className="card"><div className="text-2xl font-black">{data.actionSummary.openInterventions}</div><div className="text-xs">{t('सक्रिय हस्तक्षेप','Open interventions')}</div></div>
        <div className="card"><div className="text-2xl font-black" style={{color:'var(--forest)'}}>{data.actionSummary.parentAcknowledged}</div><div className="text-xs">{t('अभिभावक प्रतिक्रिया','Parent acknowledged')}</div></div>
      </div>

      {!!data.diagnostics.misconceptionClusters.length&&<div className="card mb-5" style={{borderLeft:'4px solid #9A6500'}}><h3 className="font-display font-bold">🧠 {t('साझा गलतफहमियाँ','Shared misconceptions')}</h3><div className="grid md:grid-cols-2 gap-3 mt-4">{data.diagnostics.misconceptionClusters.slice(0,6).map((x)=><div key={`${x.conceptId}-${x.misconceptionCode}`} className="p-3 rounded-xl" style={{background:'#FFF8EE'}}><b>{x.misconceptionCode}</b><div className="text-sm mt-1" style={{color:'var(--slate)'}}>{x.affectedStudents} {t('छात्र प्रभावित','students affected')} · {x.activeStudents} active</div></div>)}</div></div>}

      <div className="grid xl:grid-cols-[1.15fr_.85fr] gap-5 mb-5">
        <div className="card"><h3 className="font-display font-bold text-lg">{t('कक्षा नॉलेज मैप','Class knowledge map')}</h3><div className="overflow-x-auto mt-4"><table className="tbl"><thead><tr><th>{t('छात्र','Student')}</th><th>{t('समीक्षा','Review')}</th><th>{t('अभ्यास','Practice')}</th><th>{t('मास्टर्ड','Mastered')}</th><th>{t('डायग्नोस्टिक','Diagnostic')}</th></tr></thead><tbody>{data.learning.students.map((s)=>{const d=data.diagnostics.students.find((x)=>x.studentId===s.studentId);return <tr key={s.studentId} style={s.attentionRequired?{background:'#FFF9F7'}:undefined}><td><b>{s.name}</b><div className="text-xs" style={{color:'var(--slate)'}}>{s.studentCode}</div></td><td>{s.summary.needsReview}</td><td>{s.summary.practising}</td><td>{s.summary.mastered}</td><td className="text-xs">{d?.misconceptionConcepts||0} misconception · {d?.reviewDueConcepts||0} review due</td></tr>;})}</tbody></table></div></div>
        <div className="card"><h3 className="font-display font-bold text-lg">{t('कॉन्सेप्ट प्राथमिकता','Concept priorities')}</h3><div className="space-y-2 mt-4">{data.learning.concepts.slice(0,10).map((c)=>{const d=data.diagnostics.concepts.find((x)=>x.conceptId===c.conceptId);return <button type="button" key={c.conceptId} onClick={()=>setConceptId(c.conceptId)} className="w-full p-3 rounded-xl text-left" style={{border:`1px solid ${conceptId===c.conceptId?'var(--saffron)':'var(--border)'}`,background:conceptId===c.conceptId?'#FFF8EE':'#fff'}}><div className="flex justify-between gap-2"><b>{c.name}</b><span className="text-xs">{c.summary.needsReview} review</span></div><div className="text-xs mt-1" style={{color:'var(--slate)'}}>{d?.misconceptionSignals||0} misconception · {d?.lowConfidence||0} low confidence · {d?.reviewDue||0} review due</div></button>;})}</div></div>
      </div>

      {canCreate&&<div className="card mb-5" style={{borderLeft:'4px solid var(--saffron)'}}><h3 className="font-display font-bold text-lg">➕ {t('केंद्रित हस्तक्षेप बनाएं','Create focused intervention')}</h3><p className="text-sm mt-1" style={{color:'var(--slate)'}}>{concept?t('चुना कॉन्सेप्ट','Selected concept')+`: ${concept.name}`:t('पहले ऊपर कॉन्सेप्ट चुनें','Choose a concept above first')}</p><div className="grid md:grid-cols-2 gap-4 mt-4"><div><label className="text-xs font-bold">{t('शीर्षक','Title')}</label><input className="input mt-1" value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Pressure misconception repair"/></div><div><label className="text-xs font-bold">{t('प्राथमिकता','Priority')}</label><select className="input select mt-1" value={priority} onChange={(e)=>setPriority(e.target.value as typeof priority)}><option value="HIGH">High</option><option value="FOCUS">Focus</option><option value="ROUTINE">Routine</option></select></div><div className="md:col-span-2"><label className="text-xs font-bold">{t('क्यों','Why')}</label><textarea className="input mt-1 min-h-20" value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Evidence-based reason for support"/></div><div className="md:col-span-2"><label className="text-xs font-bold">{t('सुझाया गया कदम','Recommended action')}</label><textarea className="input mt-1 min-h-20" value={instructions} onChange={(e)=>setInstructions(e.target.value)} placeholder="Revise the worked example, then complete short practice"/></div></div><div className="mt-4"><div className="text-xs font-bold mb-2">{t('छात्र चुनें','Select Students')} ({studentIds.length})</div><div className="flex flex-wrap gap-2">{data.learning.students.map((s)=><button type="button" key={s.studentId} onClick={()=>toggleStudent(s.studentId)} className="px-3 py-2 rounded-xl text-xs font-bold" style={{background:studentIds.includes(s.studentId)?'var(--navy)':'#F4F6F9',color:studentIds.includes(s.studentId)?'#fff':'var(--slate)'}}>{s.name}</button>)}</div></div><button className="btn btn-primary mt-5" disabled={!conceptId||!studentIds.length||title.trim().length<3||reason.trim().length<5||createMutation.isPending} onClick={()=>createMutation.mutate()}>{t('लर्निंग सपोर्ट असाइन करें','Assign learning support')}</button></div>}

      <div className="card"><div className="flex items-center justify-between gap-3"><h3 className="font-display font-bold text-lg">📌 {t('हस्तक्षेप और फॉलो-अप','Interventions & follow-up')}</h3><Link href="/school/ptm" className="btn btn-outline text-sm">{t('PTM वर्कस्पेस','PTM workspace')}</Link></div><div className="space-y-3 mt-4">{!data.interventions.length?<div className="text-center py-10 text-sm" style={{color:'var(--slate)'}}>{t('अभी कोई हस्तक्षेप नहीं है।','No interventions yet.')}</div>:data.interventions.map((item)=><div key={item.id} className="p-4 rounded-xl" style={{border:'1px solid var(--border)',background:item.priority==='HIGH'?'#FFF7F4':'#fff'}}><div className="flex flex-wrap justify-between gap-3"><div><div className="flex gap-2 flex-wrap"><span className="status-badge">{item.priority}</span><span className="status-badge">{item.status.replaceAll('_',' ')}</span></div><b className="block mt-2">{item.title}</b><div className="text-xs mt-1" style={{color:'var(--slate)'}}>{item.concept_name||item.subject_code} · {Number(item.participant_count||0)} students · {Number(item.acknowledgement_count||0)} parent acknowledged</div></div><div className="flex gap-2 flex-wrap">{!item.community_group_id&&<button className="btn btn-outline text-xs" onClick={()=>communityMutation.mutate(item.id)}>🤝 Community</button>}{!['PTM_REQUESTED','RESOLVED','CLOSED'].includes(item.status)&&<button className="btn btn-outline text-xs" onClick={()=>statusMutation.mutate({id:item.id,status:'PTM_REQUESTED'})}>📅 Request PTM</button>}{!['RESOLVED','CLOSED'].includes(item.status)&&<button className="btn btn-primary text-xs" onClick={()=>statusMutation.mutate({id:item.id,status:'RESOLVED'})}>✓ Resolve</button>}</div></div><p className="text-sm mt-3" style={{color:'var(--slate)'}}>{item.reason}</p>{item.community_group_id&&<Link href="/school/groups" className="text-xs font-bold mt-3 inline-block" style={{color:'var(--forest)'}}>🤝 {t('लिंक्ड कम्युनिटी खोलें','Open linked Community')}</Link>}</div>)}</div></div>
    </>:null}
  </div>;
}
