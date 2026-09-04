'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMyDocuments, getMyDocumentRequests, requestMyDocument, type StudentDocumentType } from '@/services/documentService';
import { apiErrorText } from '@/utils/errors';
import type { StudentSectionProps } from '@/types/studentPortal';

const TYPES: Array<{ value: StudentDocumentType; label: string }> = [
  { value:'BONAFIDE_CERTIFICATE', label:'Bonafide Certificate' },
  { value:'STUDY_CERTIFICATE', label:'Study Certificate' },
  { value:'CHARACTER_CERTIFICATE', label:'Character Certificate' },
  { value:'TRANSFER_CERTIFICATE', label:'Transfer Certificate' },
  { value:'ENROLLMENT_CERTIFICATE', label:'Enrollment Certificate' },
  { value:'OTHER', label:'Other School Record' },
];
const label = (type: StudentDocumentType) => TYPES.find((item) => item.value === type)?.label || type.replace(/_/g,' ');

export default function DocumentsSection({ notify }: StudentSectionProps) {
  const qc = useQueryClient();
  const [form,setForm] = useState<{ documentType:StudentDocumentType; purpose:string }>({ documentType:'BONAFIDE_CERTIFICATE', purpose:'' });
  const docsQ = useQuery({ queryKey:['student-documents'], queryFn:() => getMyDocuments().then((r) => r.data.data || []) });
  const requestsQ = useQuery({ queryKey:['student-document-requests'], queryFn:() => getMyDocumentRequests().then((r) => r.data.data || []) });
  const request = useMutation({
    mutationFn:() => requestMyDocument(form),
    onSuccess:async()=>{ notify('Certificate request sent to your School'); setForm((f)=>({ ...f,purpose:'' })); await qc.invalidateQueries({ queryKey:['student-document-requests'] }); },
    onError:(error:unknown)=>notify(apiErrorText(error)),
  });

  return <div className="space-y-5">
    <div><h1 className="font-display font-extrabold text-2xl" style={{color:'var(--navy)'}}>📁 Records & Certificates</h1><p className="text-sm mt-1" style={{color:'var(--slate)'}}>Request School certificates and keep issued records in one verified vault.</p></div>
    <div className="card"><h2 className="font-bold text-lg mb-3">Request a certificate</h2><div className="grid md:grid-cols-3 gap-3"><select className="input select" value={form.documentType} onChange={(e)=>setForm((f)=>({...f,documentType:e.target.value as StudentDocumentType}))}>{TYPES.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select><input className="input md:col-span-2" placeholder="Purpose, e.g. scholarship application" value={form.purpose} onChange={(e)=>setForm((f)=>({...f,purpose:e.target.value}))}/></div><button className="btn-primary mt-3" disabled={form.purpose.trim().length<5||request.isPending} onClick={()=>request.mutate()}>{request.isPending?'Sending…':'Send request'}</button></div>
    <div className="card"><h2 className="font-bold text-lg mb-3">Issued documents</h2>{docsQ.isLoading?<p>Loading…</p>:docsQ.isError?<p style={{color:'#B42318'}}>{apiErrorText(docsQ.error)}</p>:!(docsQ.data||[]).length?<p className="text-sm" style={{color:'var(--slate)'}}>No School-issued documents yet.</p>:<div className="grid md:grid-cols-2 gap-3">{(docsQ.data||[]).map((doc)=><div key={doc.id} className="p-4 rounded-xl" style={{border:'1px solid var(--border)',background:doc.status==='REVOKED'?'#FFF7F6':'#F8FBF9'}}><div className="flex justify-between gap-2"><div><div className="text-xs" style={{color:'var(--slate)'}}>{label(doc.document_type)}</div><div className="font-bold mt-1">{doc.title}</div></div><span className="text-xs font-bold">{doc.status}</span></div><div className="text-xs mt-3" style={{color:'var(--slate)'}}>{doc.document_number} · Issued {new Date(doc.issued_at).toLocaleDateString()}</div><div className="text-sm mt-2">{doc.school_name_snapshot}</div>{doc.status==='ISSUED'?<a className="btn-ghost inline-block text-xs mt-3" href={`/verify/document/${doc.verification_code}`} target="_blank" rel="noreferrer">Verify document</a>:<div className="text-xs mt-3" style={{color:'#B42318'}}>Revoked{doc.revocation_reason?`: ${doc.revocation_reason}`:''}</div>}</div>)}</div>}</div>
    <div className="card"><h2 className="font-bold text-lg mb-3">Request history</h2>{requestsQ.isLoading?<p>Loading…</p>:requestsQ.isError?<p style={{color:'#B42318'}}>{apiErrorText(requestsQ.error)}</p>:<div className="space-y-2">{(requestsQ.data||[]).map((row)=><div key={row.id} className="flex flex-wrap justify-between gap-3 p-3 rounded-xl" style={{background:'#F7F8FA'}}><div><b>{label(row.document_type)}</b><div className="text-xs mt-1" style={{color:'var(--slate)'}}>{row.purpose}</div></div><div className="text-xs font-bold">{row.status}</div></div>)}{!(requestsQ.data||[]).length&&<p className="text-sm" style={{color:'var(--slate)'}}>No requests yet.</p>}</div>}</div>
  </div>;
}
