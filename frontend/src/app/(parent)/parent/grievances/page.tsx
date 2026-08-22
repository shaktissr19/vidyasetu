'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getChildren } from '@/services/parentService';
import {
  createParentGrievance, getParentGrievance, listParentGrievances,
  parentGrievanceAction, replyParentGrievance,
  type GrievanceCategory, type GrievancePriority,
} from '@/services/grievanceService';
import GrievanceEvidence from '@/components/grievances/GrievanceEvidence';
import { SectionHeader } from '@/components/ui/index';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

const CATEGORIES: Array<[GrievanceCategory,string]> = [
  ['ACADEMICS','Academics'],['ATTENDANCE','Attendance'],['FEES','Fees'],['TEACHER_CONCERN','Teacher concern'],
  ['BULLYING_SAFETY','Bullying / safety'],['TRANSPORT','Transport'],['INFRASTRUCTURE','Infrastructure'],
  ['ADMINISTRATION','Administration'],['OTHER','Other'],
];
const STATUS: Record<string,string> = { OPEN:'Open', ACKNOWLEDGED:'Acknowledged', IN_PROGRESS:'In progress', RESOLVED:'Resolved', CLOSED:'Closed', ESCALATED:'Escalated' };

export default function ParentGrievancesPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [reply, setReply] = useState('');
  const [form, setForm] = useState({ studentId:'', category:'ACADEMICS' as GrievanceCategory, priority:'NORMAL' as GrievancePriority, subject:'', description:'' });

  const { data: children = [] } = useQuery({ queryKey:['parent-children'], queryFn:()=>getChildren().then(r=>r.data.data) });
  const { data: rows = [], isLoading } = useQuery({ queryKey:['parent-grievances'], queryFn:()=>listParentGrievances().then(r=>r.data.data) });
  const { data: detail } = useQuery({ queryKey:['parent-grievance',selectedId], queryFn:()=>getParentGrievance(selectedId!).then(r=>r.data.data), enabled:!!selectedId });
  const counts = useMemo(()=>({ open: rows.filter(r=>!['RESOLVED','CLOSED'].includes(r.status)).length, resolved:rows.filter(r=>r.status==='RESOLVED').length, escalated:rows.filter(r=>r.status==='ESCALATED').length }),[rows]);

  const createMut = useMutation({
    mutationFn:()=>createParentGrievance(form),
    onSuccess:(r)=>{ qc.invalidateQueries({queryKey:['parent-grievances']}); setShowCreate(false); setSelectedId(r.data.data.id); setForm({studentId:'',category:'ACADEMICS',priority:'NORMAL',subject:'',description:''}); toast.success('Concern submitted to the school'); },
    onError:(e)=>toast.error(apiErrorText(e,'Could not submit concern')),
  });
  const replyMut = useMutation({ mutationFn:()=>replyParentGrievance(selectedId!,reply), onSuccess:()=>{ qc.invalidateQueries({queryKey:['parent-grievance',selectedId]}); setReply(''); toast.success('Reply sent'); }, onError:(e)=>toast.error(apiErrorText(e,'Could not send reply')) });
  const actionMut = useMutation({ mutationFn:({action,note}:{action:'CLOSE'|'REOPEN'|'ESCALATE';note?:string})=>parentGrievanceAction(selectedId!,action,note), onSuccess:()=>{ qc.invalidateQueries({queryKey:['parent-grievance',selectedId]}); qc.invalidateQueries({queryKey:['parent-grievances']}); }, onError:(e)=>toast.error(apiErrorText(e,'Could not update concern')) });

  return <div className="animate-fade-up">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <SectionHeader title="🛡️ Parent Concern & Grievance Centre" />
      <button className="btn-green" onClick={()=>setShowCreate(v=>!v)}>＋ Raise a concern</button>
    </div>
    <p className="text-sm mb-5" style={{color:'var(--slate)'}}>Raise a formal, child-linked concern to the school, attach supporting evidence, track every response, and escalate unresolved matters to VidyaSetu Platform Admin.</p>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
      {[['Active',counts.open,'📬'],['Resolved',counts.resolved,'✅'],['Escalated',counts.escalated,'🚨']].map(([label,value,icon])=><div key={String(label)} className="card p-4"><div className="text-2xl">{icon}</div><div className="text-2xl font-extrabold" style={{color:'var(--navy)'}}>{value}</div><div className="text-xs" style={{color:'var(--slate)'}}>{label}</div></div>)}
    </div>

    {showCreate && <div className="card p-5 mb-5" style={{border:'1.5px solid var(--forest)'}}>
      <h2 className="font-display text-lg font-extrabold mb-3" style={{color:'var(--navy)'}}>Raise a new concern</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <select className="input" value={form.studentId} onChange={e=>setForm({...form,studentId:e.target.value})}><option value="">Select child</option>{children.map(c=><option key={c.id} value={c.id}>{c.name} · {c.school_name || 'School not linked'}</option>)}</select>
        <select className="input" value={form.category} onChange={e=>setForm({...form,category:e.target.value as GrievanceCategory})}>{CATEGORIES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        <select className="input" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value as GrievancePriority})}><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select>
        <input className="input" placeholder="Short subject" value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})}/>
      </div>
      <textarea className="input mt-3 min-h-28" placeholder="Describe what happened, when it happened and what resolution you are seeking." value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
      <p className="text-xs mt-2" style={{color:'var(--slate)'}}>After submission you can attach private JPG, PNG, WebP, PDF or text evidence up to 10 MB.</p>
      <div className="flex gap-2 mt-3"><button className="btn-green" disabled={!form.studentId || form.subject.trim().length<4 || form.description.trim().length<10 || createMut.isPending} onClick={()=>createMut.mutate()}>{createMut.isPending?'Submitting…':'Submit concern'}</button><button className="btn-outline" onClick={()=>setShowCreate(false)}>Cancel</button></div>
    </div>}

    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
      <div className="card p-3 max-h-[650px] overflow-y-auto">
        {isLoading ? <p className="p-3 text-sm">Loading…</p> : rows.length===0 ? <div className="p-6 text-center"><div className="text-4xl">🛡️</div><p className="font-bold mt-2">No concerns raised</p><p className="text-xs mt-1" style={{color:'var(--slate)'}}>Use this centre when you need a tracked school response.</p></div> : rows.map(g=><button key={g.id} onClick={()=>setSelectedId(g.id)} className="w-full text-left rounded-xl p-3 mb-2" style={{background:selectedId===g.id?'var(--forest-pale)':'#F8FAFC',border:`1px solid ${selectedId===g.id?'var(--forest)':'var(--border)'}`}}><div className="flex justify-between gap-2"><strong className="text-sm" style={{color:'var(--navy)'}}>{g.subject}</strong><span className="text-[11px] font-bold" style={{color:g.status==='ESCALATED'?'#C62828':'var(--forest)'}}>{STATUS[g.status]}</span></div><div className="text-xs mt-1" style={{color:'var(--slate)'}}>{g.ticket_number} · {g.student_name}</div>{g.overdue && <div className="text-[11px] mt-1" style={{color:'#C62828'}}>⚠ School response SLA overdue</div>}</button>)}
      </div>

      <div className="card p-5 min-h-[420px]">
        {!detail ? <div className="h-full flex items-center justify-center text-center"><div><div className="text-5xl">📨</div><p className="font-bold mt-3">Select a concern to see its full timeline</p></div></div> : <>
          <div className="flex justify-between gap-3 flex-wrap"><div><div className="text-xs font-bold" style={{color:'var(--forest)'}}>{detail.ticket_number}</div><h2 className="font-display text-xl font-extrabold" style={{color:'var(--navy)'}}>{detail.subject}</h2><p className="text-xs" style={{color:'var(--slate)'}}>{detail.student_name} · {detail.school_name} · {CATEGORIES.find(([v])=>v===detail.category)?.[1]}</p></div><span className="px-3 py-1 rounded-full text-xs font-bold h-fit" style={{background:detail.status==='ESCALATED'?'#FDECEC':'var(--forest-pale)',color:detail.status==='ESCALATED'?'#B71C1C':'var(--forest)'}}>{STATUS[detail.status]}</span></div>
          <div className="rounded-xl p-4 mt-4 text-sm" style={{background:'#F8FAFC',color:'var(--navy)'}}>{detail.description}</div>
          {detail.resolution && <div className="rounded-xl p-4 mt-3" style={{background:'#ECF8EF',border:'1px solid #A9D8B4'}}><div className="text-xs font-bold text-green-800">School resolution</div><div className="text-sm mt-1">{detail.resolution}</div></div>}

          <GrievanceEvidence grievanceId={detail.id} role="parent" status={detail.status} />

          <h3 className="font-bold mt-5 mb-2">Conversation</h3>
          <div className="space-y-2 max-h-52 overflow-y-auto">{detail.messages.length===0?<p className="text-xs" style={{color:'var(--slate)'}}>No replies yet.</p>:detail.messages.map(m=><div key={m.id} className="rounded-xl p-3" style={{background:m.author_role==='PARENT'?'#EEF8F0':'#F3F5FA'}}><div className="text-xs font-bold">{m.author_name} · {m.author_role.replace('_',' ')}</div><div className="text-sm mt-1">{m.body}</div><div className="text-[10px] mt-1" style={{color:'var(--slate)'}}>{new Date(m.created_at).toLocaleString()}</div></div>)}</div>
          {detail.status!=='CLOSED' && <div className="flex gap-2 mt-3"><input className="input flex-1" placeholder="Add a reply" value={reply} onChange={e=>setReply(e.target.value)}/><button className="btn-green" disabled={!reply.trim()||replyMut.isPending} onClick={()=>replyMut.mutate()}>Send</button></div>}

          <div className="flex gap-2 flex-wrap mt-4 pt-4" style={{borderTop:'1px solid var(--border)'}}>
            {detail.status==='RESOLVED' && <button className="btn-green" onClick={()=>actionMut.mutate({action:'CLOSE',note:'Parent accepted the resolution'})}>Accept & close</button>}
            {['RESOLVED','CLOSED'].includes(detail.status) && Number(detail.reopen_count || 0) < detail.reopen_limit && <button className="btn-outline" onClick={()=>actionMut.mutate({action:'REOPEN',note:'Parent requests further review'})}>Reopen</button>}
            {detail.status!=='ESCALATED' && <button className="btn-outline" style={{borderColor:'#C62828',color:'#C62828'}} onClick={()=>actionMut.mutate({action:'ESCALATE',note:'Parent requests Platform Admin review'})}>Escalate to Platform Admin</button>}
          </div>
          {['RESOLVED','CLOSED'].includes(detail.status) && Number(detail.reopen_count || 0) >= detail.reopen_limit && <div className="rounded-xl p-3 mt-3 text-xs" style={{background:'#FFF1F0',border:'1px solid #FFB3AD',color:'#A61B14'}}>Reopen limit ({detail.reopen_limit}) reached. This concern can now be escalated directly to VidyaSetu Platform Admin for independent review.</div>}

          <details className="mt-5"><summary className="text-sm font-bold cursor-pointer">Lifecycle history</summary><div className="mt-2 space-y-2">{detail.history.map(h=><div key={h.id} className="text-xs pl-3" style={{borderLeft:'2px solid var(--border)'}}><strong>{h.action.replaceAll('_',' ')}</strong> · {h.actor_name}<div style={{color:'var(--slate)'}}>{new Date(h.created_at).toLocaleString()} {h.note?`· ${h.note}`:''}</div></div>)}</div></details>
        </>}
      </div>
    </div>
  </div>;
}
