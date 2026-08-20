'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getClasses, getEnrollmentRequests, reviewEnrollmentRequest, type SchoolClassRow } from '@/services/schoolService';
import { apiErrorText } from '@/utils/errors';

export default function SchoolEnrollmentRequestsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const [selectedClass, setSelectedClass] = useState<Record<string, string>>({});
  const [rollNumber, setRollNumber] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');

  const requestsQuery = useQuery({
    queryKey: ['school-enrollment-requests', status],
    queryFn: async () => (await getEnrollmentRequests(status)).data.data || [],
  });
  const classesQuery = useQuery({
    queryKey: ['school-classes'],
    queryFn: async () => (await getClasses()).data.data || [],
  });

  const classes = classesQuery.data || [];
  const byGrade = useMemo<Record<string, SchoolClassRow[]>>(() => {
    const map: Record<string, SchoolClassRow[]> = {};
    for (const row of classes) (map[row.class_name] ||= []).push(row);
    return map;
  }, [classes]);

  const review = useMutation({
    mutationFn: ({ requestId, action }: { requestId: string; action: 'APPROVE' | 'REJECT' }) => reviewEnrollmentRequest(requestId, {
      action,
      classId: action === 'APPROVE' ? selectedClass[requestId] || undefined : undefined,
      rollNumber: action === 'APPROVE' ? rollNumber[requestId] || undefined : undefined,
    }),
    onSuccess: async (_, variables) => {
      setMessage(variables.action === 'APPROVE' ? 'Student enrollment approved.' : 'Enrollment request rejected.');
      await qc.invalidateQueries({ queryKey: ['school-enrollment-requests'] });
      await qc.invalidateQueries({ queryKey: ['school-students'] });
      await qc.invalidateQueries({ queryKey: ['school-overview'] });
    },
    onError: (error: unknown) => setMessage(apiErrorText(error)),
  });

  const requests = requestsQuery.data || [];

  return (
    <div className="animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--navy)' }}>✅ Student Enrollment Requests</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Self-registered Students appear here before they are added to your official school roster.</p>
        </div>
        <select className="input select" style={{ maxWidth: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="ALL">All</option>
        </select>
      </div>

      {message && <div className="card p-3 mb-4" style={{ borderLeft: '4px solid var(--saffron)' }}>{message}</div>}
      {(requestsQuery.isLoading || classesQuery.isLoading) && <div className="card p-6">Loading enrollment requests…</div>}
      {requestsQuery.isError && <div className="card p-6" style={{ color: '#C62828' }}>{apiErrorText(requestsQuery.error)}</div>}

      <div className="space-y-4">
        {requests.map((request) => {
          const eligibleClasses = byGrade[request.requested_grade] || classes;
          const targetClass = selectedClass[request.id] || request.requested_class_id || eligibleClasses[0]?.id || '';
          return (
            <div className="card p-5" key={request.id}>
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap"><h2 className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>{request.name}</h2><span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: request.status === 'APPROVED' ? '#E8F5E9' : request.status === 'REJECTED' ? '#FFEBEE' : '#FFF8E1', color: request.status === 'APPROVED' ? '#138808' : request.status === 'REJECTED' ? '#C62828' : '#7A5A00' }}>{request.status}</span></div>
                  <div className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Student ID <b>{request.student_code}</b> · @{request.username}</div>
                  <div className="text-sm" style={{ color: 'var(--slate)' }}>{request.mobile}{request.email ? ` · ${request.email}` : ''}</div>
                  <div className="text-sm mt-2">Requested: <b>Class {request.requested_grade}</b>{request.class_name ? ` · ${request.class_name}-${request.section}` : ''}</div>
                  <div className="text-xs mt-2" style={{ color: 'var(--slate)' }}>{request.parent_linked ? '✅ Parent account connected' : request.parent_link_pending ? '⏳ Parent link pending claim' : 'No Parent account linked'}</div>
                  {request.student_note && <div className="text-sm mt-3 p-3 rounded-lg" style={{ background: '#F7F8FA' }}>{request.student_note}</div>}
                  <div className="text-xs mt-2" style={{ color: 'var(--slate)' }}>Requested {new Date(request.requested_at).toLocaleString('en-IN')}</div>
                </div>

                {request.status === 'PENDING' && (
                  <div className="w-full lg:w-[320px] p-4 rounded-xl" style={{ background: '#F7F8FA' }}>
                    <label className="block text-xs font-bold mb-1">Approve into class / section</label>
                    <select className="input select mb-3" value={targetClass} onChange={(e) => setSelectedClass((value) => ({ ...value, [request.id]: e.target.value }))}>{eligibleClasses.map((row) => <option value={row.id} key={row.id}>Class {row.class_name}-{row.section} · {row.academic_year}</option>)}</select>
                    <label className="block text-xs font-bold mb-1">Roll Number <span style={{ color: 'var(--slate)', fontWeight: 400 }}>(optional)</span></label>
                    <input className="input mb-3" value={rollNumber[request.id] || ''} onChange={(e) => setRollNumber((value) => ({ ...value, [request.id]: e.target.value }))} placeholder="e.g. 8A27" />
                    <div className="grid grid-cols-2 gap-2">
                      <button className="btn-primary justify-center" disabled={review.isPending || !targetClass} onClick={() => { setSelectedClass((value) => ({ ...value, [request.id]: targetClass })); review.mutate({ requestId: request.id, action: 'APPROVE' }); }}>Approve</button>
                      <button className="btn-ghost justify-center" disabled={review.isPending} onClick={() => review.mutate({ requestId: request.id, action: 'REJECT' })} style={{ color: '#C62828' }}>Reject</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!requestsQuery.isLoading && !requests.length && <div className="card p-8 text-center" style={{ color: 'var(--slate)' }}>No {status.toLowerCase()} Student enrollment requests.</div>}
    </div>
  );
}
