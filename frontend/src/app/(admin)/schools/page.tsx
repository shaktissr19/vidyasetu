'use client';
import { useState } from 'react';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSchool, listSchools, updateSchoolStatus } from '@/services/adminService';
import { SectionHeader, StatusBadge, TableSkeleton } from '@/components/ui/index';
import { formatDate } from '@/utils/formatters';
import toast from 'react-hot-toast';

const PLAN_COLORS: Record<string, string> = { FREE: 'badge-blue', PRO: 'badge-orange', PREMIUM: 'badge-gold', CSR_FUNDED: 'badge-green' };

export default function AdminSchoolsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-schools', search, status, page],
    queryFn: () => listSchools({ search, status, page, limit: 20 }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const { data: selectedSchool, isLoading: detailLoading } = useQuery({
    queryKey: ['admin-school-detail', selectedSchoolId],
    queryFn: async () => {
      if (!selectedSchoolId) throw new Error('No school selected');
      return getSchool(selectedSchoolId).then((r) => r.data.data);
    },
    enabled: Boolean(selectedSchoolId),
  });

  const schools = data?.data || [];
  const meta = data?.meta;

  const statusMut = useMutation({
    mutationFn: ({ id, status: nextStatus }: { id: string; status: string }) => updateSchoolStatus(id, nextStatus),
    onSuccess: (_, { status: nextStatus }) => {
      toast.success(`School ${nextStatus.toLowerCase()}!`);
      qc.invalidateQueries({ queryKey: ['admin-schools'] });
      qc.invalidateQueries({ queryKey: ['admin-school-detail'] });
      qc.invalidateQueries({ queryKey: ['admin-analytics'] });
    },
    onError: () => toast.error('Failed to update school status'),
  });

  return (
    <div className="animate-fade-up">
      <SectionHeader title="🏫 All Schools" sub={`${meta?.total || 0} total schools`} />

      <div className="card-navy mb-5">
        <div className="flex flex-wrap gap-3">
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="🔍 Search by name / UDISE..." className="input flex-1 min-w-[200px]"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="input select"
            style={{ background: '#111a32', border: '1px solid rgba(255,255,255,0.1)', color: 'white', width: 'auto' }}>
            <option value="">All Status</option><option value="ACTIVE">Active</option><option value="PENDING">Pending</option><option value="SUSPENDED">Suspended</option>
          </select>
        </div>
      </div>

      <div className="card-navy">
        {isLoading ? <TableSkeleton rows={8} cols={7} /> : schools.length === 0 ? (
          <div className="py-12 text-center"><div className="text-4xl mb-3">🏫</div><p className="font-display font-bold text-white">No schools found</p></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="tbl" style={{ color: 'rgba(255,255,255,0.7)' }}>
                <thead><tr>{['School','State','Students','Since','Plan','Status','Actions'].map((header) => <th key={header} style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }}>{header}</th>)}</tr></thead>
                <tbody>
                  {schools.map((school) => (
                    <tr key={school.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <td><p className="font-semibold text-white">{school.name}</p><p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{school.district}</p></td>
                      <td>{school.state}</td><td className="font-bold text-white">{school.student_count || 0}</td><td>{formatDate(school.created_at)}</td>
                      <td><span className={`badge ${PLAN_COLORS[school.plan || ''] || 'badge-blue'}`}>{school.plan || 'FREE'}</span></td>
                      <td><StatusBadge status={school.status} /></td>
                      <td><div className="flex gap-2">
                        <button className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(79,195,247,0.15)', color: '#81D4FA' }} onClick={() => setSelectedSchoolId(school.id)}>View</button>
                        {school.status === 'PENDING' && <button className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(19,136,8,0.2)', color: '#A5D6A7' }} onClick={() => statusMut.mutate({ id: school.id, status: 'ACTIVE' })}>Approve</button>}
                        {school.status === 'ACTIVE' && <button className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(194,40,40,0.2)', color: '#EF9A9A' }} onClick={() => statusMut.mutate({ id: school.id, status: 'SUSPENDED' })}>Suspend</button>}
                        {school.status === 'SUSPENDED' && <button className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(19,136,8,0.2)', color: '#A5D6A7' }} onClick={() => statusMut.mutate({ id: school.id, status: 'ACTIVE' })}>Reactivate</button>}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(meta?.totalPages || 0) > 1 && <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Page {meta?.page} of {meta?.totalPages}</p>
              <div className="flex gap-2"><button className="text-xs px-3 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }} disabled={!meta?.hasPrev} onClick={() => setPage((p) => p - 1)}>‹ Prev</button><button className="text-xs px-3 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }} disabled={!meta?.hasNext} onClick={() => setPage((p) => p + 1)}>Next ›</button></div>
            </div>}
          </>
        )}
      </div>

      {selectedSchoolId && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4" style={{ background: 'rgba(3,8,22,0.78)' }} onMouseDown={(e) => e.currentTarget === e.target && setSelectedSchoolId(null)}>
          <div className="card-navy w-full max-w-2xl max-h-[85vh] overflow-y-auto" style={{ border: '1px solid rgba(79,195,247,0.3)' }}>
            <div className="flex items-start justify-between gap-3 mb-5">
              <div><h2 className="font-display font-extrabold text-xl text-white">🏫 {selectedSchool?.name || 'School Details'}</h2>{selectedSchool?.udise_code && <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>UDISE: {selectedSchool.udise_code}</p>}</div>
              <button onClick={() => setSelectedSchoolId(null)} className="text-xl" style={{ background: 'none', border: 0, color: 'rgba(255,255,255,0.55)', cursor: 'pointer' }}>✕</button>
            </div>
            {detailLoading ? <div className="skeleton h-52 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }} /> : selectedSchool && <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                {[
                  ['Students', selectedSchool.student_count || 0], ['Teachers', selectedSchool.teacher_count || 0], ['Classes', selectedSchool.class_count || 0],
                  ['State', selectedSchool.state || '—'], ['Plan', selectedSchool.plan || 'FREE'], ['Status', selectedSchool.status],
                ].map(([label, value]) => <div key={String(label)} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.05)' }}><div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</div><div className="font-bold text-white mt-1">{value}</div></div>)}
              </div>
              <div className="grid md:grid-cols-2 gap-4 mb-5 text-sm">
                <div><div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>SCHOOL ADMIN</div><div className="text-white font-semibold">{selectedSchool.admin_name || '—'}</div><div style={{ color: 'rgba(255,255,255,0.55)' }}>{selectedSchool.admin_mobile || ''}{selectedSchool.admin_email ? ` · ${selectedSchool.admin_email}` : ''}</div></div>
                <div><div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>LOCATION</div><div className="text-white">{[selectedSchool.district, selectedSchool.state].filter(Boolean).join(', ') || '—'}</div><div style={{ color: 'rgba(255,255,255,0.55)' }}>{selectedSchool.pincode || ''}</div></div>
              </div>
              <div className="flex gap-2 mb-5">
                {selectedSchool.status !== 'ACTIVE' && <button className="btn-green" onClick={() => statusMut.mutate({ id: selectedSchool.id, status: 'ACTIVE' })}>Approve / Reactivate</button>}
                {selectedSchool.status === 'ACTIVE' && <button className="text-xs font-bold px-4 py-2 rounded-lg" style={{ background: 'rgba(194,40,40,0.2)', color: '#EF9A9A', border: '1px solid rgba(194,40,40,0.25)' }} onClick={() => statusMut.mutate({ id: selectedSchool.id, status: 'SUSPENDED' })}>Suspend</button>}
              </div>
              <h3 className="font-display font-bold text-white mb-3">Recent Admin Activity</h3>
              {(selectedSchool.recentActivity || []).length === 0 ? <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No school-level admin activity recorded yet.</p> : (selectedSchool.recentActivity || []).map((activity, index) => <div key={`${activity.action}-${index}`} className="flex justify-between gap-3 py-2 text-xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}><span className="text-white">{activity.action.replaceAll('_', ' ')}</span><span style={{ color: 'rgba(255,255,255,0.4)' }}>{formatDate(activity.created_at)}</span></div>)}
            </>}
          </div>
        </div>
      )}
    </div>
  );
}
