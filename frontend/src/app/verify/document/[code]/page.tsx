'use client';

import { useQuery } from '@tanstack/react-query';
import { verifyStudentDocument } from '@/services/documentService';
import { apiErrorText } from '@/utils/errors';

export default function VerifyDocumentPage({ params }: { params: { code: string } }) {
  const verificationQ = useQuery({
    queryKey: ['public-document-verification', params.code],
    queryFn: () => verifyStudentDocument(params.code).then((r) => r.data.data),
    retry: false,
  });
  const data = verificationQ.data;

  return <main className="min-h-screen p-5 md:p-10" style={{background:'#F6F8FB'}}>
    <div className="max-w-2xl mx-auto">
      <div className="mb-6"><div className="font-display font-extrabold text-2xl" style={{color:'var(--navy)'}}>VidyaSetu Document Verification</div><p className="text-sm mt-1" style={{color:'var(--slate)'}}>Verify a School-issued Student record using its secure verification code.</p></div>
      {verificationQ.isLoading&&<div className="card">Checking document…</div>}
      {verificationQ.isError&&<div className="card" style={{borderLeft:'4px solid #B42318'}}><h1 className="font-bold text-lg" style={{color:'#B42318'}}>Document not verified</h1><p className="text-sm mt-2" style={{color:'var(--slate)'}}>{apiErrorText(verificationQ.error,'The verification code is invalid or unavailable.')}</p></div>}
      {data&&<div className="card" style={{borderTop:`5px solid ${data.verified?'#2E7D32':'#B42318'}`}}><div className="flex flex-wrap justify-between gap-3"><div><div className="text-xs uppercase tracking-wide" style={{color:'var(--slate)'}}>Verification result</div><h1 className="font-display font-extrabold text-2xl mt-1" style={{color:data.verified?'#2E7D32':'#B42318'}}>{data.verified?'✓ Verified School Record':`✕ ${data.status}`}</h1></div><div className="text-xs font-mono">{data.documentNumber}</div></div><div className="grid sm:grid-cols-2 gap-4 mt-6">{[
        ['Document',data.title],['Student',data.studentName],['Student ID',data.studentCode],['School',data.schoolName],['Class',data.classLabel||'—'],['Academic year',data.academicYear||'—'],['Issued',new Date(data.issuedAt).toLocaleDateString()],['Valid until',data.validUntil||'No expiry'],
      ].map(([label,value])=><div key={label} className="p-3 rounded-xl" style={{background:'#F7F8FA'}}><div className="text-xs" style={{color:'var(--slate)'}}>{label}</div><div className="font-semibold mt-1">{value}</div></div>)}</div>{data.status==='REVOKED'&&<div className="mt-5 p-3 rounded-xl" style={{background:'#FFF1F0',color:'#B42318'}}>This record has been revoked by the issuing School{data.revocationReason?`: ${data.revocationReason}`:'.'}</div>}<p className="text-xs mt-5" style={{color:'var(--slate)'}}>Verification exposes only the minimum certificate identity required to validate the record. Contact the issuing School for questions about the document.</p></div>}
    </div>
  </main>;
}
