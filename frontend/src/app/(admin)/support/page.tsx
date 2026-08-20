'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTickets, updateTicket } from '@/services/adminService';
import { SectionHeader, StatusBadge, TableSkeleton, EmptyState } from '@/components/ui/index';
import { formatDate, timeAgo } from '@/utils/formatters';
import type { SupportTicket } from '@/types/api';
import toast from 'react-hot-toast';

const PRIORITY_COLOR: Record<string, string> = { LOW: 'badge-blue', MEDIUM: 'badge-orange', HIGH: 'badge-red', CRITICAL: 'badge-red' };

export default function AdminSupportPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('OPEN');
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [resolution, setResolution] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['support-tickets', filter],
    queryFn: () => getTickets({ status: filter }).then((r) => r.data.data),
  });

  const tickets = data || [];

  const resolveMut = useMutation({
    mutationFn: ({ id, resolution: note }: { id: string; resolution: string }) => updateTicket(id, { status: 'RESOLVED', resolution: note }),
    onSuccess: () => {
      toast.success('Ticket resolved ✅');
      setSelected(null);
      qc.invalidateQueries({ queryKey: ['support-tickets'] });
    },
    onError: () => toast.error('Failed to update ticket'),
  });

  return (
    <div className="animate-fade-up">
      <SectionHeader title="🎧 Support Tickets" sub={`${tickets.length} ${filter.toLowerCase()} tickets`} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((status) => (
          <button key={status} onClick={() => setFilter(status)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700,
              border: 'none', cursor: 'pointer', transition: 'all 0.2s',
              background: filter === status ? 'rgba(255,107,0,0.2)' : 'rgba(255,255,255,0.06)',
              color: filter === status ? 'var(--saffron-light)' : 'rgba(255,255,255,0.5)',
            }}>{status.replace('_', ' ')}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: 16 }}>
        <div className="card-navy" style={{ padding: 0, overflow: 'hidden' }}>
          {isLoading ? <TableSkeleton rows={6} cols={4} /> :
           tickets.length === 0 ? <EmptyState icon="🎉" title="No tickets" sub={`No ${filter.toLowerCase()} tickets`} /> : (
            tickets.map((ticket) => (
              <div key={ticket.id} onClick={() => { setSelected(ticket); setResolution(''); }}
                style={{
                  padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                  cursor: 'pointer', transition: 'background 0.15s',
                  background: selected?.id === ticket.id ? 'rgba(255,107,0,0.08)' : 'transparent',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                      <span className={`badge ${PRIORITY_COLOR[ticket.priority] || 'badge-blue'}`}>{ticket.priority}</span>
                      {ticket.category && <span className="badge badge-blue">{ticket.category}</span>}
                    </div>
                    <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'white' }}>{ticket.subject}</p>
                    <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
                      {ticket.school_name || 'Platform'} · {timeAgo(ticket.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={ticket.status} />
                </div>
              </div>
            ))
          )}
        </div>

        {selected && (
          <div className="card-navy animate-fade-in" style={{ height: 'fit-content' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'white' }}>Ticket Detail</h3>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>SUBJECT</p>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'white' }}>{selected.subject}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>DESCRIPTION</p>
                <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{selected.description}</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>RAISED BY</p><p style={{ fontSize: '0.8rem', color: 'white', marginTop: 2 }}>{selected.raised_by_name || '—'}</p></div>
                <div><p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>CREATED</p><p style={{ fontSize: '0.8rem', color: 'white', marginTop: 2 }}>{formatDate(selected.created_at)}</p></div>
              </div>
              {selected.status !== 'RESOLVED' && selected.status !== 'CLOSED' && (
                <>
                  <textarea
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    placeholder="Write resolution note..."
                    rows={3}
                    style={{
                      width: '100%', padding: '10px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                      color: 'white', fontSize: '0.8rem', resize: 'vertical',
                    }}
                  />
                  <button className="btn-green" style={{ width: '100%', justifyContent: 'center' }}
                    disabled={!resolution.trim() || resolveMut.isPending}
                    onClick={() => resolveMut.mutate({ id: selected.id, resolution })}>
                    ✅ Mark Resolved
                  </button>
                </>
              )}
              {selected.resolution && (
                <div style={{ padding: 12, borderRadius: 8, background: 'rgba(19,136,8,0.1)', border: '1px solid rgba(19,136,8,0.2)' }}>
                  <p style={{ fontSize: '0.7rem', color: 'var(--forest-light)', marginBottom: 4 }}>RESOLUTION</p>
                  <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>{selected.resolution}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
