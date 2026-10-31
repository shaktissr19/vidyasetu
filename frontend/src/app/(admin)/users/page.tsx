'use client';
import { useEffect, useRef, useState } from 'react';
import CreatePlatformAdmin from '@/components/admin/CreatePlatformAdmin';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { exportUsers, getAnalytics, listUsers, updateUserStatus } from '@/services/adminService';
import { SectionHeader, StatusBadge, TableSkeleton } from '@/components/ui/index';
import { formatDate } from '@/utils/formatters';
import toast from 'react-hot-toast';
import useAuthStore from '@/store/authStore';
import { listPlatformAdmins, PLATFORM_ADMIN_CAPABILITIES, PLATFORM_ADMIN_CAPABILITY_LABELS, updatePlatformAdminPermissions, type PlatformAdminCapability } from '@/services/platformAdminService';

const ROLE_COLORS: Record<string, string> = {
  STUDENT: 'badge-blue',
  SCHOOL_ADMIN: 'badge-orange',
  TEACHER: 'badge-gold',
  PARENT: 'badge-green',
  SUPER_ADMIN: 'badge-red',
  PLATFORM_ADMIN: 'badge-red',
};

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export default function AdminUsersPage() {
  const currentUser = useAuthStore((state) => state.user);
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [accessTarget, setAccessTarget] = useState<{ id: string; name: string } | null>(null);
  const [accessDraft, setAccessDraft] = useState<PlatformAdminCapability[]>([]);
  const accessDialogRef = useRef<HTMLElement>(null);
  const accessTriggerRef = useRef<HTMLButtonElement | null>(null);

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
  const platformAdminAccessQuery = useQuery({
    queryKey: ['platform-admin-access'],
    queryFn: () => listPlatformAdmins().then((response) => response.data.data),
    enabled: isSuperAdmin,
    staleTime: 15_000,
    retry: 1,
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status: nextStatus }: { id: string; status: string }) => updateUserStatus(id, nextStatus),
    onSuccess: () => { toast.success('User updated!'); qc.invalidateQueries({ queryKey: ['admin-users'] }); qc.invalidateQueries({ queryKey: ['admin-analytics'] }); },
    onError: () => toast.error('Failed to update user'),
  });
  const permissionsMut = useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: PlatformAdminCapability[] }) => updatePlatformAdminPermissions(id, permissions),
    onSuccess: async () => { toast.success('Platform Admin access updated.'); closeAccessEditor(); await Promise.all([qc.invalidateQueries({ queryKey: ['platform-admin-access'] }), qc.invalidateQueries({ queryKey: ['my-admin-permissions'] })]); },
    onError: () => toast.error('Could not update Platform Admin access'),
  });

  function openAccessEditor(userId: string, name: string, trigger: HTMLButtonElement) {
    const account = platformAdminAccessQuery.data?.find((item) => item.id === userId);
    if (!account) return;
    accessTriggerRef.current = trigger;
    setAccessTarget({ id: userId, name });
    setAccessDraft(account.permissions || []);
  }

  function closeAccessEditor() {
    setAccessTarget(null);
    window.requestAnimationFrame(() => accessTriggerRef.current?.focus());
  }

  useEffect(() => {
    const dialog = accessDialogRef.current;
    if (!accessTarget || !dialog) return;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    focusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeAccessEditor(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [accessTarget]);

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

      {isSuperAdmin && <CreatePlatformAdmin />}

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
            {isSuperAdmin && <option value="PLATFORM_ADMIN">Platform Admin</option>}
            {isSuperAdmin && <option value="SUPER_ADMIN">Super Admin</option>}
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
                        {user.role === 'SUPER_ADMIN' || (user.role === 'PLATFORM_ADMIN' && !isSuperAdmin) ? <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Protected</span> : <div className="flex flex-wrap gap-2">
                          {user.role === 'PLATFORM_ADMIN' && isSuperAdmin && <button className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(255,138,61,0.2)', color: '#FFC08E' }} disabled={platformAdminAccessQuery.isLoading} onClick={(event) => openAccessEditor(user.id, user.name || 'Platform Admin', event.currentTarget)}>Manage access</button>}
                          {user.status === 'ACTIVE' ? <button className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(194,40,40,0.2)', color: '#EF9A9A' }} onClick={() => statusMut.mutate({ id: user.id, status: 'SUSPENDED' })}>Suspend</button> : <button className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(19,136,8,0.2)', color: '#A5D6A7' }} onClick={() => statusMut.mutate({ id: user.id, status: 'ACTIVE' })}>Activate</button>}
                        </div>}
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
      {accessTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAccessEditor(); }}><section ref={accessDialogRef} role="dialog" aria-modal="true" aria-labelledby="platform-admin-access-title" className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-slate-300 bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black tracking-wider text-orange-700">SUPER ADMIN CONTROL</p><h2 id="platform-admin-access-title" className="mt-1 text-xl font-extrabold text-slate-900">Manage access · {accessTarget.name}</h2><p className="mt-2 text-sm leading-5 text-slate-600">Analytics remains the baseline dashboard. Changes apply on the administrator’s next API request. Owner-only features remain unavailable.</p></div><button type="button" className="min-h-10 min-w-10 rounded-lg border border-slate-300 font-bold text-slate-700" aria-label="Close access editor" onClick={closeAccessEditor}>×</button></div><fieldset className="mt-4 grid gap-2 sm:grid-cols-2"><legend className="sr-only">Allowed operational areas</legend>{PLATFORM_ADMIN_CAPABILITIES.map((permission) => { const info = PLATFORM_ADMIN_CAPABILITY_LABELS[permission]; const checked = accessDraft.includes(permission); return <label key={permission} className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800"><input type="checkbox" checked={checked} onChange={() => setAccessDraft(checked ? accessDraft.filter((item) => item !== permission) : [...accessDraft, permission])} /><span><strong>{info.title}</strong><small className="mt-0.5 block leading-5 text-slate-600">{info.description}</small></span></label>; })}</fieldset><p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">An administrator with no operational areas can still sign in and view basic analytics. Revenue, configuration, audit records, administrator management, public publishing and protected learning governance stay Super Admin-only.</p><div className="mt-4 flex justify-end gap-2"><button type="button" className="min-h-11 rounded-lg border border-slate-300 px-4 font-bold text-slate-800" onClick={closeAccessEditor}>Cancel</button><button type="button" className="min-h-11 rounded-lg bg-[#14213D] px-4 font-bold text-white disabled:opacity-50" disabled={permissionsMut.isPending} onClick={() => permissionsMut.mutate({ id: accessTarget.id, permissions: accessDraft })}>{permissionsMut.isPending ? 'Saving…' : 'Save access'}</button></div></section></div>}
    </div>
  );
}
