'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listSchools, updateSchoolStatus } from '@/services/adminService';
import { SectionHeader, StatusBadge, TableSkeleton } from '@/components/ui/index';
import { formatDate } from '@/utils/formatters';
import toast from 'react-hot-toast';

const PLAN_COLORS = { FREE: 'badge-blue', PRO: 'badge-orange', PREMIUM: 'badge-gold', CSR_FUNDED: 'badge-green' };

export default function AdminSchoolsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page,   setPage]   = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-schools', search, status, page],
    queryFn:  () => listSchools({ search, status, page, limit: 20 }).then(r => r.data),
    keepPreviousData: true,
  });

  const schools = data?.data || [];
  const meta    = data?.meta || {};

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => updateSchoolStatus(id, status),
    onSuccess:  (_, { status }) => { toast.success(`School ${status.toLowerCase()}!`); qc.invalidateQueries(['admin-schools']); },
    onError:    () => toast.error('Failed to update school status'),
  });

  return (
    <div className="animate-fade-up">
      <SectionHeader title="🏫 All Schools" sub={`${meta.total || 0} total schools`}>
        <button className="btn-primary" onClick={() => toast('+ Onboarding a school manually')}>+ Onboard School</button>
      </SectionHeader>

      {/* Filters */}
      <div className="card-navy mb-5">
        <div className="flex flex-wrap gap-3">
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="🔍 Search by name / UDISE..."
            className="input flex-1 min-w-[200px]"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
            className="input select"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', width: 'auto' }}>
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING">Pending</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>
      </div>

      <div className="card-navy">
        {isLoading ? <TableSkeleton rows={8} cols={6} /> : schools.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-4xl mb-3">🏫</div>
            <p className="font-display font-bold text-white">No schools found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="tbl" style={{ color: 'rgba(255,255,255,0.7)' }}>
                <thead>
                  <tr>
                    <th style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }}>School</th>
                    <th style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }}>State</th>
                    <th style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }}>Students</th>
                    <th style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }}>Since</th>
                    <th style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }}>Plan</th>
                    <th style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }}>Status</th>
                    <th style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schools.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <td>
                        <p className="font-semibold text-white">{s.name}</p>
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{s.district}</p>
                      </td>
                      <td>{s.state}</td>
                      <td className="font-bold text-white">{s.student_count || 0}</td>
                      <td>{formatDate(s.created_at)}</td>
                      <td><span className={`badge ${PLAN_COLORS[s.plan] || 'badge-blue'}`}>{s.plan}</span></td>
                      <td><StatusBadge status={s.status} /></td>
                      <td>
                        <div className="flex gap-2">
                          {s.status === 'PENDING' && (
                            <button className="text-xs font-bold px-2 py-1 rounded-lg"
                              style={{ background: 'rgba(19,136,8,0.2)', color: '#A5D6A7' }}
                              onClick={() => statusMut.mutate({ id: s.id, status: 'ACTIVE' })}>
                              Approve
                            </button>
                          )}
                          {s.status === 'ACTIVE' && (
                            <button className="text-xs font-bold px-2 py-1 rounded-lg"
                              style={{ background: 'rgba(194,40,40,0.2)', color: '#EF9A9A' }}
                              onClick={() => statusMut.mutate({ id: s.id, status: 'SUSPENDED' })}>
                              Suspend
                            </button>
                          )}
                          {s.status === 'SUSPENDED' && (
                            <button className="text-xs font-bold px-2 py-1 rounded-lg"
                              style={{ background: 'rgba(19,136,8,0.2)', color: '#A5D6A7' }}
                              onClick={() => statusMut.mutate({ id: s.id, status: 'ACTIVE' })}>
                              Reactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {meta.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Page {meta.page} of {meta.totalPages}</p>
                <div className="flex gap-2">
                  <button className="text-xs px-3 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}
                    disabled={!meta.hasPrev} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
                  <button className="text-xs px-3 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}
                    disabled={!meta.hasNext} onClick={() => setPage(p => p + 1)}>Next ›</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
