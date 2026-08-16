'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listUsers, updateUserStatus } from '@/services/adminService';
import { SectionHeader, StatusBadge, TableSkeleton } from '@/components/ui/index';
import { formatDate } from '@/utils/formatters';
import toast from 'react-hot-toast';

const ROLE_COLORS = {
  STUDENT:     'badge-blue',
  SCHOOL_ADMIN:'badge-orange',
  PARENT:      'badge-green',
  SUPER_ADMIN: 'badge-gold',
};

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [role,   setRole]   = useState('');
  const [page,   setPage]   = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', search, role, page],
    queryFn:  () => listUsers({ search, role, page, limit: 25 }).then(r => r.data),
    keepPreviousData: true,
  });

  const users = data?.data || [];
  const meta  = data?.meta || {};

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => updateUserStatus(id, status),
    onSuccess:  () => { toast.success('User updated!'); qc.invalidateQueries(['admin-users']); },
    onError:    () => toast.error('Failed to update user'),
  });

  return (
    <div className="animate-fade-up">
      <SectionHeader title="👥 User Management" sub={`${meta.total || 0} total users`} />

      <div className="card-navy mb-5">
        <div className="flex flex-wrap gap-3">
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="🔍 Search by name or mobile..."
            className="input flex-1 min-w-[180px]"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
          <select value={role} onChange={e => { setRole(e.target.value); setPage(1); }}
            className="input select" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', width: 'auto' }}>
            <option value="">All Roles</option>
            <option value="STUDENT">Student</option>
            <option value="SCHOOL_ADMIN">School Admin</option>
            <option value="PARENT">Parent</option>
          </select>
        </div>
      </div>

      <div className="card-navy">
        {isLoading ? <TableSkeleton rows={10} cols={5} /> : (
          <>
            <div className="overflow-x-auto">
              <table className="tbl" style={{ color: 'rgba(255,255,255,0.7)' }}>
                <thead>
                  <tr>
                    {['Name','Mobile','Role','Status','Last Login','Actions'].map(h => (
                      <th key={h} style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <td className="font-semibold text-white">{u.name}</td>
                      <td className="font-mono text-sm">{u.mobile}</td>
                      <td><span className={`badge ${ROLE_COLORS[u.role] || 'badge-blue'}`}>{u.role.replace('_',' ')}</span></td>
                      <td><StatusBadge status={u.status} /></td>
                      <td className="text-sm">{u.last_login_at ? formatDate(u.last_login_at) : '—'}</td>
                      <td>
                        {u.status === 'ACTIVE' ? (
                          <button className="text-xs font-bold px-2 py-1 rounded-lg"
                            style={{ background: 'rgba(194,40,40,0.2)', color: '#EF9A9A' }}
                            onClick={() => statusMut.mutate({ id: u.id, status: 'SUSPENDED' })}>
                            Suspend
                          </button>
                        ) : (
                          <button className="text-xs font-bold px-2 py-1 rounded-lg"
                            style={{ background: 'rgba(19,136,8,0.2)', color: '#A5D6A7' }}
                            onClick={() => statusMut.mutate({ id: u.id, status: 'ACTIVE' })}>
                            Activate
                          </button>
                        )}
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
