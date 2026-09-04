'use client';
import { useQuery } from '@tanstack/react-query';
import { getMyLibraryLoans } from '@/services/libraryService';
import { apiErrorText } from '@/utils/errors';

export default function LibrarySection(){
  const loansQ=useQuery({queryKey:['student-library-loans'],queryFn:()=>getMyLibraryLoans().then((r)=>r.data.data||[])});
  const loans=loansQ.data||[];
  const active=loans.filter((loan)=>loan.status==='ACTIVE');
  const history=loans.filter((loan)=>loan.status!=='ACTIVE');
  return <div className="space-y-5">
    <div><h1 className="font-display font-extrabold text-2xl" style={{color:'var(--navy)'}}>📚 My Library</h1><p className="text-sm mt-1" style={{color:'var(--slate)'}}>See books currently issued to you, due dates and your School library history.</p></div>
    {loansQ.isError&&<div className="card" style={{color:'#B42318'}}>{apiErrorText(loansQ.error)}</div>}
    <div className="card"><h2 className="font-bold text-lg mb-3">Currently issued</h2>{loansQ.isLoading?<p>Loading…</p>:!active.length?<p className="text-sm" style={{color:'var(--slate)'}}>No books are currently issued to you.</p>:<div className="grid md:grid-cols-2 gap-3">{active.map((loan)=><div key={loan.id} className="p-4 rounded-xl" style={{border:'1px solid var(--border)',background:'#F8FBF9'}}><div className="font-bold">{loan.title||'Library book'}</div>{loan.author&&<div className="text-xs mt-1" style={{color:'var(--slate)'}}>{loan.author}</div>}<div className="text-xs mt-2">Accession: {loan.accession_number||'—'}</div><div className="text-sm mt-2"><b>Due:</b> {new Date(loan.due_at).toLocaleDateString()}</div></div>)}</div>}</div>
    <div className="card"><h2 className="font-bold text-lg mb-3">Borrowing history</h2>{!history.length?<p className="text-sm" style={{color:'var(--slate)'}}>No returned books yet.</p>:<div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Book</th><th>Issued</th><th>Returned</th><th>Status</th></tr></thead><tbody>{history.map((loan)=><tr key={loan.id}><td><b>{loan.title}</b><div className="text-xs">{loan.accession_number}</div></td><td>{new Date(loan.issued_at).toLocaleDateString()}</td><td>{loan.returned_at?new Date(loan.returned_at).toLocaleDateString():'—'}</td><td>{loan.status}</td></tr>)}</tbody></table></div>}</div>
  </div>;
}
