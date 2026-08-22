'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminGrievanceStatus, getAdminGrievance, listAdminGrievances, replyAdminGrievance, type GrievanceStatus } from '@/services/grievanceService';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

const STATUS: Record<string,string> = { OPEN:'Open', ACKNOWLEDGED:'Acknowledged', IN_PROGRESS:'In progress', RESOLVED:'Resolved', CLOSED:'Closed', ESCALATED:'Escalated' };

export default function AdminGrievancesPage() {
  const qc=useQueryClient();
  const [filter,setFilter]=useState('');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [reply,setReply]=useState('');
  const [internal,setInternal]=useState(true);
  const [note,setNote]=useState('');
  const {data:rows=[]}=useQuery({queryKey:['admin-grievances',filter],queryFn:()=>listAdminGrievances(filter||undefined).then(r=>r.data.data)});
  const {data:detail}=useQuery({queryKey:['admin-grievance',selectedId],queryFn:()=>getAdminGrievance(selectedId!).then(r=>r.data.data),enabled:!!selectedId});
  const stats=useMemo(()=>({escalated:rows.filter(r=>r.status==='ESCALATED').length,overdue:rows.filter(r=>r.overdue).length,open:rows.filter(r=>!['RESOLVED','CLOSED'].includes(r.status)).length}),[rows]);
  const replyMut=useMutation({mutationFn:()=>replyAdminGrievance(selectedId!,reply,internal),onSuccess:()=>{qc.invalidateQueries({queryKey:['admin-grievance',selectedId]});setReply('');toast.success(internal?'Internal Admin note saved':'Parent notified');},onError:e=>toast.error(apiErrorText(e,'Could not save reply'))});
  const statusMut=useMutation({mutationFn:(status:GrievanceStatus)=>adminGrievanceStatus(selectedId!,status,note||undefined),onSuccess:()=>{qc.invalidateQueries({queryKey:['admin-grievance',selectedId]});qc.invalidateQueries({queryKey:['admin-grievances']});setNote('');},onError:e=>toast.error(apiErrorText(e,'Could not update grievance'))});

  return <div style={{color:'#EAF1FF'}}>
    <div className="flex items-start justify-between gap-3 flex-wrap mb-5"><div><h1 className="font-display text-2xl font-extrabold">🛡️ Parent Grievance Oversight</h1><p className="text-sm mt-1" style={{color:'#90A4C4'}}>Monitor escalations, overdue school responses and the complete audit trail across VidyaSetu schools.</p></div></div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">{[['Active',stats.open,'📬'],['Escalated',stats.escalated,'🚨'],['Overdue',stats.overdue,'⏱️']].map(([l,v,i])=><div key={String(l)} className="rounded-2xl p-4" style={{background:'#111C36',border:'1px solid #243251'}}><div className="text-xl">{i}</div><div className="text-2xl font-extrabold">{v}</div><div className="text-xs" style={{color:'#90A4C4'}}>{l}</div></div>)}</div>
    <div className="flex gap-2 flex-wrap mb-4">{['','ESCALATED','OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','CLOSED'].map(s=><button key={s||'ALL'} onClick={()=>setFilter(s)} className="px-3 py-2 rounded-lg text-xs font-bold" style={{background:filter===s?'#4FC3F7':'#111C36',color:filter===s?'#07152D':'#B8C7E0',border:'1px solid #263658'}}>{s?STATUS[s]:'All'}</button>)}</div>
    <div className="grid grid-cols-1 xl:grid-cols-[390px_1fr] gap-4">
      <div className="rounded-2xl p-3 max-h-[700px] overflow-y-auto" style={{background:'#0E1830',border:'1px solid #233250'}}>{rows.length===0?<div className="p-8 text-center text-sm" style={{color:'#90A4C4'}}>No grievances in this view.</div>:rows.map(g=><button key={g.id} onClick={()=>setSelectedId(g.id)} className="w-full text-left rounded-xl p-3 mb-2" style={{background:selectedId===g.id?'#172847':'#121E36',border:`1px solid ${g.status==='ESCALATED'?'#D9534F':selectedId===g.id?'#4FC3F7':'#263658'}`,color:'#EAF1FF'}}><div className="flex justify-between gap-2"><strong className="text-sm">{g.subject}</strong><span className="text-[10px] font-bold" style={{color:g.status==='ESCALATED'?'#FF8A80':'#80D8FF'}}>{STATUS[g.status]}</span></div><div className="text-xs mt-1" style={{color:'#90A4C4'}}>{g.ticket_number} · {g.school_name}</div><div className="text-xs" style={{color:'#90A4C4'}}>{g.student_name} · Parent {g.parent_name}</div>{g.overdue&&<div className="text-[11px] mt-1" style={{color:'#FF8A80'}}>⚠ SLA overdue</div>}</button>)}</div>
      <div className="rounded-2xl p-5 min-h-[500px]" style={{background:'#0E1830',border:'1px solid #233250'}}>{!detail?<div className="h-full flex items-center justify-center"><div className="text-center"><div className="text-5xl">🔎</div><p className="font-bold mt-3">Select a grievance for full governance context</p></div></div>:<>
        <div className="flex justify-between gap-3 flex-wrap"><div><div className="text-xs font-bold" style={{color:'#4FC3F7'}}>{detail.ticket_number}</div><h2 className="font-display text-xl font-extrabold">{detail.subject}</h2><div className="text-xs" style={{color:'#90A4C4'}}>{detail.school_name} · {detail.student_name} · Parent {detail.parent_name}</div></div><span className="px-3 py-1 rounded-full text-xs font-bold h-fit" style={{background:detail.status==='ESCALATED'?'#401D24':'#173047',color:detail.status==='ESCALATED'?'#FF8A80':'#80D8FF'}}>{STATUS[detail.status]}</span></div>
        <div className="rounded-xl p-4 mt-4 text-sm" style={{background:'#121E36',color:'#D8E4F8'}}>{detail.description}</div>
        {detail.resolution&&<div className="rounded-xl p-4 mt-3" style={{background:'#143326',border:'1px solid #255B43'}}><div className="text-xs font-bold" style={{color:'#A5D6A7'}}>Recorded resolution</div><div className="text-sm mt-1">{detail.resolution}</div></div>}
        <div className="rounded-xl p-4 mt-4" style={{background:'#101B31',border:'1px solid #253656'}}><div className="text-sm font-bold mb-2">Platform intervention</div><input className="input" placeholder="Reason / guidance / resolution note" value={note} onChange={e=>setNote(e.target.value)}/><div className="flex gap-2 flex-wrap mt-2">{(['ACKNOWLEDGED','IN_PROGRESS','RESOLVED','CLOSED','ESCALATED'] as GrievanceStatus[]).map(s=><button key={s} onClick={()=>statusMut.mutate(s)} disabled={statusMut.isPending} className="px-3 py-2 rounded-lg text-xs font-bold" style={{background:s==='ESCALATED'?'#5A2028':s==='RESOLVED'?'#16442F':'#1A2A49',color:'#EAF1FF',border:'1px solid #345'}}>Set {STATUS[s]}</button>)}</div></div>
        <h3 className="font-bold mt-5 mb-2">Conversation & internal notes</h3><div className="space-y-2 max-h-52 overflow-y-auto">{detail.messages.map(m=><div key={m.id} className="rounded-xl p-3" style={{background:m.is_internal?'#2C2817':'#121E36',border:m.is_internal?'1px solid #665A27':'1px solid #233250'}}><div className="text-xs font-bold">{m.author_name} · {m.author_role.replace('_',' ')} {m.is_internal?'· Internal':''}</div><div className="text-sm mt-1">{m.body}</div><div className="text-[10px] mt-1" style={{color:'#90A4C4'}}>{new Date(m.created_at).toLocaleString()}</div></div>)}</div>
        <div className="mt-3"><div className="flex items-center gap-2 mb-2"><input type="checkbox" checked={internal} onChange={e=>setInternal(e.target.checked)}/><span className="text-xs" style={{color:'#B8C7E0'}}>Internal Platform note — hidden from Parent</span></div><div className="flex gap-2"><input className="input flex-1" placeholder={internal?'Add internal governance note':'Reply visibly to Parent'} value={reply} onChange={e=>setReply(e.target.value)}/><button className="px-4 py-2 rounded-xl font-bold" style={{background:'#4FC3F7',color:'#07152D'}} disabled={!reply.trim()||replyMut.isPending} onClick={()=>replyMut.mutate()}>Send</button></div></div>
        <details className="mt-5"><summary className="text-sm font-bold cursor-pointer">Immutable audit timeline</summary><div className="mt-2 space-y-2">{detail.history.map(h=><div key={h.id} className="text-xs pl-3" style={{borderLeft:'2px solid #344968'}}><strong>{h.action.replaceAll('_',' ')}</strong> · {h.actor_name}<div style={{color:'#90A4C4'}}>{new Date(h.created_at).toLocaleString()} {h.note?`· ${h.note}`:''}</div></div>)}</div></details>
      </>}</div>
    </div>
  </div>;
}
