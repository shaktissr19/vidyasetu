'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { SectionHeader } from '@/components/ui/index';
import { getChildren } from '@/services/parentService';
import { acknowledgeParentIntervention, getParentLearningSupport } from '@/services/learningSupportService';
import useLanguageStore from '@/store/languageStore';
import { apiErrorText } from '@/utils/errors';

export default function ParentLearningSupportPage() {
  const { t } = useLanguageStore();
  const qc = useQueryClient();
  const [studentId, setStudentId] = useState<string>('');
  const childrenQ = useQuery({ queryKey: ['parent-children'], queryFn: () => getChildren().then((r) => r.data.data) });
  useEffect(() => { if (!studentId && childrenQ.data?.length) setStudentId(childrenQ.data[0]?.id || ''); }, [childrenQ.data, studentId]);
  const supportQ = useQuery({
    queryKey: ['parent-learning-support', studentId],
    queryFn: () => getParentLearningSupport(studentId).then((r) => r.data.data),
    enabled: Boolean(studentId),
    staleTime: 15_000,
  });
  const ack = useMutation({
    mutationFn: (interventionId: string) => acknowledgeParentIntervention(studentId, interventionId),
    onSuccess: async () => { toast.success(t('लर्निंग सपोर्ट देखा गया', 'Learning support acknowledged')); await qc.invalidateQueries({ queryKey: ['parent-learning-support', studentId] }); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not acknowledge learning support')),
  });
  const data = supportQ.data;

  return <div className="animate-fade-up">
    <SectionHeader title={`🤝 ${t('लर्निंग सपोर्ट', 'Learning Support')}`} sub={t('समझें कि बच्चे को अभी कहाँ सहायता चाहिए और अगला उपयोगी कदम क्या है', 'See what matters now, why it matters, and the most useful next support action')} />

    {!!childrenQ.data?.length && <div className="flex gap-2 flex-wrap mb-5">
      {childrenQ.data.map((child) => <button key={child.id} type="button" onClick={() => setStudentId(child.id)} className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: studentId === child.id ? 'var(--forest)' : '#fff', color: studentId === child.id ? '#fff' : 'var(--slate)', border: '1px solid var(--border)' }}>{child.name.split(' ')[0]} · {t('कक्षा', 'Class')} {child.class_name}</button>)}
    </div>}

    {supportQ.isLoading || childrenQ.isLoading ? <div className="space-y-4"><div className="skeleton h-36 rounded-xl"/><div className="skeleton h-64 rounded-xl"/></div> : supportQ.isError ? <div className="card" style={{ color:'#B42318' }}>{apiErrorText(supportQ.error,'Could not load learning support')}</div> : !data ? <div className="card text-center py-12">{t('कोई लिंक किया हुआ बच्चा उपलब्ध नहीं है', 'No linked child is available')}</div> : <>
      <div className="card mb-5" style={{ borderLeft:'4px solid var(--forest)', background:'linear-gradient(135deg,#F5FBF7,#fff)' }}>
        <div className="text-xs font-bold uppercase tracking-wide" style={{ color:'var(--forest)' }}>{t('इस सप्ताह', 'This week')}</div>
        <h2 className="font-display font-bold text-xl mt-2" style={{ color:'var(--navy)' }}>{data.student.name}</h2>
        <p className="mt-3 leading-7" style={{ color:'var(--slate)' }}>{data.weeklyBrief}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <div className="p-3 rounded-xl bg-white"><b className="text-xl">{data.diagnostics.summary.strongConcepts}</b><div className="text-xs">{t('मजबूत कॉन्सेप्ट','Strong concepts')}</div></div>
          <div className="p-3 rounded-xl bg-white"><b className="text-xl" style={{ color:'#B42318' }}>{data.diagnostics.summary.needsSupport}</b><div className="text-xs">{t('सहायता चाहिए','Need support')}</div></div>
          <div className="p-3 rounded-xl bg-white"><b className="text-xl" style={{ color:'#9A6500' }}>{data.diagnostics.summary.reviewDue}</b><div className="text-xs">{t('रिवीजन बाकी','Review due')}</div></div>
          <div className="p-3 rounded-xl bg-white"><b className="text-xl">{data.interventionSummary.active}</b><div className="text-xs">{t('सक्रिय सपोर्ट','Active support')}</div></div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        <div className="card">
          <h3 className="font-display font-bold text-lg" style={{ color:'var(--navy)' }}>💡 {t('घर पर कैसे मदद करें', 'How to help at home')}</h3>
          <div className="space-y-3 mt-4">
            {data.supportCards.length ? data.supportCards.map((card,index) => <div key={`${card.type}-${index}`} className="p-3 rounded-xl" style={{ background:'#F7F9FC', border:'1px solid var(--border)' }}><b>{t(card.titleHi || card.title,card.title)}</b><p className="text-sm mt-1" style={{ color:'var(--slate)' }}>{card.text}</p></div>) : <div className="text-sm py-8 text-center" style={{ color:'var(--slate)' }}>{t('अभी कोई अतिरिक्त सहायता संकेत नहीं है।','No additional support signal right now.')}</div>}
          </div>
        </div>
        <div className="card">
          <h3 className="font-display font-bold text-lg" style={{ color:'var(--navy)' }}>🧭 {t('अगले सीखने के कदम', 'Next learning steps')}</h3>
          <div className="space-y-3 mt-4">
            {data.learning.nextActions.slice(0,3).map((action) => <div key={`${action.rank}-${action.conceptCode}`} className="p-3 rounded-xl" style={{ background:'#FFF8EE' }}><div className="flex justify-between gap-2"><b>{action.title}</b><span className="text-xs font-bold">~{action.estimatedMinutes} min</span></div><div className="text-xs mt-1" style={{ color:'var(--slate)' }}>{action.conceptName}</div><p className="text-sm mt-2" style={{ color:'var(--slate)' }}>{action.reason}</p></div>)}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-display font-bold text-lg" style={{ color:'var(--navy)' }}>👩‍🏫 {t('शिक्षक लर्निंग सपोर्ट', 'Teacher learning support')}</h3><p className="text-xs mt-1" style={{ color:'var(--slate)' }}>{t('शिक्षक द्वारा सुझाए गए केंद्रित हस्तक्षेप और फॉलो-अप','Focused interventions and follow-up recommended by the Teacher')}</p></div><Link href="/parent/ptm" className="btn btn-outline text-sm">{t('PTM देखें','Open PTM')}</Link></div>
        <div className="space-y-3 mt-4">
          {!data.interventions.length ? <div className="text-sm text-center py-10" style={{ color:'var(--slate)' }}>{t('अभी कोई शिक्षक हस्तक्षेप नहीं है।','No Teacher intervention is active right now.')}</div> : data.interventions.map((item) => <div key={item.id} className="p-4 rounded-xl" style={{ border:'1px solid var(--border)', background:item.priority==='HIGH'?'#FFF7F4':'#fff' }}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex gap-2 flex-wrap"><span className="status-badge">{item.priority}</span><span className="status-badge">{item.status.replaceAll('_',' ')}</span></div><h4 className="font-bold mt-2">{item.title}</h4><div className="text-xs mt-1" style={{ color:'var(--slate)' }}>{item.teacher_name || 'Teacher'}{item.concept_name ? ` · ${t(item.concept_name_hi || item.concept_name,item.concept_name)}`:''}</div></div>{!item.parent_acknowledged_at && !['RESOLVED','CLOSED'].includes(item.status) ? <button className="btn btn-primary text-sm" disabled={ack.isPending} onClick={() => ack.mutate(item.id)}>{t('देख लिया','Acknowledge')}</button> : <span className="text-xs font-bold" style={{ color:'var(--forest)' }}>✓ {t('देखा गया','Acknowledged')}</span>}</div>
            <p className="text-sm mt-3" style={{ color:'var(--slate)' }}>{item.reason}</p>
            {item.action_plan?.instructions && <div className="mt-3 p-3 rounded-lg" style={{ background:'#F7F9FC' }}><b className="text-xs">{t('सुझाया गया कदम','Recommended action')}</b><p className="text-sm mt-1">{item.action_plan.instructions}</p></div>}
            {item.status==='PTM_REQUESTED' && <div className="mt-3"><Link href={`/parent/ptm?studentId=${studentId}&interventionId=${item.id}`} className="btn btn-outline text-sm">{t('शिक्षक से PTM बुक करें','Book PTM with Teacher')}</Link></div>}
            {item.community_group_id && <div className="mt-3"><Link href="/parent/groups" className="text-sm font-bold" style={{ color:'var(--forest)' }}>🤝 {t('लर्निंग कम्युनिटी खोलें','Open learning Community')}</Link></div>}
          </div>)}
        </div>
      </div>
    </>}
  </div>;
}
