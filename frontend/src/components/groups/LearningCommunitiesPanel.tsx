'use client';

import { useEffect,useMemo,useState } from 'react';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { createLearningCommunity,getLearningCommunities,type LearningCommunityPurpose } from '@/services/learningCommunityService';
import { getSchoolLearningTargets } from '@/services/learningVisibilityService';
import { getTeacherAcademicWorkspace } from '@/services/learningSupportService';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';
import { apiErrorText } from '@/utils/errors';

const PURPOSE:Record<LearningCommunityPurpose,{icon:string;label:string;bg:string}>={
  CONCEPT_SUPPORT:{icon:'🧠',label:'Concept Support',bg:'#EEF4FF'},
  INTERVENTION:{icon:'🎯',label:'Intervention',bg:'#FFF4E8'},
  COMPETITION_PREP:{icon:'🏆',label:'Competition Prep',bg:'#FFF8EE'},
  TEACHER_LED:{icon:'👩‍🏫',label:'Teacher Led',bg:'#ECF8F0'},
};

export default function LearningCommunitiesPanel(){
  const {t}=useLanguageStore(); const role=useAuthStore(s=>s.user?.role); const qc=useQueryClient();
  const canCreate=['TEACHER','SCHOOL_ADMIN','SUPER_ADMIN'].includes(role||'');
  const communitiesQ=useQuery({queryKey:['learning-communities'],queryFn:()=>getLearningCommunities().then(r=>r.data.data||[])});
  const targetsQ=useQuery({queryKey:['school-learning-insight-targets'],queryFn:()=>getSchoolLearningTargets().then(r=>r.data.data||[]),enabled:canCreate});
  const [targetKey,setTargetKey]=useState(''); const [conceptId,setConceptId]=useState(''); const [purpose,setPurpose]=useState<'CONCEPT_SUPPORT'|'COMPETITION_PREP'|'TEACHER_LED'>('CONCEPT_SUPPORT'); const [name,setName]=useState(''); const [description,setDescription]=useState('');
  const targets=targetsQ.data||[];
  useEffect(()=>{if(!targetKey&&targets.length){const x=targets[0];setTargetKey(`${x.class_id}|${x.subject_code}`);}},[targetKey,targets]);
  const selected=useMemo(()=>{const [classId,subjectCode]=targetKey.split('|');return targets.find(x=>x.class_id===classId&&x.subject_code===subjectCode)||null;},[targetKey,targets]);
  const workspaceQ=useQuery({queryKey:['learning-community-concepts',selected?.class_id,selected?.subject_code],queryFn:()=>getTeacherAcademicWorkspace(selected!.class_id,selected!.subject_code).then(r=>r.data.data),enabled:Boolean(canCreate&&selected)});
  const createM=useMutation({mutationFn:()=>createLearningCommunity({name,description:description||null,classId:selected!.class_id,subjectCode:selected!.subject_code,conceptId:conceptId||null,purpose}),onSuccess:async()=>{toast.success(t('कम्युनिटी अनुमोदन के लिए भेजी गई','Community sent for Platform approval'));setName('');setDescription('');await qc.invalidateQueries({queryKey:['groups-mine']});await qc.invalidateQueries({queryKey:['learning-communities']});},onError:(e:unknown)=>toast.error(apiErrorText(e,'Could not create learning Community'))});
  const visible=communitiesQ.data||[];
  return <div className="space-y-5 mb-6">
    <div className="card" style={{borderLeft:'4px solid var(--forest)',background:'linear-gradient(135deg,#F6FBF8,#fff)'}}><div className="flex flex-wrap justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wide" style={{color:'var(--forest)'}}>{t('कम्युनिटीज 2.0','Communities 2.0')}</div><h2 className="font-display font-bold text-xl mt-1" style={{color:'var(--navy)'}}>{t('चर्चा को सीखने से जोड़ें','Connect discussion back to learning')}</h2><p className="text-sm mt-2 max-w-3xl" style={{color:'var(--slate)'}}>{t('कॉन्सेप्ट सहायता, शिक्षक-नेतृत्व, प्रतियोगिता तैयारी और हस्तक्षेप समुदाय मौजूदा नियंत्रित सदस्यता, सहमति और मॉडरेशन नियमों का उपयोग करते हैं।','Concept support, Teacher-led, competition-prep and intervention Communities use the existing controlled membership, consent and moderation rules.')}</p></div><div className="text-3xl">🤝📚</div></div></div>

    {!!visible.length&&<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">{visible.slice(0,9).map(g=>{const meta=PURPOSE[g.learning_purpose];return <div key={g.id} className="card"><div className="flex justify-between gap-2"><div><span className="text-xs font-bold px-2 py-1 rounded-full" style={{background:meta?.bg||'#F4F6F9'}}>{meta?.icon} {meta?.label||g.learning_purpose}</span><h3 className="font-bold mt-3" style={{color:'var(--navy)'}}>{g.name}</h3></div><span className="status-badge">{g.status}</span></div><p className="text-sm mt-2 line-clamp-2" style={{color:'var(--slate)'}}>{g.description}</p><div className="text-xs mt-3" style={{color:'var(--slate)'}}>{g.subject_code||''}{g.concept_name?` · ${t(g.concept_name_hi||g.concept_name,g.concept_name)}`:''} · {Number(g.member_count||0)} members</div></div>;})}</div>}

    {canCreate&&<div className="card"><h3 className="font-display font-bold text-lg">➕ {t('लर्निंग कम्युनिटी बनाएं','Create learning Community')}</h3><p className="text-xs mt-1" style={{color:'var(--slate)'}}>{t('नई कम्युनिटी हमेशा Platform approval के लिए PENDING रहती है।','New Communities remain PENDING for Platform approval.')}</p><div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 mt-4"><select className="input select" value={targetKey} onChange={e=>{setTargetKey(e.target.value);setConceptId('');}}>{targets.map(x=><option key={`${x.class_id}-${x.subject_code}`} value={`${x.class_id}|${x.subject_code}`}>{x.class_name}{x.section?`-${x.section}`:''} · {x.subject_name}</option>)}</select><select className="input select" value={purpose} onChange={e=>setPurpose(e.target.value as typeof purpose)}><option value="CONCEPT_SUPPORT">Concept Support</option><option value="TEACHER_LED">Teacher Led</option><option value="COMPETITION_PREP">Competition Prep</option></select><select className="input select" value={conceptId} onChange={e=>setConceptId(e.target.value)}><option value="">{t('कॉन्सेप्ट (वैकल्पिक)','Concept (optional)')}</option>{(workspaceQ.data?.learning.concepts||[]).map(c=><option key={c.conceptId} value={c.conceptId}>{c.name}</option>)}</select><input className="input" placeholder="Community name" value={name} onChange={e=>setName(e.target.value)}/><textarea className="input md:col-span-2 lg:col-span-3 min-h-20" placeholder="Learning purpose and participation expectations" value={description} onChange={e=>setDescription(e.target.value)}/><button className="btn btn-primary self-end" disabled={!selected||name.trim().length<3||(purpose==='CONCEPT_SUPPORT'&&!conceptId)||createM.isPending} onClick={()=>createM.mutate()}>{t('अनुमोदन के लिए भेजें','Request approval')}</button></div></div>}
  </div>;
}
