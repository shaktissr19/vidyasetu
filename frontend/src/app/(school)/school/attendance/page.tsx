'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAttendanceRoster, getAttendanceSummary, getClasses, markAttendance } from '@/services/schoolService';
import { SectionHeader, TableSkeleton } from '@/components/ui/index';
import toast from 'react-hot-toast';

const STATUS=['PRESENT','ABSENT','LATE','HALF_DAY','HOLIDAY'];
const COLOR={PRESENT:'var(--forest)',ABSENT:'#C62828',LATE:'var(--saffron)',HALF_DAY:'#1565C0',HOLIDAY:'#7A7F8C'};
const ICON={PRESENT:'✓',ABSENT:'✗',LATE:'⏰',HALF_DAY:'½',HOLIDAY:'H'};
const err=e=>e?.response?.data?.error?.message||e?.message||'Failed to save attendance';

export default function SchoolAttendancePage(){
 const qc=useQueryClient();const today=new Date().toISOString().slice(0,10);const [date,setDate]=useState(today);const [classId,setClassId]=useState('');const [records,setRecords]=useState({});const [tab,setTab]=useState('mark');
 const classesQ=useQuery({queryKey:['school-classes'],queryFn:()=>getClasses().then(r=>r.data.data||[])});const classes=classesQ.data||[];
 const rosterQ=useQuery({queryKey:['attendance-roster',classId,date],queryFn:()=>getAttendanceRoster(classId,date).then(r=>r.data.data||[]),enabled:!!classId});const roster=rosterQ.data||[];
 const summaryQ=useQuery({queryKey:['attendance-summary',date],queryFn:()=>getAttendanceSummary(date).then(r=>r.data.data||[]),enabled:tab==='summary'});
 useEffect(()=>{if(!rosterQ.data)return;setRecords(Object.fromEntries(rosterQ.data.map(s=>[s.id,s.attendance_status||'PRESENT'])));},[rosterQ.data]);
 const save=useMutation({mutationFn:()=>markAttendance({classId,date,records:roster.map(s=>({studentId:s.id,status:records[s.id]||'PRESENT'}))}),onSuccess:async res=>{toast.success(`Attendance saved for ${res.data.data.marked} Students`);await Promise.all([qc.invalidateQueries({queryKey:['attendance-roster',classId,date]}),qc.invalidateQueries({queryKey:['attendance-summary',date]}),qc.invalidateQueries({queryKey:['school-overview']})]);},onError:e=>toast.error(err(e))});
 function all(status){setRecords(Object.fromEntries(roster.map(s=>[s.id,status])));}
 const counts=STATUS.reduce((o,s)=>({...o,[s]:roster.filter(x=>(records[x.id]||'PRESENT')===s).length}),{});
 return <div className="animate-fade-up">
  <SectionHeader title="📅 Attendance"><div className="flex gap-1 p-1 rounded-xl" style={{background:'var(--saffron-pale)'}}>{[['mark','Mark Attendance'],['summary','Summary']].map(([k,l])=><button key={k} className="px-4 py-1.5 rounded-lg text-sm font-bold" style={{background:tab===k?'white':'transparent',color:tab===k?'var(--saffron)':'var(--slate)'}} onClick={()=>setTab(k)}>{l}</button>)}</div></SectionHeader>
  {tab==='mark'?<>
   <div className="card mb-4"><div className="grid sm:grid-cols-2 gap-3"><div><label className="text-xs font-bold block mb-1">Date</label><input type="date" max={today} className="input" value={date} onChange={e=>setDate(e.target.value)}/></div><div><label className="text-xs font-bold block mb-1">Class / Section</label><select className="input select" value={classId} onChange={e=>setClassId(e.target.value)}><option value="">Select class</option>{classes.map(c=><option key={c.id} value={c.id}>Class {c.class_name}-{c.section} ({c.student_count})</option>)}</select></div></div></div>
   {!classId?<div className="card text-center py-12"><div className="text-4xl mb-2">📅</div><b>Select a class to mark attendance</b></div>:rosterQ.isLoading?<TableSkeleton rows={6} cols={4}/>:<div className="card">
    <div className="flex flex-wrap gap-2 items-center mb-4"><button className="btn-ghost text-xs" onClick={()=>all('PRESENT')}>✓ All Present</button><button className="btn-ghost text-xs" onClick={()=>all('HOLIDAY')}>H Mark Holiday</button><div className="ml-auto flex flex-wrap gap-3 text-xs font-bold">{STATUS.slice(0,4).map(s=><span key={s} style={{color:COLOR[s]}}>{s.replace('_',' ')}: {counts[s]}</span>)}</div></div>
    <div className="space-y-0">{roster.map((s,i)=><div key={s.id} className="flex items-center gap-3 py-3" style={{borderBottom:i<roster.length-1?'1px solid var(--border)':'none'}}><div className="w-9 h-9 rounded-full grid place-items-center font-bold" style={{background:'var(--saffron-pale)',color:'var(--saffron)'}}>{s.name?.[0]}</div><div className="flex-1"><div className="font-semibold text-sm" style={{color:'var(--navy)'}}>{s.name}</div><div className="text-xs" style={{color:'var(--slate)'}}>{s.student_code} · Roll {s.roll_number||'—'}</div></div><div className="flex gap-1 flex-wrap justify-end">{STATUS.map(st=><button key={st} title={st.replace('_',' ')} className="w-9 h-9 rounded-lg text-xs font-bold" style={{background:(records[s.id]||'PRESENT')===st?COLOR[st]:'#F0F4F8',color:(records[s.id]||'PRESENT')===st?'white':'var(--slate)'}} onClick={()=>setRecords(r=>({...r,[s.id]:st}))}>{ICON[st]}</button>)}</div></div>)}</div>
    {!roster.length?<div className="py-8 text-center" style={{color:'var(--slate)'}}>No approved Students in this class.</div>:<button className="btn-primary w-full justify-center mt-4" disabled={save.isPending} onClick={()=>save.mutate()}>{save.isPending?'Saving…':'Save Attendance'}</button>}
   </div>}
  </>:<div className="card"><div className="flex justify-between items-center mb-4"><h3 className="font-display font-bold" style={{color:'var(--navy)'}}>Attendance Summary</h3><input type="date" max={today} className="input w-auto" value={date} onChange={e=>setDate(e.target.value)}/></div>{summaryQ.isLoading?<TableSkeleton rows={5} cols={7}/>:<div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Class</th><th>Students</th><th>Present</th><th>Absent</th><th>Late</th><th>Half Day</th><th>Attendance %</th></tr></thead><tbody>{(summaryQ.data||[]).map(r=>{const denominator=Number(r.total_students||0);const attended=Number(r.present||0)+Number(r.late||0)+Number(r.half_day||0);const pct=denominator?Math.round(attended/denominator*100):0;return <tr key={r.id}><td><b>Class {r.class_name}-{r.section}</b></td><td>{r.total_students}</td><td style={{color:'var(--forest)'}}>{r.present}</td><td style={{color:'#C62828'}}>{r.absent}</td><td>{r.late}</td><td>{r.half_day}</td><td><b style={{color:pct>=85?'var(--forest)':'var(--saffron)'}}>{pct}%</b></td></tr>})}</tbody></table></div>}</div>}
 </div>;
}
