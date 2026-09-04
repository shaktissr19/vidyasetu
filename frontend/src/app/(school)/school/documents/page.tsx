'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getStudents } from '@/services/schoolService';
import {
  getSchoolDocuments,getSchoolDocumentRequests,issueStudentDocument,reviewSchoolDocumentRequest,revokeStudentDocument,
  type StudentDocumentRequest,type StudentDocumentType,
} from '@/services/documentService';
import { apiErrorText } from '@/utils/errors';

const TYPES: Array<{value:StudentDocumentType;label:string}> = [
  {value:'BONAFIDE_CERTIFICATE',label:'Bonafide Certificate'},{value:'STUDY_CERTIFICATE',label:'Study Certificate'},
  {value:'CHARACTER_CERTIFICATE',label:'Character Certificate'},{value:'TRANSFER_CERTIFICATE',label:'Transfer Certificate'},
  {value:'ENROLLMENT_CERTIFICATE',label:'Enrollment Certificate'},{value:'OTHER',label:'Other School Record'},
];
const typeLabel=(type:StudentDocumentType)=>TYPES.find((x)=>x.value===type)?.label||type.replace(/_/g,' ');

export default function SchoolDocumentsPage(){
  const qc=useQueryClient();
  const [tab,setTab]=useState<'requests'|'issued'>('requests');
  const [form,setForm]=useState({studentId:'',documentType:'BONAFIDE_CERTIFICATE' as StudentDocumentType,title:'Bonafide Certificate',academicYear:'2026-27',validUntil:'',notes:'',requestId:''});
  const studentsQ=useQuery({queryKey:['school-students-documents'],queryFn:()=>getStudents({limit:200}).then((r)=>r.data.data||[])});
  const requestsQ=useQuery({queryKey:['school-document-requests'],queryFn:()=>getSchoolDocumentRequests().then((r)=>r.data.data||[])});
  const docsQ=useQuery({queryKey:['school-documents'],queryFn:()=>getSchoolDocuments().then((r)=>r.data.data||[])});
  const students=studentsQ.data||[];
  const selected=useMemo(()=>students.find((s)=>s.id===form.studentId),[students,form.studentId]);
  const refresh=async()=>Promise.all([qc.invalidateQueries({queryKey:['school-document-requests']}),qc.invalidateQueries({queryKey:['school-documents']})]);
  const review=useMutation({mutationFn:({id,action}:{id:string;action:'APPROVE'|'REJECT'})=>reviewSchoolDocumentRequest(id,action),onSuccess:async()=>{toast.success('Request updated');await refresh();},onError:(e:unknown)=>toast.error(apiErrorText(e))});
  const issue=useMutation({mutationFn:()=>issueStudentDocument({studentId:form.studentId,documentType:form.documentType,title:form.title,academicYear:form.academicYear||undefined,validUntil:form.validUntil||undefined,notes:form.notes||undefined,requestId:form.requestId||undefined}),onSuccess:async(res)=>{toast.success(`Issued ${res.data.data.document_number}`);setForm((f)=>({...f,requestId:'',notes:''}));await refresh();setTab('issued');},onError:(e:unknown)=>toast.error(apiErrorText(e))});
  const revoke=useMutation({mutationFn:({id,reason}:{id:string;reason:string})=>revokeStudentDocument(id,reason),onSuccess:async()=>{toast.success('Document revoked');await refresh();},onError:(e:unknown)=>toast.error(apiErrorText(e))});
  function useRequest(row:StudentDocumentRequest){setForm({studentId:row.student_id,documentType:row.document_type,title:typeLabel(row.document_type),academicYear:'2026-27',validUntil:'',notes:row.purpose,requestId:row.id});}

  return <div className="animate-fade-up space-y-5">
    <div><h1 className="font-display font-extrabold text-2xl" style={{color:'var(--navy)'}}>📁 Student Records & Certificates</h1><p className="text-sm mt-1" style={{color:'var(--slate)'}}>Review requests, issue structured School records, revoke invalid documents and preserve verification history.</p></div>
    <div className="card text-sm" style={{borderLeft:'4px solid var(--saffron)',color:'var(--slate)'}}>Issued records are immutable snapshots. Revocation preserves the original record and marks verification as invalid instead of deleting it.</div>
    <div className="card"><h2 className="font-bold text-lg mb-4">Issue document</h2><div className="grid md:grid-cols-3 gap-3"><select className="input select" value={form.studentId} onChange={(e)=>setForm((f)=>({...f,studentId:e.target.value}))}><option value="">Select Student</option>{students.map((s)=><option key={s.id} value={s.id}>{s.name} · {s.student_code}</option>)}</select><select className="input select" value={form.documentType} onChange={(e)=>{const type=e.target.value as StudentDocumentType;setForm((f)=>({...f,documentType:type,title:typeLabel(type)}));}}>{TYPES.map((x)=><option key={x.value} value={x.value}>{x.label}</option>)}</select><input className="input" value={form.title} onChange={(e)=>setForm((f)=>({...f,title:e.target.value}))} placeholder="Document title"/><input className="input" value={form.academicYear} onChange={(e)=>setForm((f)=>({...f,academicYear:e.target.value}))} placeholder="Academic year"/><input className="input" type="date" value={form.validUntil} onChange={(e)=>setForm((f)=>({...f,validUntil:e.target.value}))}/><input className="input" value={form.notes} onChange={(e)=>setForm((f)=>({...f,notes:e.target.value}))} placeholder="Notes / purpose"/></div><div className="text-xs mt-3" style={{color:'var(--slate)'}}>{selected?`Issuing for ${selected.name} · Class ${selected.class_name}-${selected.section||''}`:'Select an enrolled Student'}{form.requestId?' · Linked to approved/pending request':''}</div><button className="btn-primary mt-3" disabled={!form.studentId||form.title.trim().length<3||issue.isPending} onClick={()=>issue.mutate()}>{issue.isPending?'Issuing…':'Issue verified record'}</button></div>
    <div className="flex gap-2"><button className={tab==='requests'?'btn-primary':'btn-ghost'} onClick={()=>setTab('requests')}>Requests</button><button className={tab==='issued'?'btn-primary':'btn-ghost'} onClick={()=>setTab('issued')}>Issued records</button></div>
    {tab==='requests'?<div className="card"><div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Student</th><th>Document</th><th>Purpose</th><th>Status</th><th>Action</th></tr></thead><tbody>{(requestsQ.data||[]).map((row)=><tr key={row.id}><td><b>{row.student_name}</b><div className="text-xs">{row.student_code}</div></td><td>{typeLabel(row.document_type)}</td><td>{row.purpose}</td><td>{row.status}</td><td><div className="flex flex-wrap gap-1">{row.status==='PENDING'&&<><button className="btn-ghost text-xs" onClick={()=>review.mutate({id:row.id,action:'APPROVE'})}>Approve</button><button className="btn-ghost text-xs" onClick={()=>review.mutate({id:row.id,action:'REJECT'})}>Reject</button></>}{['PENDING','APPROVED'].includes(row.status)&&<button className="btn-outline text-xs" onClick={()=>useRequest(row)}>Prepare issue</button>}</div></td></tr>)}</tbody></table>{!(requestsQ.data||[]).length&&<div className="py-8 text-center" style={{color:'var(--slate)'}}>No certificate requests.</div>}</div></div>:<div className="card"><div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Document</th><th>Student</th><th>Issued</th><th>Status</th><th>Verification</th><th>Action</th></tr></thead><tbody>{(docsQ.data||[]).map((doc)=><tr key={doc.id}><td><b>{doc.title}</b><div className="text-xs">{doc.document_number}</div></td><td>{doc.student_name_snapshot}<div className="text-xs">{doc.student_code_snapshot}</div></td><td>{new Date(doc.issued_at).toLocaleDateString()}</td><td>{doc.status}</td><td><a className="text-xs underline" href={`/verify/document/${doc.verification_code}`} target="_blank" rel="noreferrer">Open verifier</a></td><td>{doc.status==='ISSUED'&&<button className="btn-ghost text-xs" onClick={()=>{const reason=window.prompt('Revocation reason');if(reason&&reason.trim().length>=5)revoke.mutate({id:doc.id,reason});}}>Revoke</button>}</td></tr>)}</tbody></table></div></div>}
  </div>;
}
