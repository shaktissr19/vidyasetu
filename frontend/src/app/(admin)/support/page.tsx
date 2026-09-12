'use client';
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTickets, updateTicket, type AdminSupportTicket } from '@/services/adminService';
import { SectionHeader, StatusBadge, TableSkeleton, EmptyState } from '@/components/ui/index';
import { formatDate, timeAgo } from '@/utils/formatters';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

const PRIORITY_COLOR: Record<string, string> = { LOW: 'badge-blue', MEDIUM: 'badge-orange', HIGH: 'badge-red', CRITICAL: 'badge-red' };
const STATUSES = ['', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

export default function AdminSupportPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('OPEN');
  const [priority, setPriority] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminSupportTicket | null>(null);
  const [resolution, setResolution] = useState('');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['support-tickets', status, priority, search, page],
    queryFn: () => getTickets({ status: status || undefined, priority: priority || undefined, search: search || undefined, page, limit: 20 }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const tickets = data?.data || [];
  const meta = data?.meta;

  const updateMut = useMutation({
    mutationFn: ({ id, nextStatus, note }: { id: string; nextStatus: string; note?: string }) =>
      updateTicket(id, { status: nextStatus, ...(note !== undefined ? { resolution: note } : {}) }),
    onSuccess: async (response, variables) => {
      setSelected(response.data.data);
      if (variables.nextStatus === 'RESOLVED') toast.success('Ticket resolved ✅');
      else if (variables.nextStatus === 'IN_PROGRESS') toast.success('Ticket moved to in progress');
      else if (variables.nextStatus === 'CLOSED') toast.success('Ticket closed');
      else toast.success('Ticket updated');
      await qc.invalidateQueries({ queryKey: ['support-tickets'] });
    },
    onError: (err: unknown) => toast.error(apiErrorText(err, 'Failed to update ticket')),
  });

  const selectTicket = (ticket: AdminSupportTicket) => {
    setSelected(ticket);
    setResolution(ticket.resolution || '');
  };

  const changeStatus = (nextStatus: string) => {
    if (!selected) return;
    const note = nextStatus === 'RESOLVED' ? resolution.trim() : undefined;
    if (nextStatus === 'RESOLVED' && !note) {
      toast.error('Add a resolution note before resolving the ticket');
      return;
    }
    updateMut.mutate({ id: selected.id, nextStatus, note });
  };

  return (
    <div className="animate-fade-up">
      <SectionHeader title="🎧 Support Operations" sub={`${meta?.total || 0} matching tickets · governed lifecycle with audit history`} />

      <div className="card-navy mb-5">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="🔍 Search subject, school, requester..."
            className="input flex-1 min-w-[220px]"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
          />
          <select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} className="input select"
            style={{ background: '#111a32', border: '1px solid rgba(255,255,255,0.1)', color: 'white', width: 'auto' }}>
            <option value="">All priorities</option><option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
          </select>
        </div>
        <div className="flex gap-2 mt-4 flex-wrap">
          {STATUSES.map((item) => (
            <button key={item || 'ALL'} onClick={() => { setStatus(item); setPage(1); setSelected(null); }}
              className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
              style={{ background: status === item ? 'rgba(255,107,0,0.22)' : 'rgba(255,255,255,0.06)', color: status === item ? 'var(--saffron-light)' : 'rgba(255,255,255,0.5)', border: 'none' }}>
              {item ? item.replaceAll('_', ' ') : 'ALL'}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid gap-4 ${selected ? 'lg:grid-cols-[1fr_390px]' : 'grid-cols-1'}`}>
        <div className="card-navy" style={{ padding: 0, overflow: 'hidden' }}>
          {isLoading ? <TableSkeleton rows={8} cols={4} /> : isError ? (
            <div className="p-6" style={{ color: '#EF9A9A' }}>{apiErrorText(error, 'Could not load support tickets')}</div>
          ) : tickets.length === 0 ? <EmptyState icon="🎉" title="No tickets" sub="No tickets match the current filters" /> : (
            tickets.map((ticket) => (
              <button key={ticket.id} onClick={() => selectTicket(ticket)}
                className="w-full text-left"
                style={{ padding: '14px 18px', border: 0, borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', background: selected?.id === ticket.id ? 'rgba(255,107,0,0.08)' : 'transparent' }}>
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex gap-2 items-center mb-1 flex-wrap">
                      <span className={`badge ${PRIORITY_COLOR[ticket.priority] || 'badge-blue'}`}>{ticket.priority}</span>
                      {ticket.category && <span className="badge badge-blue">{ticket.category}</span>}
                      {ticket.assigned_to_name && <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>Owner: {ticket.assigned_to_name}</span>}
                    </div>
                    <p className="text-sm font-bold text-white truncate">{ticket.subject}</p>
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{ticket.school_name || 'Platform'} · {ticket.raised_by_name || 'User'} · {timeAgo(ticket.created_at)}</p>
                  </div>
                  <StatusBadge status={ticket.status} />
                </div>
              </button>
            ))
          )}
          {(meta?.totalPages || 0) > 1 && (
            <div className="flex items-center justify-between p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Page {meta?.page} of {meta?.totalPages}</span>
              <div className="flex gap-2">
                <button className="btn-ghost text-xs" disabled={!meta?.hasPrev} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Prev</button>
                <button className="btn-ghost text-xs" disabled={!meta?.hasNext} onClick={() => setPage((p) => p + 1)}>Next ›</button>
              </div>
            </div>
          )}
        </div>

        {selected && (
          <aside className="card-navy animate-fade-in h-fit lg:sticky lg:top-20">
            <div className="flex justify-between gap-3 mb-4">
              <div><div className="flex gap-2 items-center mb-2"><span className={`badge ${PRIORITY_COLOR[selected.priority] || 'badge-blue'}`}>{selected.priority}</span><StatusBadge status={selected.status} /></div><h3 className="font-display font-bold text-white">{selected.subject}</h3></div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 0, color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            <div className="space-y-3 text-sm">
              <div><div className="text-[11px] font-bold" style={{ color: 'rgba(255,255,255,0.35)' }}>DESCRIPTION</div><p className="mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.72)' }}>{selected.description || '—'}</p></div>
              <div className="grid grid-cols-2 gap-3">
                <div><div className="text-[11px] font-bold" style={{ color: 'rgba(255,255,255,0.35)' }}>RAISED BY</div><div className="text-white mt-1">{selected.raised_by_name || '—'}</div></div>
                <div><div className="text-[11px] font-bold" style={{ color: 'rgba(255,255,255,0.35)' }}>CREATED</div><div className="text-white mt-1">{formatDate(selected.created_at)}</div></div>
                <div><div className="text-[11px] font-bold" style={{ color: 'rgba(255,255,255,0.35)' }}>SCHOOL</div><div className="text-white mt-1">{selected.school_name || 'Platform'}</div></div>
                <div><div className="text-[11px] font-bold" style={{ color: 'rgba(255,255,255,0.35)' }}>ASSIGNED</div><div className="text-white mt-1">{selected.assigned_to_name || 'Unassigned'}</div></div>
              </div>

              {(selected.status === 'OPEN' || selected.status === 'IN_PROGRESS') && (
                <div className="pt-2">
                  <label className="text-[11px] font-bold block mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>RESOLUTION NOTE</label>
                  <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Document the diagnosis and resolution..." rows={4}
                    className="w-full rounded-lg p-2.5 text-sm" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', resize: 'vertical' }} />
                </div>
              )}

              {selected.resolution && (
                <div className="p-3 rounded-xl" style={{ background: 'rgba(19,136,8,0.1)', border: '1px solid rgba(19,136,8,0.2)' }}>
                  <div className="text-[11px] font-bold" style={{ color: '#A5D6A7' }}>RECORDED RESOLUTION</div><p className="mt-1" style={{ color: 'rgba(255,255,255,0.72)' }}>{selected.resolution}</p>
                </div>
              )}

              <div className="flex gap-2 flex-wrap pt-2">
                {selected.status === 'OPEN' && <button className="btn-primary" disabled={updateMut.isPending} onClick={() => changeStatus('IN_PROGRESS')}>Start Work</button>}
                {(selected.status === 'OPEN' || selected.status === 'IN_PROGRESS') && <button className="btn-green" disabled={updateMut.isPending || !resolution.trim()} onClick={() => changeStatus('RESOLVED')}>Resolve</button>}
                {selected.status === 'RESOLVED' && <button className="btn-primary" disabled={updateMut.isPending} onClick={() => changeStatus('CLOSED')}>Close Ticket</button>}
                {(selected.status === 'RESOLVED' || selected.status === 'CLOSED') && <button className="btn-ghost" disabled={updateMut.isPending} onClick={() => changeStatus('IN_PROGRESS')}>Reopen</button>}
              </div>
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.32)' }}>Every lifecycle transition is recorded in the platform Audit Trail.</p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
