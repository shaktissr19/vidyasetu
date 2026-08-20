'use client';
import { useState } from 'react';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { exportUsers, getAnalytics, listUsers, updateUserStatus } from '@/services/adminService';
import { SectionHeader, StatusBadge, TableSkeleton } from '@/components/ui/index';
import { formatDate } from '@/utils/formatters';
import toast from 'react-hot-toast';

const ROLE_COLORS: Record<string, string> = {
  STUDENT: 'badge-blue',
  SCHOOL_ADMIN: 'badge-orange',
  TEACHER: 'badge-gold',
  PARENT: 'badge-green',
  SUPER_ADMIN: 'badge-red',
};

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', search, role, status, page],
    queryFn: () => listUsers({ search, role, status, page, limit: 25 }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const { data: analytics } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => getAnalytics().then((r) => r.data.data),
  });

  const users = data?.data || [];
  const meta = data?.meta;
  const roleCounts = Object.fromEntries((analytics?.roleBreakdown || []).map((row) => [row.role, Number(row.count || 0)]));

  const statusMut = useMutation({
    mutationFn: ({ id, status: nextStatus }: { id: string; status: string }) => updateUserStatus(id, nextStatus),
    onSuccess: () => { toast.success('User updated!'); qc.invalidateQueries({ queryKey: ['admin-users'] }); qc.invalidateQueries({ queryKey: ['admin-analytics'] }); },
    onError: () => toast.error('Failed to update user'),
  });

  async function downloadCsv() {
    try {
      setExporting(true);
      const rows = await exportUsers({ search, role, status }).then((r) => r.data.data);
      const header = ['ID','Name','Mobile','Email','Role','Status','Language','Last Login','Created At'];
      const lines = rows.map((user) => [user.id, user.name, user.mobile, user.email, user.role, user.status, user.language, user.last_login_at, user.created_at].map(csvCell).join(','));
      const blob = new Blob([[header.map(csvCell).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `vidyasetu-users-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} users`);
    } catch {
      toast.error('User export failed');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <SectionHeader title="👥 User Management" sub={`${meta?.total || 0} matching users`}>
        <button className="btn-primary" onClick={downloadCsv} disabled={exporting}>{exporting ? 'Exporting…' : '📥 Export Users'}</button>
      </SectionHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          ['🎓','Students',roleCounts.STUDENT || 0],
          ['👨‍👩‍👧','Parents',roleCounts.PARENT || 0],
          ['👩‍🏫','Teachers',roleCounts.TEACHER || 0],
          ['🏫','School Admins',roleCounts.SCHOOL_ADMIN || 0],
        ].map(([icon, label, count]) => (
          <div key={String(label)} className="card-navy py-4 text-center">
            <div className="text-xl">{icon}</div><div className="font-display font-extrabold text-xl text-white mt-1">{Number(count).toLocaleString('en-IN')}</div>
            <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</div>
          </div>
        ))}
      </div>

      <div className="card-navy mb-5">
        <div className="flex flex-wrap gap-3">
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="🔍 Search by name, mobile or email..."
            className="input flex-1 min-w-[180px]"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
          <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}
            className="input select" style={{ background: '#111a32', border: '1px solid rgba(255,255,255,0.1)', color: 'white', width: 'auto' }}>
            <option value="">All Roles</option>
            <option value="STUDENT">Student</option>
            <option value="TEACHER">Teacher</option>
            <option value="SCHOOL_ADMIN">School Admin</option>
            <option value="PARENT">Parent</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="input select" style={{ background: '#111a32', border: '1px solid rgba(255,255,255,0.1)', color: 'white', width: 'auto' }}>
            <option value="">All Status</option><option value="ACTIVE">Active</option><option value="PENDING">Pending</option><option value="SUSPENDED">Suspended</option>
          </select>
        </div>
      </div>

      <div className="card-navy">
        {isLoading ? <TableSkeleton rows={10} cols={6} /> : users.length === 0 ? (
          <div className="py-12 text-center"><div className="text-4xl mb-3">👥</div><p className="font-display font-bold text-white">No users found</p></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="tbl" style={{ color: 'rgba(255,255,255,0.7)' }}>
                <thead><tr>{['Name','Mobile / Email','Role','Status','Last Login','Actions'].map((header) => <th key={header} style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }}>{header}</th>)}</tr></thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <td className="font-semibold text-white">{user.name || '—'}</td>
                      <td><div className="font-mono text-sm">{user.mobile || '—'}</div>{user.email && <div className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{user.email}</div>}</td>
                      <td><span className={`badge ${ROLE_COLORS[user.role] || 'badge-blue'}`}>{String(user.role).replaceAll('_', ' ')}</span></td>
                      <td><StatusBadge status={user.status} /></td>
                      <td className="text-sm">{user.last_login_at ? formatDate(user.last_login_at) : '—'}</td>
                      <td>
                        {user.role === 'SUPER_ADMIN' ? <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Protected</span> : user.status === 'ACTIVE' ? (
                          <button className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(194,40,40,0.2)', color: '#EF9A9A' }} onClick={() => statusMut.mutate({ id: user.id, status: 'SUSPENDED' })}>Suspend</button>
                        ) : (
                          <button className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(19,136,8,0.2)', color: '#A5D6A7' }} onClick={() => statusMut.mutate({ id: user.id, status: 'ACTIVE' })}>Activate</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(meta?.totalPages || 0) > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Page {meta?.page} of {meta?.totalPages}</p>
                <div className="flex gap-2">
                  <button className="text-xs px-3 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }} disabled={!meta?.hasPrev} onClick={() => setPage((p) => p - 1)}>‹ Prev</button>
                  <button className="text-xs px-3 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }} disabled={!meta?.hasNext} onClick={() => setPage((p) => p + 1)}>Next ›</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
