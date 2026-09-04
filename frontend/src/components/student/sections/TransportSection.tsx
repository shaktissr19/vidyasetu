'use client';

import { useQuery } from '@tanstack/react-query';
import { getMyTransport, type TransportEventType } from '@/services/transportService';
import { apiErrorText } from '@/utils/errors';

const EVENT_LABEL: Record<TransportEventType, string> = {
  PICKED_UP: 'Picked up for School',
  DROPPED_AT_SCHOOL: 'Arrived at School',
  BOARDED_RETURN: 'Boarded return transport',
  DROPPED_HOME: 'Dropped at assigned stop / home',
  MISSED_BUS: 'Missed bus',
};

export default function TransportSection() {
  const transport = useQuery({
    queryKey: ['student-transport'],
    queryFn: () => getMyTransport().then((response) => response.data.data),
    staleTime: 20_000,
    refetchInterval: 60_000,
  });

  if (transport.isLoading) return <div className="card">Loading transport information…</div>;
  if (transport.isError) return <div className="card" style={{ color: '#B42318' }}>{apiErrorText(transport.error, 'Could not load transport information.')}</div>;
  const data = transport.data;
  if (!data?.assignment) return <div className="card"><h2 className="font-display font-extrabold text-xl">🚌 Transport & Safety</h2><p className="mt-2" style={{ color: 'var(--slate)' }}>No active School transport assignment is configured for you.</p></div>;
  const a = data.assignment;

  return <div className="animate-fade-up space-y-5">
    <div>
      <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--navy)' }}>🚌 Transport & Safety</h1>
      <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Your assigned School route and today&apos;s verified pickup/drop milestones.</p>
    </div>
    <div className="grid md:grid-cols-3 gap-4">
      <div className="card"><div className="text-xs" style={{ color: 'var(--slate)' }}>Route</div><div className="font-bold mt-1">{a.route_name || '—'} <span className="text-xs">{a.route_code ? `(${a.route_code})` : ''}</span></div><div className="text-sm mt-2">Stop: <b>{a.stop_name || '—'}</b></div><div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Pickup {a.pickup_time || '—'} · Drop {a.drop_time || '—'}</div></div>
      <div className="card"><div className="text-xs" style={{ color: 'var(--slate)' }}>Vehicle</div><div className="font-bold mt-1">{a.vehicle_label || '—'}</div><div className="text-sm">{a.registration_number || '—'}</div><div className="text-xs mt-2" style={{ color: 'var(--slate)' }}>Driver: {a.driver_name || '—'} {a.driver_phone ? `· ${a.driver_phone}` : ''}</div>{a.attendant_name && <div className="text-xs" style={{ color: 'var(--slate)' }}>Attendant: {a.attendant_name} {a.attendant_phone ? `· ${a.attendant_phone}` : ''}</div>}</div>
      <div className="card"><div className="text-xs" style={{ color: 'var(--slate)' }}>Authorized pickup</div><div className="font-bold mt-1">{a.authorized_pickup_name || 'Not specified'}</div><div className="text-sm">{a.authorized_pickup_relation || ''}</div><div className="text-xs mt-2" style={{ color: 'var(--slate)' }}>{a.authorized_pickup_phone || ''}</div></div>
    </div>
    <div className="card">
      <div className="flex justify-between gap-3 items-center"><h2 className="font-display font-bold text-lg">Today&apos;s journey</h2><button className="btn-ghost text-xs" onClick={() => transport.refetch()}>Refresh</button></div>
      {!data.todayEvents.length ? <p className="text-sm mt-4" style={{ color: 'var(--slate)' }}>No transport milestone has been recorded yet today.</p> : <div className="mt-4 space-y-3">{data.todayEvents.map((event) => <div key={event.id} className="p-3 rounded-xl" style={{ background: event.event_type === 'MISSED_BUS' ? '#FFF1F0' : '#F4F8F5' }}><div className="font-bold">{EVENT_LABEL[event.event_type]}</div><div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{new Date(event.event_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{event.note ? ` · ${event.note}` : ''}</div></div>)}</div>}
    </div>
    <div className="card text-xs" style={{ color: 'var(--slate)' }}>VidyaSetu shows School-recorded transport milestones and static route/stop details. It does not claim live GPS vehicle tracking.</div>
  </div>;
}
