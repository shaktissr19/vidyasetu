'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getChildren } from '@/services/parentService';
import { getParentChildTransport, type TransportEventType } from '@/services/transportService';
import { apiErrorText } from '@/utils/errors';

const LABELS: Record<TransportEventType,string> = {
  PICKED_UP: 'Picked up for School',
  DROPPED_AT_SCHOOL: 'Arrived at School',
  BOARDED_RETURN: 'Boarded return transport',
  DROPPED_HOME: 'Dropped at assigned stop / home',
  MISSED_BUS: 'Missed bus',
};

export default function ParentTransportPage() {
  const childrenQ = useQuery({ queryKey: ['parent-children'], queryFn: () => getChildren().then((r) => r.data.data || []) });
  const [studentId,setStudentId] = useState('');
  useEffect(() => { if (!studentId && childrenQ.data?.[0]?.id) setStudentId(childrenQ.data[0].id); }, [childrenQ.data,studentId]);
  const transportQ = useQuery({
    queryKey: ['parent-child-transport',studentId],
    queryFn: () => getParentChildTransport(studentId).then((r) => r.data.data),
    enabled: Boolean(studentId), staleTime:20_000, refetchInterval:60_000,
  });
  const data = transportQ.data;
  const assignment = data?.assignment;

  return <div className="animate-fade-up space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="font-display font-extrabold text-2xl" style={{ color:'var(--navy)' }}>🚌 Transport & Safety</h1><p className="text-sm mt-1" style={{ color:'var(--slate)' }}>School-recorded route, vehicle and pickup/drop milestones for your linked child.</p></div>
      <select className="input select w-auto min-w-[220px]" value={studentId} onChange={(e) => setStudentId(e.target.value)}>{(childrenQ.data || []).map((child) => <option key={child.id} value={child.id}>{child.name} · Class {child.class_name}-{child.section || ''}</option>)}</select>
    </div>
    {childrenQ.isError && <div className="card" style={{ color:'#B42318' }}>{apiErrorText(childrenQ.error)}</div>}
    {transportQ.isLoading && <div className="card">Loading transport information…</div>}
    {transportQ.isError && <div className="card" style={{ color:'#B42318' }}>{apiErrorText(transportQ.error,'Could not load transport information.')}</div>}
    {data && !assignment && <div className="card"><h2 className="font-bold">No active transport assignment</h2><p className="text-sm mt-2" style={{ color:'var(--slate)' }}>The School has not assigned transport for {data.student.name}.</p></div>}
    {assignment && <>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card"><div className="text-xs" style={{ color:'var(--slate)' }}>Route & stop</div><div className="font-bold mt-1">{assignment.route_name || '—'} {assignment.route_code ? `(${assignment.route_code})` : ''}</div><div className="text-sm mt-2">{assignment.stop_name || '—'}</div><div className="text-xs mt-1" style={{ color:'var(--slate)' }}>Pickup {assignment.pickup_time || '—'} · Drop {assignment.drop_time || '—'}</div></div>
        <div className="card"><div className="text-xs" style={{ color:'var(--slate)' }}>Vehicle & crew</div><div className="font-bold mt-1">{assignment.vehicle_label || '—'} · {assignment.registration_number || '—'}</div><div className="text-sm mt-2">Driver: {assignment.driver_name || '—'} {assignment.driver_phone ? `· ${assignment.driver_phone}` : ''}</div>{assignment.attendant_name && <div className="text-xs mt-1" style={{ color:'var(--slate)' }}>Attendant: {assignment.attendant_name} {assignment.attendant_phone ? `· ${assignment.attendant_phone}` : ''}</div>}</div>
        <div className="card"><div className="text-xs" style={{ color:'var(--slate)' }}>Authorized pickup</div><div className="font-bold mt-1">{assignment.authorized_pickup_name || 'Not specified'}</div><div className="text-sm">{assignment.authorized_pickup_relation || ''}</div><div className="text-xs mt-1" style={{ color:'var(--slate)' }}>{assignment.authorized_pickup_phone || ''}</div></div>
      </div>
      <div className="card"><div className="flex justify-between gap-3 items-center"><h2 className="font-display font-bold text-lg">Today&apos;s journey</h2><button className="btn-ghost text-xs" onClick={() => transportQ.refetch()}>Refresh</button></div>{!data?.todayEvents.length ? <p className="text-sm mt-4" style={{ color:'var(--slate)' }}>No transport milestone has been recorded yet today.</p> : <div className="mt-4 space-y-3">{data.todayEvents.map((event) => <div key={event.id} className="p-3 rounded-xl" style={{ background:event.event_type === 'MISSED_BUS' ? '#FFF1F0' : '#F4F8F5' }}><div className="font-bold">{LABELS[event.event_type]}</div><div className="text-xs mt-1" style={{ color:'var(--slate)' }}>{new Date(event.event_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}{event.note ? ` · ${event.note}` : ''}</div></div>)}</div>}</div>
    </>}
    <div className="card text-xs" style={{ color:'var(--slate)' }}>These are authenticated School-recorded safety milestones. VidyaSetu does not present them as live GPS tracking.</div>
  </div>;
}
