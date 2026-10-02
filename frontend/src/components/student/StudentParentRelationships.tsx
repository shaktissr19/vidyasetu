'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createStudentParentLinkRequest,
  getStudentParentLinkRequests,
  reviewStudentParentLinkRequest,
  type ParentLinkRequest,
} from '@/services/registrationLinkService';
import { apiErrorText } from '@/utils/errors';

function parentLabel(request: ParentLinkRequest): string {
  return request.registered_parent_name || request.parent_name || request.registered_parent_mobile || request.parent_mobile || request.registered_parent_email || request.parent_email || 'Parent / Guardian';
}

export default function StudentParentRelationships() {
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState({ parentName: '', parentMobile: '', parentEmail: '', parentRelation: 'PARENT' as 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'PARENT' });
  const [notice, setNotice] = useState('');

  const requestsQ = useQuery({
    queryKey: ['student-parent-link-requests'],
    queryFn: () => getStudentParentLinkRequests().then((response) => response.data.data || []),
    staleTime: 15_000,
  });

  const invite = useMutation({
    mutationFn: () => createStudentParentLinkRequest({
      parentName: form.parentName.trim() || undefined,
      parentMobile: form.parentMobile || undefined,
      parentEmail: form.parentEmail.trim() || undefined,
      parentRelation: form.parentRelation,
    }),
    onSuccess: async () => {
      setNotice('Parent invitation created. Access stays locked until the Parent confirms it.');
      setForm({ parentName: '', parentMobile: '', parentEmail: '', parentRelation: 'PARENT' });
      setShowInvite(false);
      await qc.invalidateQueries({ queryKey: ['student-parent-link-requests'] });
    },
    onError: (error: unknown) => setNotice(apiErrorText(error, 'Could not create Parent invitation')),
  });

  const review = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'APPROVE' | 'REJECT' }) => reviewStudentParentLinkRequest(id, action),
    onSuccess: async (_response, variables) => {
      setNotice(variables.action === 'APPROVE' ? 'Parent relationship confirmed.' : 'Parent relationship request rejected.');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['student-parent-link-requests'] }),
        qc.invalidateQueries({ queryKey: ['student-dashboard'] }),
      ]);
    },
    onError: (error: unknown) => setNotice(apiErrorText(error, 'Could not update Parent relationship')),
  });

  const requests = requestsQ.data || [];
  const canInvite = Boolean(form.parentMobile || form.parentEmail.trim());

  return (
    <div className="card mb-5" style={{ borderLeft: '4px solid var(--saffron)' }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-bold text-base" style={{ color: 'var(--navy)' }}>👪 Parent / Guardian connections</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>You control who becomes connected to your Student identity. Requests never grant access automatically.</p>
        </div>
        <button className="btn-ghost text-xs" onClick={() => setShowInvite((value) => !value)}>{showInvite ? 'Cancel invitation' : '+ Invite Parent'}</button>
      </div>

      {notice && <div className="text-xs mt-3 p-3 rounded-lg" style={{ background: '#F5F8FC', border: '1px solid #DDE5EF', color: '#465269' }}>{notice}</div>}

      {showInvite && <div className="mt-4 p-4 rounded-xl" style={{ background: '#F7F8FA' }}>
        <div className="grid md:grid-cols-2 gap-3">
          <div><label className="block text-xs font-semibold mb-1">Parent name</label><input className="input" value={form.parentName} onChange={(e) => setForm((value) => ({ ...value, parentName: e.target.value }))} /></div>
          <div><label className="block text-xs font-semibold mb-1">Relation</label><select className="input select" value={form.parentRelation} onChange={(e) => setForm((value) => ({ ...value, parentRelation: e.target.value as typeof value.parentRelation }))}><option value="PARENT">Parent</option><option value="FATHER">Father</option><option value="MOTHER">Mother</option><option value="GUARDIAN">Guardian</option></select></div>
          <div><label className="block text-xs font-semibold mb-1">Mobile</label><input className="input" maxLength={10} value={form.parentMobile} onChange={(e) => setForm((value) => ({ ...value, parentMobile: e.target.value.replace(/\D/g, '') }))} placeholder="10-digit mobile" /></div>
          <div><label className="block text-xs font-semibold mb-1">Email</label><input className="input" type="email" value={form.parentEmail} onChange={(e) => setForm((value) => ({ ...value, parentEmail: e.target.value }))} /></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
          <span className="text-xs" style={{ color: 'var(--slate)' }}>Use the Parent's own mobile/email. They must confirm from their Parent account.</span>
          <button className="btn-primary text-xs" disabled={invite.isPending || !canInvite} onClick={() => invite.mutate()}>{invite.isPending ? 'Sending…' : 'Send invitation'}</button>
        </div>
      </div>}

      <div className="mt-4">
        {requestsQ.isLoading ? <p className="text-sm" style={{ color: 'var(--slate)' }}>Checking Parent relationships…</p> : requests.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--slate)' }}>No pending Parent relationship requests.</p>
        ) : <div className="space-y-2">
          {requests.map((request) => {
            const needsStudent = request.status === 'AWAITING_STUDENT';
            return <div key={request.id} className="p-3 rounded-xl flex flex-wrap items-center justify-between gap-3" style={{ border: '1px solid var(--border)' }}>
              <div>
                <div className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{parentLabel(request)}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{request.relation || 'PARENT'} · {request.initiated_by === 'PARENT' ? 'Requested by Parent' : 'Invited by Student'}</div>
                <div className="text-xs font-semibold mt-1" style={{ color: needsStudent ? 'var(--saffron)' : 'var(--forest)' }}>{needsStudent ? 'Your confirmation required' : 'Waiting for Parent confirmation'}</div>
              </div>
              {needsStudent ? <div className="flex gap-2"><button className="btn-primary text-xs" disabled={review.isPending} onClick={() => review.mutate({ id: request.id, action: 'APPROVE' })}>Confirm</button><button className="btn-ghost text-xs" disabled={review.isPending} onClick={() => review.mutate({ id: request.id, action: 'REJECT' })}>Reject</button></div> : <span className="text-xs" style={{ color: 'var(--slate)' }}>Parent action required</span>}
            </div>;
          })}
        </div>}
      </div>
    </div>
  );
}
