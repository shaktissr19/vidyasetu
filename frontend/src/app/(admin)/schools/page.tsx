'use client';
import { useEffect, useRef, useState } from 'react';
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
  const detailDialogRef = useRef<HTMLDivElement>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);

  function closeSchoolDetails() {
    setSelectedSchoolId(null);
    window.requestAnimationFrame(() => detailTriggerRef.current?.focus());
  }

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

  useEffect(() => {
    if (!selectedSchoolId) return;
    detailDialogRef.current?.focus();
    const focusable = () => Array.from(detailDialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || []);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { closeSchoolDetails(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [selectedSchoolId]);

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
                      <td><p className="font-semibold">{school.name}</p><p className="text-xs admin-muted">{school.district || 'District not provided'}</p></td>
                      <td>{school.state}</td><td className="font-bold text-white">{school.student_count || 0}</td><td>{formatDate(school.created_at)}</td>
                      <td><span className={`badge ${PLAN_COLORS[school.plan || ''] || 'badge-blue'}`}>{school.plan || 'FREE'}</span></td>
                      <td><StatusBadge status={school.status} /></td>
                      <td><div className="flex gap-2">
                        <button className="admin-action-view text-xs" onClick={(event) => { detailTriggerRef.current = event.currentTarget; setSelectedSchoolId(school.id); }}>View</button>
                        {school.status === 'PENDING' && <button className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(19,136,8,0.2)', color: '#A5D6A7' }} onClick={() => statusMut.mutate({ id: school.id, status: 'ACTIVE' })}>Approve</button>}
                        {school.status === 'ACTIVE' && <button className="admin-action-suspend text-xs" onClick={() => statusMut.mutate({ id: school.id, status: 'SUSPENDED' })}>Suspend</button>}
                        {school.status === 'SUSPENDED' && <button className="admin-action-activate text-xs" onClick={() => statusMut.mutate({ id: school.id, status: 'ACTIVE' })}>Reactivate</button>}
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
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4" style={{ background: 'rgba(3,8,22,0.78)' }} onMouseDown={(e) => e.currentTarget === e.target && closeSchoolDetails()}>
          <div ref={detailDialogRef} tabIndex={-1} className="admin-detail-surface w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="school-detail-title">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div><h2 id="school-detail-title" className="font-display font-extrabold text-xl">🏫 {selectedSchool?.name || 'School Details'}</h2>{selectedSchool?.udise_code && <p className="text-xs mt-1">UDISE: {selectedSchool.udise_code}</p>}</div>
              <button aria-label="Close school details" onClick={closeSchoolDetails} className="admin-dialog-close text-xl" style={{ background: 'none', border: 0, cursor: 'pointer' }}>✕</button>
            </div>
            {detailLoading ? <div className="skeleton h-52 rounded-xl" /> : null}
            {!detailLoading && !selectedSchool && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">School details could not be loaded. <button className="ml-2 font-bold underline" onClick={() => qc.invalidateQueries({ queryKey: ['admin-school-detail', selectedSchoolId] })}>Retry</button></div>}
            {!detailLoading && selectedSchool && <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                {[
                  ['Students', selectedSchool.student_count || 0], ['Teachers', selectedSchool.teacher_count || 0], ['Classes', selectedSchool.class_count || 0],
                  ['State', selectedSchool.state || '—'], ['Plan', selectedSchool.plan || 'FREE'], ['Status', selectedSchool.status],
                  ['Since', selectedSchool.created_at ? formatDate(selectedSchool.created_at) : 'Not available'], ['Verified', selectedSchool.is_verified ? (selectedSchool.verified_at ? formatDate(selectedSchool.verified_at) : 'Yes') : 'Not verified'],
                ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-xs text-slate-600">{label}</div><div className="font-bold mt-1">{value}</div></div>)}
              </div>
              <div className="grid md:grid-cols-2 gap-4 mb-5 text-sm">
                <div><div className="text-xs mb-1 text-slate-600">SCHOOL ADMIN</div><div className="font-semibold">{selectedSchool.admin_name || '—'}</div><div className="text-slate-600">{selectedSchool.admin_mobile || ''}{selectedSchool.admin_email ? ` · ${selectedSchool.admin_email}` : ''}</div></div>
                <div><div className="text-xs mb-1 text-slate-600">LOCATION</div><div>{[selectedSchool.address_line1, selectedSchool.district, selectedSchool.state].filter(Boolean).join(', ') || '—'}</div><div className="text-slate-600">{selectedSchool.pincode || ''}</div></div>
              </div>
              <div className="flex gap-2 mb-5">
                {selectedSchool.status !== 'ACTIVE' && <button className="btn-green" onClick={() => statusMut.mutate({ id: selectedSchool.id, status: 'ACTIVE' })}>Approve / Reactivate</button>}
                {selectedSchool.status === 'ACTIVE' && <button className="admin-action-suspend text-xs" onClick={() => statusMut.mutate({ id: selectedSchool.id, status: 'SUSPENDED' })}>Suspend</button>}
              </div>
              <h3 className="font-display font-bold mb-3">Recent Admin Activity</h3>
              {(selectedSchool.recentActivity || []).length === 0 ? <p className="text-sm text-slate-600">No school-level admin activity recorded yet.</p> : (selectedSchool.recentActivity || []).map((activity, index) => <div key={`${activity.action}-${index}`} className="flex justify-between gap-3 border-b border-slate-200 py-2 text-xs"><span>{activity.action.replaceAll('_', ' ')}</span><span className="text-slate-600">{formatDate(activity.created_at)}</span></div>)}
            </>}
          </div>
        </div>
      )}
    </div>
  );
}
