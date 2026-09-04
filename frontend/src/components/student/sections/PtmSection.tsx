'use client';
import { useQuery } from '@tanstack/react-query';
import { getStudentPtmBookings } from '@/services/ptmService';
import { apiErrorText } from '@/utils/errors';

export default function PtmSection(){
  const q=useQuery({queryKey:['student-ptm-bookings'],queryFn:()=>getStudentPtmBookings().then(r=>r.data.data||[])});
  const bookings=q.data||[];
  const upcoming=bookings.filter(b=>b.status==='BOOKED'&&b.starts_at&&new Date(b.starts_at)>new Date());
  const history=bookings.filter(b=>!upcoming.some(u=>u.id===b.id));
  return <div className="space-y-5">
    <div><h1 className="font-display font-extrabold text-2xl" style={{color:'var(--navy)'}}>🤝 PTM & Meetings</h1><p className="text-sm mt-1" style={{color:'var(--slate)'}}>View Parent–Teacher Meeting appointments booked for you. Booking and cancellation are handled by your linked Parent.</p></div>
    {q.isError&&<div className="card" style={{color:'#B42318'}}>{apiErrorText(q.error)}</div>}
    <div className="card"><h2 className="font-bold text-lg mb-3">Upcoming appointments</h2>{q.isLoading?<p>Loading…</p>:!upcoming.length?<p className="text-sm" style={{color:'var(--slate)'}}>No upcoming PTM appointment.</p>:<div className="grid md:grid-cols-2 gap-3">{upcoming.map(b=><div key={b.id} className="p-4 rounded-xl" style={{border:'1px solid var(--border)',background:'#F8FBF9'}}><div className="font-bold">{b.session_title||'Parent–Teacher Meeting'}</div><div className="text-sm mt-2"><b>Teacher:</b> {b.teacher_name||'—'}</div><div className="text-sm"><b>When:</b> {b.starts_at?new Date(b.starts_at).toLocaleString():'—'}</div><div className="text-sm"><b>Location:</b> {b.location||'School campus'}</div></div>)}</div>}</div>
    <div className="card"><h2 className="font-bold text-lg mb-3">Meeting history</h2>{!history.length?<p className="text-sm" style={{color:'var(--slate)'}}>No PTM history yet.</p>:<div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Meeting</th><th>Teacher</th><th>Time</th><th>Status</th><th>Outcome</th></tr></thead><tbody>{history.map(b=><tr key={b.id}><td>{b.session_title||'PTM'}</td><td>{b.teacher_name||'—'}</td><td>{b.starts_at?new Date(b.starts_at).toLocaleString():'—'}</td><td>{b.status}</td><td>{b.outcome_note||'—'}</td></tr>)}</tbody></table></div>}</div>
  </div>;
}
