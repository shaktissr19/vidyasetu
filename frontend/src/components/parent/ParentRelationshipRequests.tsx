'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getParentLinkRequests,
  requestParentChildLink,
  reviewParentLinkRequest,
  type ParentLinkRequest,
} from '@/services/registrationLinkService';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

function statusLabel(request: ParentLinkRequest): string {
  if (request.status === 'AWAITING_STUDENT') return 'Waiting for Student confirmation';
  if (request.status === 'AWAITING_PARENT') return 'Your confirmation required';
  if (request.status === 'PENDING') return 'Pending verification';
  return request.status.replaceAll('_', ' ');
}

export default function ParentRelationshipRequests() {
  const qc = useQueryClient();
  const [studentCode, setStudentCode] = useState('');
  const [relation, setRelation] = useState<'FATHER' | 'MOTHER' | 'GUARDIAN' | 'PARENT'>('PARENT');
  const requestsQ = useQuery({
    queryKey: ['parent-link-requests'],
    queryFn: () => getParentLinkRequests().then((response) => response.data.data || []),
    staleTime: 15_000,
  });

  const requestLink = useMutation({
    mutationFn: () => requestParentChildLink(studentCode.trim(), relation),
    onSuccess: async () => {
      setStudentCode('');
      toast.success('Relationship request sent. The Student must confirm it.');
      await qc.invalidateQueries({ queryKey: ['parent-link-requests'] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not request child link')),
  });

  const review = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'APPROVE' | 'REJECT' }) => reviewParentLinkRequest(id, action),
    onSuccess: async (_response, variables) => {
      toast.success(variables.action === 'APPROVE' ? 'Child relationship confirmed.' : 'Relationship request rejected.');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['parent-link-requests'] }),
        qc.invalidateQueries({ queryKey: ['parent-children'] }),
        qc.invalidateQueries({ queryKey: ['parent-child-dash'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not update relationship')),
  });

  const requests = requestsQ.data || [];

  return (
    <div className="card mb-5" style={{ borderLeft: '4px solid var(--forest)' }}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-display font-bold text-base" style={{ color: 'var(--forest)' }}>👪 Child connections</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>A Student ID creates a request only. No child data is shared until the relationship is confirmed.</p>
        </div>
        <span className="badge badge-green">Verified relationships only</span>
      </div>

      <div className="grid md:grid-cols-[1fr_180px_auto] gap-2 items-end p-3 rounded-xl mb-4" style={{ background: '#F7F8FA' }}>
        <div>
          <label className="block text-xs font-semibold mb-1">Connect another child by Student ID</label>
          <input className="input" value={studentCode} onChange={(e) => setStudentCode(e.target.value.toUpperCase())} placeholder="Permanent VidyaSetu Student ID" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Relation</label>
          <select className="input select" value={relation} onChange={(e) => setRelation(e.target.value as typeof relation)}>
            <option value="PARENT">Parent</option><option value="FATHER">Father</option><option value="MOTHER">Mother</option><option value="GUARDIAN">Guardian</option>
          </select>
        </div>
        <button className="btn-primary" disabled={requestLink.isPending || studentCode.trim().length < 3} onClick={() => requestLink.mutate()}>
          {requestLink.isPending ? 'Sending…' : 'Request link'}
        </button>
      </div>

      {requestsQ.isLoading ? <p className="text-sm" style={{ color: 'var(--slate)' }}>Checking relationship requests…</p> : requests.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--slate)' }}>No pending relationship requests.</p>
      ) : (
        <div className="space-y-2">
          {requests.map((request) => {
            const needsParent = request.status === 'AWAITING_PARENT' || (request.status === 'PENDING' && request.initiated_by === 'STUDENT');
            return (
              <div key={request.id} className="p-3 rounded-xl flex flex-wrap items-center justify-between gap-3" style={{ border: '1px solid var(--border)' }}>
                <div>
                  <div className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{request.student_name || 'Student relationship request'}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>
                    {request.student_code ? `ID ${request.student_code} · ` : ''}{request.relation || 'PARENT'}{request.school_name ? ` · ${request.school_name}` : ''}
                  </div>
                  <div className="text-xs mt-1 font-semibold" style={{ color: needsParent ? 'var(--saffron)' : 'var(--forest)' }}>{statusLabel(request)}</div>
                </div>
                {needsParent ? <div className="flex gap-2">
                  <button className="btn-primary text-xs" disabled={review.isPending} onClick={() => review.mutate({ id: request.id, action: 'APPROVE' })}>Confirm</button>
                  <button className="btn-ghost text-xs" disabled={review.isPending} onClick={() => review.mutate({ id: request.id, action: 'REJECT' })}>Reject</button>
                </div> : <span className="text-xs" style={{ color: 'var(--slate)' }}>Student action required</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
