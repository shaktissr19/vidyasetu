'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getTeacherRegistrationRequests,
  reviewTeacherRegistrationRequest,
} from '@/services/registrationLinkService';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

export default function TeacherRegistrationRequests() {
  const qc = useQueryClient();
  const requestsQ = useQuery({
    queryKey: ['teacher-registration-requests'],
    queryFn: () => getTeacherRegistrationRequests().then((response) => response.data.data || []),
    staleTime: 15_000,
  });
  const review = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'APPROVE' | 'REJECT' }) => reviewTeacherRegistrationRequest(id, action),
    onSuccess: async (_response, variables) => {
      toast.success(variables.action === 'APPROVE' ? 'Teacher membership approved.' : 'Teacher membership request rejected.');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['teacher-registration-requests'] }),
        qc.invalidateQueries({ queryKey: ['school-teachers'] }),
        qc.invalidateQueries({ queryKey: ['school-overview'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not review Teacher request')),
  });

  const requests = (requestsQ.data || []).filter((request) => request.status === 'PENDING');
  if (!requestsQ.isLoading && requests.length === 0) return null;

  return (
    <div className="card mb-5" style={{ border: '2px solid #F0D88A', background: '#FFFDF6' }}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-display font-bold" style={{ color: 'var(--navy)' }}>👩‍🏫 Teacher membership requests</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Teacher self-registration never adds staff automatically. Approve only identities that belong to this School.</p>
        </div>
        <span className="badge badge-orange">{requestsQ.isLoading ? 'Checking…' : `${requests.length} pending`}</span>
      </div>
      {requestsQ.isLoading ? <div className="text-sm" style={{ color: 'var(--slate)' }}>Loading Teacher requests…</div> : <div className="space-y-2">
        {requests.map((request) => <div key={request.id} className="p-3 rounded-xl flex flex-wrap items-center justify-between gap-3" style={{ background: '#fff', border: '1px solid var(--border)' }}>
          <div>
            <div className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{request.name || 'Teacher applicant'} {request.employee_id ? <span className="font-normal" style={{ color: 'var(--slate)' }}>· {request.employee_id}</span> : null}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{request.designation || 'Teacher'}{request.qualification ? ` · ${request.qualification}` : ''}{request.experience_yrs ? ` · ${request.experience_yrs} yrs` : ''}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{request.mobile || 'No mobile'}{request.email ? ` · ${request.email}` : ''}</div>
            {request.teacher_note && <div className="text-xs mt-1">Note: {request.teacher_note}</div>}
          </div>
          <div className="flex gap-2">
            <button className="btn-primary text-xs" disabled={review.isPending} onClick={() => review.mutate({ id: request.id, action: 'APPROVE' })}>Approve</button>
            <button className="btn-ghost text-xs" disabled={review.isPending} onClick={() => review.mutate({ id: request.id, action: 'REJECT' })}>Reject</button>
          </div>
        </div>)}
      </div>}
    </div>
  );
}
