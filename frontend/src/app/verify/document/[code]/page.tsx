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

  return <main className="public-document-verification min-h-screen p-5 md:p-10">
    <div className="max-w-2xl mx-auto">
      <div className="mb-6"><div className="font-display font-extrabold text-2xl" style={{color:'var(--navy)'}}>VidyaSetu Document Verification</div><p className="text-sm mt-1" style={{color:'var(--slate)'}}>Verify a School-issued Student record using its secure verification code.</p></div>
      {verificationQ.isLoading&&<div className="public-document-card">Checking document…</div>}
      {verificationQ.isError&&<div className="public-document-card" style={{borderLeft:'4px solid #B42318'}}><h1 className="font-bold text-lg" style={{color:'#FFD3B0'}}>Document not verified</h1><p className="text-sm mt-2">{apiErrorText(verificationQ.error,'The verification code is invalid or unavailable.')}</p></div>}
      {data&&<div className="public-document-card" style={{borderTop:`5px solid ${data.verified?'#74D39A':'#B42318'}`}}><div><div className="text-xs uppercase tracking-wide">Verification result</div><h1 className="font-display font-extrabold text-2xl mt-1" style={{color:data.verified?'#A8F0BB':'#FFD3B0'}}>{data.verified?'✓ Verified School Record':`✕ ${data.status}`}</h1></div><div className="public-document-details grid sm:grid-cols-2 gap-4 mt-6">{[
        ['Document',data.title],['Document type',String(data.documentType).replaceAll('_',' ')],['Academic year',data.academicYear||'—'],['Issued',new Date(data.issuedAt).toLocaleDateString()],['Valid until',data.validUntil||'No expiry'],
      ].map(([label,value])=><div key={label} className="p-3 rounded-xl"><div className="text-xs">{label}</div><div className="font-semibold mt-1">{value}</div></div>)}</div>{data.status==='REVOKED'&&<div className="mt-5 p-3 rounded-xl" style={{background:'rgba(255,255,255,.12)',color:'#FFD3B0'}}>This record has been revoked by the issuing School.</div>}<p className="text-xs mt-5">Verification confirms the record status without displaying student identity or private school records.</p></div>}
    </div>
  </main>;
}
