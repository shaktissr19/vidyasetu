'use client';

import { useEffect,useMemo,useState } from 'react';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import useAuthStore from '@/store/authStore';
import { getTeachers } from '@/services/schoolService';
import {
  createSchoolPtmSession,createSchoolPtmSlot,getSchoolPtmBookings,getSchoolPtmSessions,getSchoolPtmSlots,
  updatePtmOutcome,updateSchoolPtmSessionStatus,type PtmSession,type PtmSessionStatus,
} from '@/services/ptmService';
import { apiErrorText } from '@/utils/errors';

const toIso=(value:string)=>new Date(value).toISOString();
const local=(value:string)=>value?new Date(value).toLocaleString():'—';

export default function SchoolPtmPage(){
  const {user}=useAuthStore();
  const isTeacher=user?.role==='TEACHER';
  const qc=useQueryClient();
  const sessionsQ=useQuery({queryKey:['school-ptm-sessions'],queryFn:()=>getSchoolPtmSessions().then(r=>r.data.data||[])});
  const teachersQ=useQuery({queryKey:['school-teachers'],queryFn:()=>getTeachers().then(r=>r.data.data||[]),enabled:!isTeacher});
  const [sessionId,setSessionId]=useState('');
  useEffect(()=>{if(!sessionId&&sessionsQ.data?.[0]?.id)setSessionId(sessionsQ.data[0].id);},[sessionsQ.data,sessionId]);
  const slotsQ=useQuery({queryKey:['school-ptm-slots',sessionId],queryFn:()=>getSchoolPtmSlots(sessionId||undefined).then(r=>r.data.data||[]),enabled:Boolean(sessionId)});
  const bookingsQ=useQuery({queryKey:['school-ptm-bookings',sessionId],queryFn:()=>getSchoolPtmBookings(sessionId||undefined).then(r=>r.data.data||[]),enabled:Boolean(sessionId)});
  const selected=useMemo(()=>sessionsQ.data?.find(s=>s.id===sessionId),[sessionsQ.data,sessionId]);

  const [sessionForm,setSessionForm]=useState({title:'',description:'',startsAt:'',endsAt:'',bookingOpensAt:'',bookingClosesAt:''});
  const [slotForm,setSlotForm]=useState({teacherId:'',startsAt:'',endsAt:'',location:''});
  useEffect(()=>{if(!slotForm.teacherId&&teachersQ.data?.[0]?.id)setSlotForm(v=>({...v,teacherId:teachersQ.data?.[0]?.id||''}));},[teachersQ.data,slotForm.teacherId]);

  const refresh=async()=>{await Promise.all([qc.invalidateQueries({queryKey:['school-ptm-sessions']}),qc.invalidateQueries({queryKey:['school-ptm-slots']}),qc.invalidateQueries({queryKey:['school-ptm-bookings']})]);};
  const createSessionM=useMutation({mutationFn:()=>createSchoolPtmSession({title:sessionForm.title,description:sessionForm.description||undefined,startsAt:toIso(sessionForm.startsAt),endsAt:toIso(sessionForm.endsAt),bookingOpensAt:toIso(sessionForm.bookingOpensAt),bookingClosesAt:toIso(sessionForm.bookingClosesAt)}),onSuccess:async(r)=>{setSessionForm({title:'',description:'',startsAt:'',endsAt:'',bookingOpensAt:'',bookingClosesAt:''});setSessionId(r.data.data.id);await refresh();}});
  const statusM=useMutation({mutationFn:({id,status}:{id:string;status:Exclude<PtmSessionStatus,'DRAFT'>})=>updateSchoolPtmSessionStatus(id,status),onSuccess:refresh});
  const createSlotM=useMutation({mutationFn:()=>createSchoolPtmSlot(sessionId,{teacherId:slotForm.teacherId,startsAt:toIso(slotForm.startsAt),endsAt:toIso(slotForm.endsAt),location:slotForm.location||undefined}),onSuccess:async()=>{setSlotForm(v=>({...v,startsAt:'',endsAt:'',location:''}));await refresh();}});
  const outcomeM=useMutation({mutationFn:({id,status}:{id:string;status:'COMPLETED'|'NO_SHOW'})=>updatePtmOutcome(id,{status}),onSuccess:refresh});
  const error=createSessionM.error||statusM.error||createSlotM.error||outcomeM.error||sessionsQ.error||slotsQ.error||bookingsQ.error;

  const nextStatus=(s:PtmSession):Exclude<PtmSessionStatus,'DRAFT'>|null=>s.status==='DRAFT'?'OPEN':s.status==='OPEN'?'CLOSED':s.status==='CLOSED'?'COMPLETED':null;
  return <div className="animate-fade-up space-y-5">
    <div><h1 className="font-display font-extrabold text-2xl" style={{color:'var(--navy)'}}>🤝 Parent–Teacher Meetings</h1><p className="text-sm mt-1" style={{color:'var(--slate)'}}>{isTeacher?'See your PTM slots and Parent appointments, then record the meeting outcome.':'Create governed PTM sessions, publish booking windows and allocate Teacher appointment slots.'}</p></div>
    {error&&<div className="card" style={{color:'#B42318'}}>{apiErrorText(error)}</div>}

    {!isTeacher&&<div className="card"><h2 className="font-bold text-lg mb-3">Create PTM session</h2><div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
      <input className="input" placeholder="PTM title" value={sessionForm.title} onChange={e=>setSessionForm({...sessionForm,title:e.target.value})}/>
      <input className="input" placeholder="Description (optional)" value={sessionForm.description} onChange={e=>setSessionForm({...sessionForm,description:e.target.value})}/>
      <label className="text-xs">PTM starts<input className="input mt-1" type="datetime-local" value={sessionForm.startsAt} onChange={e=>setSessionForm({...sessionForm,startsAt:e.target.value})}/></label>
      <label className="text-xs">PTM ends<input className="input mt-1" type="datetime-local" value={sessionForm.endsAt} onChange={e=>setSessionForm({...sessionForm,endsAt:e.target.value})}/></label>
      <label className="text-xs">Booking opens<input className="input mt-1" type="datetime-local" value={sessionForm.bookingOpensAt} onChange={e=>setSessionForm({...sessionForm,bookingOpensAt:e.target.value})}/></label>
      <label className="text-xs">Booking closes<input className="input mt-1" type="datetime-local" value={sessionForm.bookingClosesAt} onChange={e=>setSessionForm({...sessionForm,bookingClosesAt:e.target.value})}/></label>
    </div><button className="btn-primary mt-3" disabled={createSessionM.isPending||!sessionForm.title||!sessionForm.startsAt||!sessionForm.endsAt||!sessionForm.bookingOpensAt||!sessionForm.bookingClosesAt} onClick={()=>createSessionM.mutate()}>{createSessionM.isPending?'Creating…':'Create draft PTM'}</button></div>}

    <div className="card"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold text-lg">PTM sessions</h2><select className="input select w-auto min-w-[260px]" value={sessionId} onChange={e=>setSessionId(e.target.value)}><option value="">Select session</option>{(sessionsQ.data||[]).map(s=><option key={s.id} value={s.id}>{s.title} · {s.status}</option>)}</select></div>
      {selected&&<div className="mt-4 p-4 rounded-xl" style={{background:'#F8FBF9',border:'1px solid var(--border)'}}><div className="flex flex-wrap justify-between gap-3"><div><div className="font-bold">{selected.title}</div><div className="text-sm mt-1">{local(selected.starts_at)} – {local(selected.ends_at)}</div><div className="text-xs mt-1" style={{color:'var(--slate)'}}>Booking: {local(selected.booking_opens_at)} → {local(selected.booking_closes_at)} · {selected.slot_count||0} slots · {selected.booked_count||0} booked</div></div><div className="flex gap-2 items-start"><span className="badge">{selected.status}</span>{!isTeacher&&nextStatus(selected)&&<button className="btn-secondary" onClick={()=>statusM.mutate({id:selected.id,status:nextStatus(selected)!})}>{nextStatus(selected)}</button>}{!isTeacher&&!['COMPLETED','CANCELLED'].includes(selected.status)&&<button className="btn-secondary" onClick={()=>statusM.mutate({id:selected.id,status:'CANCELLED'})}>Cancel PTM</button>}</div></div></div>}
    </div>

    {!isTeacher&&selected&&<div className="card"><h2 className="font-bold text-lg mb-3">Add Teacher slot</h2><div className="grid md:grid-cols-4 gap-3"><select className="input select" value={slotForm.teacherId} onChange={e=>setSlotForm({...slotForm,teacherId:e.target.value})}><option value="">Teacher</option>{(teachersQ.data||[]).filter(t=>t.status==='ACTIVE').map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><input className="input" type="datetime-local" value={slotForm.startsAt} onChange={e=>setSlotForm({...slotForm,startsAt:e.target.value})}/><input className="input" type="datetime-local" value={slotForm.endsAt} onChange={e=>setSlotForm({...slotForm,endsAt:e.target.value})}/><input className="input" placeholder="Room / location" value={slotForm.location} onChange={e=>setSlotForm({...slotForm,location:e.target.value})}/></div><button className="btn-primary mt-3" disabled={createSlotM.isPending||!slotForm.teacherId||!slotForm.startsAt||!slotForm.endsAt} onClick={()=>createSlotM.mutate()}>Add slot</button></div>}

    <div className="card"><h2 className="font-bold text-lg mb-3">Teacher slots</h2><div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Teacher</th><th>Time</th><th>Location</th><th>Availability</th></tr></thead><tbody>{(slotsQ.data||[]).map(s=><tr key={s.id}><td>{s.teacher_name||'Teacher'}</td><td>{local(s.starts_at)} – {new Date(s.ends_at).toLocaleTimeString()}</td><td>{s.location||'School campus'}</td><td>{s.is_booked?'Booked':'Available'}</td></tr>)}</tbody></table>{!slotsQ.isLoading&&!(slotsQ.data||[]).length&&<div className="py-6 text-center text-sm" style={{color:'var(--slate)'}}>No slots in this session.</div>}</div></div>

    <div className="card"><h2 className="font-bold text-lg mb-3">Appointments</h2><div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Student</th><th>Parent</th><th>Teacher</th><th>Time</th><th>Status</th><th>Action</th></tr></thead><tbody>{(bookingsQ.data||[]).map(b=><tr key={b.id}><td><b>{b.student_name}</b><div className="text-xs">{b.student_code} · {b.class_name}-{b.section||''}</div></td><td>{b.parent_name||'Parent'}</td><td>{b.teacher_name||'Teacher'}</td><td>{b.starts_at?local(b.starts_at):'—'}</td><td>{b.status}</td><td>{b.status==='BOOKED'?<div className="flex gap-2"><button className="btn-secondary" onClick={()=>outcomeM.mutate({id:b.id,status:'COMPLETED'})}>Complete</button><button className="btn-secondary" onClick={()=>outcomeM.mutate({id:b.id,status:'NO_SHOW'})}>No show</button></div>:b.outcome_note||'—'}</td></tr>)}</tbody></table>{!bookingsQ.isLoading&&!(bookingsQ.data||[]).length&&<div className="py-6 text-center text-sm" style={{color:'var(--slate)'}}>No appointments booked.</div>}</div></div>
  </div>;
}
