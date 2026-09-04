'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getChildren } from '@/services/parentService';
import { getParentChildDocuments,getParentChildDocumentRequests,requestParentChildDocument,type StudentDocumentType } from '@/services/documentService';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

const TYPES: Array<{value:StudentDocumentType;label:string}>=[
  {value:'BONAFIDE_CERTIFICATE',label:'Bonafide Certificate'},{value:'STUDY_CERTIFICATE',label:'Study Certificate'},
  {value:'CHARACTER_CERTIFICATE',label:'Character Certificate'},{value:'TRANSFER_CERTIFICATE',label:'Transfer Certificate'},
  {value:'ENROLLMENT_CERTIFICATE',label:'Enrollment Certificate'},{value:'OTHER',label:'Other School Record'},
];
const label=(type:StudentDocumentType)=>TYPES.find((x)=>x.value===type)?.label||type.replace(/_/g,' ');

export default function ParentDocumentsPage(){
  const qc=useQueryClient();
  const childrenQ=useQuery({queryKey:['parent-children'],queryFn:()=>getChildren().then((r)=>r.data.data||[])});
  const [studentId,setStudentId]=useState('');
  const [form,setForm]=useState<{documentType:StudentDocumentType;purpose:string}>({documentType:'BONAFIDE_CERTIFICATE',purpose:''});
  useEffect(()=>{if(!studentId&&childrenQ.data?.[0]?.id)setStudentId(childrenQ.data[0].id);},[childrenQ.data,studentId]);
  const docsQ=useQuery({queryKey:['parent-child-documents',studentId],queryFn:()=>getParentChildDocuments(studentId).then((r)=>r.data.data||[]),enabled:Boolean(studentId)});
  const requestsQ=useQuery({queryKey:['parent-child-document-requests',studentId],queryFn:()=>getParentChildDocumentRequests(studentId).then((r)=>r.data.data||[]),enabled:Boolean(studentId)});
  const request=useMutation({mutationFn:()=>requestParentChildDocument(studentId,form),onSuccess:async()=>{toast.success('Certificate request sent to School');setForm((f)=>({...f,purpose:''}));await qc.invalidateQueries({queryKey:['parent-child-document-requests',studentId]});},onError:(e:unknown)=>toast.error(apiErrorText(e))});

  return <div className="animate-fade-up space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-display font-extrabold text-2xl" style={{color:'var(--navy)'}}>📁 Records & Certificates</h1><p className="text-sm mt-1" style={{color:'var(--slate)'}}>Request and verify School-issued records for your linked child.</p></div><select className="input select w-auto min-w-[220px]" value={studentId} onChange={(e)=>setStudentId(e.target.value)}>{(childrenQ.data||[]).map((child)=><option key={child.id} value={child.id}>{child.name} · Class {child.class_name}-{child.section||''}</option>)}</select></div>
    {childrenQ.isError&&<div className="card" style={{color:'#B42318'}}>{apiErrorText(childrenQ.error)}</div>}
    <div className="card"><h2 className="font-bold text-lg mb-3">Request a certificate</h2><div className="grid md:grid-cols-3 gap-3"><select className="input select" value={form.documentType} onChange={(e)=>setForm((f)=>({...f,documentType:e.target.value as StudentDocumentType}))}>{TYPES.map((x)=><option key={x.value} value={x.value}>{x.label}</option>)}</select><input className="input md:col-span-2" placeholder="Purpose, e.g. scholarship / admission" value={form.purpose} onChange={(e)=>setForm((f)=>({...f,purpose:e.target.value}))}/></div><button className="btn-primary mt-3" disabled={!studentId||form.purpose.trim().length<5||request.isPending} onClick={()=>request.mutate()}>{request.isPending?'Sending…':'Send request'}</button></div>
    <div className="card"><h2 className="font-bold text-lg mb-3">School-issued records</h2>{docsQ.isLoading?<p>Loading…</p>:docsQ.isError?<p style={{color:'#B42318'}}>{apiErrorText(docsQ.error)}</p>:!(docsQ.data||[]).length?<p className="text-sm" style={{color:'var(--slate)'}}>No issued records for this child.</p>:<div className="grid md:grid-cols-2 gap-3">{(docsQ.data||[]).map((doc)=><div key={doc.id} className="p-4 rounded-xl" style={{border:'1px solid var(--border)',background:doc.status==='REVOKED'?'#FFF7F6':'#F8FBF9'}}><div className="text-xs" style={{color:'var(--slate)'}}>{label(doc.document_type)}</div><div className="font-bold mt-1">{doc.title}</div><div className="text-xs mt-2">{doc.document_number}</div><div className="text-xs mt-1" style={{color:'var(--slate)'}}>Issued {new Date(doc.issued_at).toLocaleDateString()} · {doc.status}</div>{doc.status==='ISSUED'?<a className="btn-ghost inline-block text-xs mt-3" href={`/verify/document/${doc.verification_code}`} target="_blank" rel="noreferrer">Verify document</a>:<div className="text-xs mt-3" style={{color:'#B42318'}}>Revoked{doc.revocation_reason?`: ${doc.revocation_reason}`:''}</div>}</div>)}</div>}</div>
    <div className="card"><h2 className="font-bold text-lg mb-3">Request history</h2>{requestsQ.isLoading?<p>Loading…</p>:requestsQ.isError?<p style={{color:'#B42318'}}>{apiErrorText(requestsQ.error)}</p>:<div className="space-y-2">{(requestsQ.data||[]).map((row)=><div key={row.id} className="flex flex-wrap justify-between gap-3 p-3 rounded-xl" style={{background:'#F7F8FA'}}><div><b>{label(row.document_type)}</b><div className="text-xs mt-1" style={{color:'var(--slate)'}}>{row.purpose}</div></div><div className="text-xs font-bold">{row.status}</div></div>)}{!(requestsQ.data||[]).length&&<p className="text-sm" style={{color:'var(--slate)'}}>No requests yet.</p>}</div>}</div>
  </div>;
}
