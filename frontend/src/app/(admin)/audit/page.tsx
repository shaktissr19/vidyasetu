'use client';
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getAuditLog, type AdminAuditLogEntry } from '@/services/adminService';
import { SectionHeader, TableSkeleton, EmptyState } from '@/components/ui/index';
import { formatDate } from '@/utils/formatters';
import { apiErrorText } from '@/utils/errors';

const ENTITY_TYPES = ['', 'school', 'user', 'platform_config', 'support_ticket', 'group', 'grievance', 'competition'] as const;

function pretty(value: Record<string, unknown> | null | undefined) {
  if (!value) return '—';
  return JSON.stringify(value, null, 2);
}

function actionTone(action: string) {
  if (action.includes('SUSPEND') || action.includes('REJECT') || action.includes('CLOSED')) return '#EF9A9A';
  if (action.includes('ACTIVE') || action.includes('APPROV') || action.includes('RESOLVED')) return '#A5D6A7';
  if (action.includes('CONFIG')) return '#FFD180';
  return '#81D4FA';
}

export default function AdminAuditPage() {
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminAuditLogEntry | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-audit', search, action, entityType, page],
    queryFn: () => getAuditLog({ search: search || undefined, action: action || undefined, entityType: entityType || undefined, page, limit: 30 }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const entries = data?.data || [];
  const meta = data?.meta;

  return (
    <div className="animate-fade-up">
      <SectionHeader title="🧾 Audit Trail" sub={`${meta?.total || 0} matching immutable governance events`} />

      <div className="card-navy mb-5" style={{ borderLeft: '4px solid #4FC3F7' }}>
        <div className="font-bold text-white">Platform accountability</div>
        <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.48)' }}>School, user, support and configuration governance actions record who acted, what changed, and when. This surface is read-only for Super Admins.</p>
      </div>

      <div className="card-navy mb-5">
        <div className="flex flex-wrap gap-3">
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="🔍 Actor, school, action or entity ID..."
            className="input flex-1 min-w-[220px]" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
          <input value={action} onChange={(e) => { setAction(e.target.value.toUpperCase()); setPage(1); }} placeholder="Exact action, e.g. CONFIG_UPDATE"
            className="input min-w-[220px]" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
          <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} className="input select"
            style={{ background: '#111a32', border: '1px solid rgba(255,255,255,0.1)', color: 'white', width: 'auto' }}>
            {ENTITY_TYPES.map((type) => <option key={type || 'all'} value={type}>{type ? type.replaceAll('_', ' ') : 'All entities'}</option>)}
          </select>
        </div>
      </div>

      <div className="card-navy" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? <TableSkeleton rows={10} cols={6} /> : isError ? (
          <div className="p-6" style={{ color: '#EF9A9A' }}>{apiErrorText(error, 'Could not load audit trail')}</div>
        ) : entries.length === 0 ? <EmptyState icon="🧾" title="No audit events" sub="No events match the current filters" /> : (
          <div className="overflow-x-auto">
            <table className="tbl" style={{ color: 'rgba(255,255,255,0.72)' }}>
              <thead><tr>{['When', 'Actor', 'Action', 'Entity', 'School', 'Change'].map((header) => <th key={header} style={{ color: 'rgba(255,255,255,0.42)', background: 'rgba(255,255,255,0.05)' }}>{header}</th>)}</tr></thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <td className="whitespace-nowrap text-xs">{formatDate(entry.created_at)}</td>
                    <td><div className="text-sm font-semibold text-white">{entry.actor_name || 'System'}</div><div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.36)' }}>{entry.actor_role || 'SYSTEM'}</div></td>
                    <td><code className="text-xs font-bold" style={{ color: actionTone(entry.action) }}>{entry.action}</code></td>
                    <td><div className="text-xs">{entry.entity_type || '—'}</div><div className="text-[10px] font-mono max-w-[150px] truncate" title={entry.entity_id || ''} style={{ color: 'rgba(255,255,255,0.35)' }}>{entry.entity_id || '—'}</div></td>
                    <td className="text-xs">{entry.school_name || 'Platform'}</td>
                    <td><button className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(79,195,247,0.12)', color: '#81D4FA' }} onClick={() => setSelected(entry)}>Inspect</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(meta?.totalPages || 0) > 1 && (
          <div className="flex items-center justify-between p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Page {meta?.page} of {meta?.totalPages}</span>
            <div className="flex gap-2"><button className="btn-ghost text-xs" disabled={!meta?.hasPrev} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Prev</button><button className="btn-ghost text-xs" disabled={!meta?.hasNext} onClick={() => setPage((p) => p + 1)}>Next ›</button></div>
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4" style={{ background: 'rgba(3,8,22,0.82)' }} onMouseDown={(e) => e.currentTarget === e.target && setSelected(null)}>
          <div className="card-navy w-full max-w-3xl max-h-[86vh] overflow-y-auto" style={{ border: '1px solid rgba(79,195,247,0.28)' }}>
            <div className="flex items-start justify-between gap-3 mb-5">
              <div><div className="text-xs font-bold" style={{ color: actionTone(selected.action) }}>{selected.action}</div><h2 className="font-display font-extrabold text-xl text-white mt-1">Audit event detail</h2></div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 0, color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              {[
                ['Actor', selected.actor_name || 'System'], ['Role', selected.actor_role || 'SYSTEM'], ['Entity', selected.entity_type || '—'], ['School', selected.school_name || 'Platform'],
              ].map(([label, value]) => <div key={label} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }}><div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</div><div className="text-sm font-bold text-white mt-1 break-words">{value}</div></div>)}
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div><div className="text-xs font-bold mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>BEFORE</div><pre className="text-xs rounded-xl p-3 overflow-auto min-h-28" style={{ background: 'rgba(194,40,40,0.08)', color: '#FFCDD2', border: '1px solid rgba(194,40,40,0.16)' }}>{pretty(selected.old_value)}</pre></div>
              <div><div className="text-xs font-bold mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>AFTER</div><pre className="text-xs rounded-xl p-3 overflow-auto min-h-28" style={{ background: 'rgba(19,136,8,0.08)', color: '#C8E6C9', border: '1px solid rgba(19,136,8,0.16)' }}>{pretty(selected.new_value)}</pre></div>
            </div>
            <div className="mt-4 text-xs" style={{ color: 'rgba(255,255,255,0.38)' }}>Event ID: <code>{selected.id}</code> · Created: {new Date(selected.created_at).toLocaleString('en-IN')}</div>
          </div>
        </div>
      )}
    </div>
  );
}
