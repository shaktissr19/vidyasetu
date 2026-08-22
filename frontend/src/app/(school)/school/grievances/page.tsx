'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSchoolGrievance, listSchoolGrievances, replySchoolGrievance, schoolGrievanceAction } from '@/services/grievanceService';
import GrievanceEvidence from '@/components/grievances/GrievanceEvidence';
import { SectionHeader } from '@/components/ui/index';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

const STATUS: Record<string,string> = { OPEN:'Open', ACKNOWLEDGED:'Acknowledged', IN_PROGRESS:'In progress', RESOLVED:'Resolved', CLOSED:'Closed', ESCALATED:'Escalated' };

export default function SchoolGrievancesPage() {
  const qc = useQueryClient();
  const [filter,setFilter]=useState('');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [reply,setReply]=useState('');
  const [resolution,setResolution]=useState('');
  const [internal,setInternal]=useState(false);
  const { data:rows=[] }=useQuery({queryKey:['school-grievances',filter],queryFn:()=>listSchoolGrievances(filter||undefined).then(r=>r.data.data)});
  const { data:detail }=useQuery({queryKey:['school-grievance',selectedId],queryFn:()=>getSchoolGrievance(selectedId!).then(r=>r.data.data),enabled:!!selectedId});
  const replyMut=useMutation({mutationFn:()=>replySchoolGrievance(selectedId!,reply,internal),onSuccess:()=>{qc.invalidateQueries({queryKey:['school-grievance',selectedId]});setReply('');toast.success(internal?'Internal note saved':'Reply sent to Parent');},onError:e=>toast.error(apiErrorText(e,'Could not send reply'))});
  const actionMut=useMutation({mutationFn:({action,note}:{action:'ACKNOWLEDGE'|'START'|'RESOLVE';note?:string})=>schoolGrievanceAction(selectedId!,action,note),onSuccess:()=>{qc.invalidateQueries({queryKey:['school-grievance',selectedId]});qc.invalidateQueries({queryKey:['school-grievances']});setResolution('');},onError:e=>toast.error(apiErrorText(e,'Could not update concern'))});

  return <div className="animate-fade-up">
    <SectionHeader title="🛡️ Parent Concerns" />
    <p className="text-sm mb-4" style={{color:'var(--slate)'}}>Formal Parent concerns for students linked to your school. Acknowledge promptly, review private evidence, keep communication on the ticket, and record a clear resolution.</p>
    <div className="flex gap-2 flex-wrap mb-4">{['','OPEN','ACKNOWLEDGED','IN_PROGRESS','ESCALATED','RESOLVED','CLOSED'].map(s=><button key={s||'ALL'} className="px-3 py-2 rounded-lg text-xs font-bold" onClick={()=>setFilter(s)} style={{background:filter===s?'var(--saffron)':'white',color:filter===s?'white':'var(--slate)',border:'1px solid var(--border)'}}>{s?STATUS[s]:'All'}</button>)}</div>
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
      <div className="card p-3 max-h-[670px] overflow-y-auto">{rows.length===0?<div className="p-7 text-center text-sm" style={{color:'var(--slate)'}}>No concerns in this view.</div>:rows.map(g=><button key={g.id} onClick={()=>setSelectedId(g.id)} className="w-full text-left rounded-xl p-3 mb-2" style={{background:selectedId===g.id?'var(--saffron-pale)':'#F8FAFC',border:`1px solid ${selectedId===g.id?'var(--saffron)':'var(--border)'}`}}><div className="flex justify-between gap-2"><strong className="text-sm">{g.subject}</strong><span className="text-[11px] font-bold" style={{color:g.status==='ESCALATED'?'#B71C1C':'var(--saffron)'}}>{STATUS[g.status]}</span></div><div className="text-xs mt-1" style={{color:'var(--slate)'}}>{g.ticket_number} · {g.student_name} · {g.parent_name}</div>{g.overdue&&<div className="text-[11px] mt-1" style={{color:'#C62828'}}>⚠ Response SLA overdue</div>}</button>)}</div>
      <div className="card p-5 min-h-[460px]">{!detail?<div className="h-full flex items-center justify-center"><div className="text-center"><div className="text-5xl">📬</div><p className="font-bold mt-3">Select a Parent concern</p></div></div>:<>
        <div className="flex justify-between gap-3 flex-wrap"><div><div className="text-xs font-bold" style={{color:'var(--saffron)'}}>{detail.ticket_number}</div><h2 className="font-display text-xl font-extrabold">{detail.subject}</h2><div className="text-xs" style={{color:'var(--slate)'}}>{detail.student_name} · Parent: {detail.parent_name} · {detail.priority} priority</div></div><span className="px-3 py-1 rounded-full text-xs font-bold h-fit" style={{background:detail.status==='ESCALATED'?'#FDECEC':'var(--saffron-pale)',color:detail.status==='ESCALATED'?'#B71C1C':'var(--saffron)'}}>{STATUS[detail.status]}</span></div>
        <div className="rounded-xl p-4 mt-4 text-sm" style={{background:'#F8FAFC'}}>{detail.description}</div>
        <GrievanceEvidence grievanceId={detail.id} role="school" status={detail.status} />

        {detail.status==='ESCALATED' ? <div className="rounded-xl p-4 mt-4 text-sm" style={{background:'#FFF1F0',border:'1px solid #FFB3AD',color:'#8A1C15'}}><strong>Platform Admin review is active.</strong> The School can continue replying and providing clarification, but cannot downgrade or close this grievance while it is escalated.</div> : <div className="flex gap-2 flex-wrap mt-4">
          {detail.status==='OPEN'&&<button className="btn-primary" onClick={()=>actionMut.mutate({action:'ACKNOWLEDGE',note:'School acknowledged the concern'})}>Acknowledge</button>}
          {['OPEN','ACKNOWLEDGED'].includes(detail.status)&&<button className="btn-outline" onClick={()=>actionMut.mutate({action:'START',note:'School started review'})}>Start review</button>}
        </div>}

        {['ACKNOWLEDGED','IN_PROGRESS'].includes(detail.status)&&<div className="rounded-xl p-4 mt-4" style={{background:'#FFF8F1',border:'1px solid #FFD5B3'}}><div className="text-sm font-bold mb-2">Resolve concern</div><textarea className="input min-h-20" placeholder="State what was checked, the decision/action taken and any follow-up." value={resolution} onChange={e=>setResolution(e.target.value)}/><button className="btn-primary mt-2" disabled={resolution.trim().length<3||actionMut.isPending} onClick={()=>actionMut.mutate({action:'RESOLVE',note:resolution})}>Mark resolved</button></div>}
        {detail.resolution&&<div className="rounded-xl p-4 mt-3" style={{background:'#ECF8EF'}}><div className="text-xs font-bold text-green-800">Recorded resolution</div><div className="text-sm mt-1">{detail.resolution}</div></div>}
        <h3 className="font-bold mt-5 mb-2">Conversation & notes</h3><div className="space-y-2 max-h-52 overflow-y-auto">{detail.messages.map(m=><div key={m.id} className="rounded-xl p-3" style={{background:m.is_internal?'#FFF8E1':'#F3F5FA',border:m.is_internal?'1px solid #FFE082':'none'}}><div className="text-xs font-bold">{m.author_name} · {m.author_role.replace('_',' ')} {m.is_internal?'· Internal':''}</div><div className="text-sm mt-1">{m.body}</div><div className="text-[10px] mt-1" style={{color:'var(--slate)'}}>{new Date(m.created_at).toLocaleString()}</div></div>)}</div>
        {detail.status!=='CLOSED'&&<div className="mt-3"><div className="flex items-center gap-2 mb-2"><input type="checkbox" checked={internal} onChange={e=>setInternal(e.target.checked)}/><span className="text-xs">Internal school note — hidden from Parent</span></div><div className="flex gap-2"><input className="input flex-1" placeholder={internal?'Add internal note':'Reply to Parent'} value={reply} onChange={e=>setReply(e.target.value)}/><button className="btn-primary" disabled={!reply.trim()||replyMut.isPending} onClick={()=>replyMut.mutate()}>Send</button></div></div>}
        <details className="mt-5"><summary className="text-sm font-bold cursor-pointer">Audit timeline</summary><div className="mt-2 space-y-2">{detail.history.map(h=><div key={h.id} className="text-xs pl-3" style={{borderLeft:'2px solid var(--border)'}}><strong>{h.action.replaceAll('_',' ')}</strong> · {h.actor_name}<div style={{color:'var(--slate)'}}>{new Date(h.created_at).toLocaleString()} {h.note?`· ${h.note}`:''}</div></div>)}</div></details>
      </>}</div>
    </div>
  </div>;
}
