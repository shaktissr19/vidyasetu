'use client';

import { useEffect,useState } from 'react';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { getChildren } from '@/services/parentService';
import { bookParentPtmSlot,cancelParentPtmBooking,getParentPtmBookings,getParentPtmOptions } from '@/services/ptmService';
import { apiErrorText } from '@/utils/errors';

const local=(value?:string)=>value?new Date(value).toLocaleString():'—';

export default function ParentPtmPage(){
  const qc=useQueryClient();
  const childrenQ=useQuery({queryKey:['parent-children'],queryFn:()=>getChildren().then(r=>r.data.data||[])});
  const [studentId,setStudentId]=useState('');
  useEffect(()=>{if(!studentId&&childrenQ.data?.[0]?.id)setStudentId(childrenQ.data[0].id);},[childrenQ.data,studentId]);
  const optionsQ=useQuery({queryKey:['parent-ptm-options',studentId],queryFn:()=>getParentPtmOptions(studentId).then(r=>r.data.data||[]),enabled:Boolean(studentId)});
  const bookingsQ=useQuery({queryKey:['parent-ptm-bookings',studentId],queryFn:()=>getParentPtmBookings(studentId).then(r=>r.data.data||[]),enabled:Boolean(studentId)});
  const refresh=async()=>{await Promise.all([qc.invalidateQueries({queryKey:['parent-ptm-options',studentId]}),qc.invalidateQueries({queryKey:['parent-ptm-bookings',studentId]})]);};
  const bookM=useMutation({mutationFn:(slotId:string)=>bookParentPtmSlot(studentId,slotId),onSuccess:refresh});
  const cancelM=useMutation({mutationFn:(bookingId:string)=>cancelParentPtmBooking(bookingId),onSuccess:refresh});
  const error=childrenQ.error||optionsQ.error||bookingsQ.error||bookM.error||cancelM.error;
  const upcoming=(bookingsQ.data||[]).filter(b=>b.status==='BOOKED');

  return <div className="animate-fade-up space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-display font-extrabold text-2xl" style={{color:'var(--navy)'}}>🤝 Parent–Teacher Meetings</h1><p className="text-sm mt-1" style={{color:'var(--slate)'}}>Book available PTM slots only with Teachers assigned to your linked child’s class.</p></div><select className="input select w-auto min-w-[240px]" value={studentId} onChange={e=>setStudentId(e.target.value)}>{(childrenQ.data||[]).map(child=><option key={child.id} value={child.id}>{child.name} · Class {child.class_name}-{child.section||''}</option>)}</select></div>
    {error&&<div className="card" style={{color:'#B42318'}}>{apiErrorText(error)}</div>}

    <div className="card"><h2 className="font-bold text-lg mb-3">Upcoming appointments</h2>{bookingsQ.isLoading?<p>Loading…</p>:!upcoming.length?<p className="text-sm" style={{color:'var(--slate)'}}>No PTM appointment booked for this child.</p>:<div className="grid md:grid-cols-2 gap-3">{upcoming.map(b=><div key={b.id} className="p-4 rounded-xl" style={{border:'1px solid var(--border)',background:'#F8FBF9'}}><div className="font-bold">{b.session_title||'PTM'}</div><div className="text-sm mt-2"><b>Teacher:</b> {b.teacher_name||'—'}</div><div className="text-sm"><b>When:</b> {local(b.starts_at)}</div><div className="text-sm"><b>Location:</b> {b.location||'School campus'}</div><button className="btn-secondary mt-3" disabled={cancelM.isPending} onClick={()=>cancelM.mutate(b.id)}>Cancel appointment</button></div>)}</div>}</div>

    <div className="card"><h2 className="font-bold text-lg mb-3">Available Teacher slots</h2>{optionsQ.isLoading?<p>Loading…</p>:!(optionsQ.data||[]).length?<p className="text-sm" style={{color:'var(--slate)'}}>No bookable PTM slots are currently open for this child.</p>:<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">{(optionsQ.data||[]).map(s=><div key={s.id} className="p-4 rounded-xl" style={{border:'1px solid var(--border)'}}><div className="font-bold">{s.teacher_name||'Teacher'}</div>{s.subjects&&<div className="text-xs mt-1" style={{color:'var(--slate)'}}>{s.subjects}</div>}<div className="text-sm mt-3">{local(s.starts_at)}</div><div className="text-sm">{s.location||'School campus'}</div><button className="btn-primary mt-3" disabled={bookM.isPending} onClick={()=>bookM.mutate(s.id)}>Book this slot</button></div>)}</div>}</div>

    <div className="card"><h2 className="font-bold text-lg mb-3">Appointment history</h2><div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Meeting</th><th>Teacher</th><th>Time</th><th>Status</th><th>Outcome</th></tr></thead><tbody>{(bookingsQ.data||[]).map(b=><tr key={b.id}><td>{b.session_title||'PTM'}</td><td>{b.teacher_name||'—'}</td><td>{local(b.starts_at)}</td><td>{b.status}</td><td>{b.outcome_note||'—'}</td></tr>)}</tbody></table>{!bookingsQ.isLoading&&!(bookingsQ.data||[]).length&&<div className="py-6 text-center text-sm" style={{color:'var(--slate)'}}>No PTM history yet.</div>}</div></div>
  </div>;
}
