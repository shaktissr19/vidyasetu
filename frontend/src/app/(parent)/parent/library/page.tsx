'use client';

import { useEffect,useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getChildren } from '@/services/parentService';
import { getParentChildLibraryLoans } from '@/services/libraryService';
import { apiErrorText } from '@/utils/errors';

export default function ParentLibraryPage(){
  const childrenQ=useQuery({queryKey:['parent-children'],queryFn:()=>getChildren().then(r=>r.data.data||[])});
  const [studentId,setStudentId]=useState('');
  useEffect(()=>{if(!studentId&&childrenQ.data?.[0]?.id)setStudentId(childrenQ.data[0].id);},[childrenQ.data,studentId]);
  const loansQ=useQuery({queryKey:['parent-child-library-loans',studentId],queryFn:()=>getParentChildLibraryLoans(studentId).then(r=>r.data.data||[]),enabled:Boolean(studentId)});
  const loans=loansQ.data||[]; const active=loans.filter(l=>l.status==='ACTIVE');
  return <div className="animate-fade-up space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-display font-extrabold text-2xl" style={{color:'var(--navy)'}}>📚 Child Library</h1><p className="text-sm mt-1" style={{color:'var(--slate)'}}>See current School library books and borrowing history for your linked child.</p></div><select className="input select w-auto min-w-[220px]" value={studentId} onChange={e=>setStudentId(e.target.value)}>{(childrenQ.data||[]).map(child=><option key={child.id} value={child.id}>{child.name} · Class {child.class_name}-{child.section||''}</option>)}</select></div>
    {childrenQ.isError&&<div className="card" style={{color:'#B42318'}}>{apiErrorText(childrenQ.error)}</div>}
    {loansQ.isError&&<div className="card" style={{color:'#B42318'}}>{apiErrorText(loansQ.error)}</div>}
    <div className="card"><h2 className="font-bold text-lg mb-3">Currently issued</h2>{loansQ.isLoading?<p>Loading…</p>:!active.length?<p className="text-sm" style={{color:'var(--slate)'}}>No books currently issued to this child.</p>:<div className="grid md:grid-cols-2 gap-3">{active.map(l=><div key={l.id} className="p-4 rounded-xl" style={{border:'1px solid var(--border)',background:'#F8FBF9'}}><div className="font-bold">{l.title}</div>{l.author&&<div className="text-xs mt-1" style={{color:'var(--slate)'}}>{l.author}</div>}<div className="text-xs mt-2">Accession: {l.accession_number||'—'}</div><div className="text-sm mt-2"><b>Due:</b> {new Date(l.due_at).toLocaleDateString()}</div></div>)}</div>}</div>
    <div className="card"><h2 className="font-bold text-lg mb-3">Borrowing history</h2><div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Book</th><th>Issued</th><th>Due</th><th>Returned</th><th>Status</th></tr></thead><tbody>{loans.map(l=><tr key={l.id}><td><b>{l.title}</b><div className="text-xs">{l.accession_number}</div></td><td>{new Date(l.issued_at).toLocaleDateString()}</td><td>{new Date(l.due_at).toLocaleDateString()}</td><td>{l.returned_at?new Date(l.returned_at).toLocaleDateString():'—'}</td><td>{l.status}</td></tr>)}</tbody></table>{!loans.length&&!loansQ.isLoading&&<div className="py-6 text-center text-sm" style={{color:'var(--slate)'}}>No borrowing history.</div>}</div></div>
  </div>;
}
