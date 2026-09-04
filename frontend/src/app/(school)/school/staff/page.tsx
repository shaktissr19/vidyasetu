'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import useAuthStore from '@/store/authStore';
import { SectionHeader, TableSkeleton } from '@/components/ui/index';
import { apiErrorText } from '@/utils/errors';
import { getSchoolCalendar } from '@/services/absenceCalendarService';
import {
  cancelMyStaffLeave,
  createMyStaffLeave,
  getMyStaffAttendance,
  getMyStaffLeaves,
  getStaffAttendanceSummary,
  getStaffLeaves,
  getStaffRoster,
  markStaffAttendance,
  reviewStaffLeave,
  type StaffAttendanceInputStatus,
  type StaffLeaveRequest,
  type StaffRosterRow,
} from '@/services/staffOperationsService';

type AdminTab = 'attendance' | 'leave' | 'summary';
const INPUT_STATUSES: StaffAttendanceInputStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'HOLIDAY'];
const STATUS_COLOR: Record<string, string> = {
  PRESENT: 'var(--forest)', ABSENT: '#C62828', LATE: 'var(--saffron)', HALF_DAY: '#1565C0',
  EXCUSED: '#6A4BBC', HOLIDAY: '#7A7F8C', PENDING: '#B26A00', APPROVED: 'var(--forest)',
  REJECTED: '#C62828', CANCELLED: '#7A7F8C',
};

function dateText(value: string): string {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function LeaveBadge({ status }: { status: string }) {
  return <span className="badge" style={{ background: `${STATUS_COLOR[status] || '#667085'}18`, color: STATUS_COLOR[status] || '#667085' }}>{status}</span>;
}

function TeacherStaffWorkspace() {
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [form, setForm] = useState({ startDate: '', endDate: '', reason: '' });

  const leavesQ = useQuery({ queryKey: ['staff-my-leaves'], queryFn: () => getMyStaffLeaves().then((r) => r.data.data || []) });
  const attendanceQ = useQuery({ queryKey: ['staff-my-attendance', year, month], queryFn: () => getMyStaffAttendance(year, month).then((r) => r.data.data) });
  const calendarQ = useQuery({ queryKey: ['school-calendar', 'staff'], queryFn: () => getSchoolCalendar().then((r) => r.data.data || []) });

  const createLeave = useMutation({
    mutationFn: () => createMyStaffLeave(form),
    onSuccess: async () => {
      toast.success('Leave request submitted');
      setForm({ startDate: '', endDate: '', reason: '' });
      await qc.invalidateQueries({ queryKey: ['staff-my-leaves'] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not submit leave request')),
  });
  const cancelLeave = useMutation({
    mutationFn: (leaveId: string) => cancelMyStaffLeave(leaveId),
    onSuccess: async () => { toast.success('Pending leave cancelled'); await qc.invalidateQueries({ queryKey: ['staff-my-leaves'] }); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not cancel leave')),
  });

  const summary = attendanceQ.data?.summary;
  const upcoming = (calendarQ.data || []).filter((event) => event.end_date.slice(0, 10) >= new Date().toISOString().slice(0, 10)).slice(0, 6);
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  function moveMonth(delta: number) {
    const next = new Date(year, month - 1 + delta, 1);
    setYear(next.getFullYear()); setMonth(next.getMonth() + 1);
  }

  return <div className="animate-fade-up">
    <SectionHeader title="👩‍🏫 My Attendance & Leave" sub="Your dated School attendance, leave requests and School calendar" />

    <div className="grid md:grid-cols-4 gap-3 mb-5">
      {[
        ['Present', summary?.present_days || 0, 'var(--forest)'],
        ['Late / Half Day', Number(summary?.late_days || 0) + Number(summary?.half_days || 0), 'var(--saffron)'],
        ['Approved Leave', summary?.excused_days || 0, '#6A4BBC'],
        ['Attendance', summary ? `${Number(summary.attendance_percentage || 0).toFixed(0)}%` : '—', 'var(--navy)'],
      ].map(([label, value, color]) => <div className="card" key={String(label)}><div className="text-xs font-bold" style={{ color: 'var(--slate)' }}>{label}</div><div className="text-2xl font-display font-bold mt-1" style={{ color: String(color) }}>{value}</div><div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{monthLabel}</div></div>)}
    </div>

    <div className="grid lg:grid-cols-[1fr_1.2fr] gap-5 mb-5">
      <div className="card">
        <h3 className="font-display font-bold mb-3" style={{ color: 'var(--navy)' }}>Request Leave</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="text-xs font-bold block mb-1">From</label><input className="input" type="date" value={form.startDate} onChange={(e) => setForm((v) => ({ ...v, startDate: e.target.value }))} /></div>
          <div><label className="text-xs font-bold block mb-1">To</label><input className="input" type="date" min={form.startDate || undefined} value={form.endDate} onChange={(e) => setForm((v) => ({ ...v, endDate: e.target.value }))} /></div>
        </div>
        <textarea className="input mt-3 min-h-24" placeholder="Reason for leave" value={form.reason} onChange={(e) => setForm((v) => ({ ...v, reason: e.target.value }))} />
        <button className="btn-primary mt-3" disabled={createLeave.isPending || !form.startDate || !form.endDate || form.reason.trim().length < 5} onClick={() => createLeave.mutate()}>{createLeave.isPending ? 'Submitting…' : 'Submit Leave Request'}</button>
      </div>
      <div className="card">
        <div className="flex items-center justify-between gap-2 mb-3"><h3 className="font-display font-bold" style={{ color: 'var(--navy)' }}>School Calendar</h3><span className="text-xs" style={{ color: 'var(--slate)' }}>Class-only closures do not close the staff register</span></div>
        {calendarQ.isLoading ? <div className="text-sm">Loading calendar…</div> : <div className="space-y-2">{upcoming.map((event) => <div key={event.id} className="p-3 rounded-xl" style={{ background: event.is_school_closed ? '#FFF3F2' : '#F7F8FA' }}><div className="flex justify-between gap-3"><b className="text-sm">{event.title}</b><span className="text-xs font-bold" style={{ color: event.is_school_closed ? '#C62828' : 'var(--slate)' }}>{event.event_type.replaceAll('_', ' ')}</span></div><div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{dateText(event.start_date)}{event.end_date !== event.start_date ? ` – ${dateText(event.end_date)}` : ''}{event.is_school_closed ? ' · School closed' : ''}</div></div>)}{!upcoming.length && <div className="text-sm" style={{ color: 'var(--slate)' }}>No upcoming School calendar events.</div>}</div>}
      </div>
    </div>

    <div className="card mb-5">
      <h3 className="font-display font-bold mb-3" style={{ color: 'var(--navy)' }}>My Leave Requests</h3>
      {leavesQ.isLoading ? <TableSkeleton rows={4} cols={5} /> : <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Dates</th><th>Reason</th><th>Status</th><th>Review</th><th></th></tr></thead><tbody>{(leavesQ.data || []).map((leave) => <tr key={leave.id}><td>{dateText(leave.start_date)}{leave.end_date !== leave.start_date ? ` – ${dateText(leave.end_date)}` : ''}</td><td className="max-w-xs">{leave.reason}</td><td><LeaveBadge status={leave.status} /></td><td>{leave.review_note || '—'}</td><td>{leave.status === 'PENDING' && <button className="text-xs font-bold" style={{ color: '#C62828' }} disabled={cancelLeave.isPending} onClick={() => cancelLeave.mutate(leave.id)}>Cancel</button>}</td></tr>)}</tbody></table>{!leavesQ.data?.length && <div className="py-8 text-center" style={{ color: 'var(--slate)' }}>No leave requests yet.</div>}</div>}
    </div>

    <div className="card">
      <div className="flex items-center justify-between mb-3"><h3 className="font-display font-bold" style={{ color: 'var(--navy)' }}>My Attendance · {monthLabel}</h3><div className="flex gap-2"><button className="btn-ghost" onClick={() => moveMonth(-1)}>←</button><button className="btn-ghost" onClick={() => moveMonth(1)}>→</button></div></div>
      {attendanceQ.isLoading ? <TableSkeleton rows={5} cols={3} /> : <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Date</th><th>Status</th><th>Remark</th></tr></thead><tbody>{(attendanceQ.data?.records || []).map((row) => <tr key={row.date}><td>{dateText(row.date)}</td><td><b style={{ color: STATUS_COLOR[row.status] || 'var(--navy)' }}>{row.status.replaceAll('_', ' ')}</b></td><td>{row.remark || '—'}</td></tr>)}</tbody></table>{!attendanceQ.data?.records.length && <div className="py-8 text-center" style={{ color: 'var(--slate)' }}>No attendance recorded for this month yet.</div>}</div>}
    </div>
  </div>;
}

function AdminStaffWorkspace() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const [tab, setTab] = useState<AdminTab>('attendance');
  const [date, setDate] = useState(today);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<Record<string, StaffAttendanceInputStatus>>({});

  const rosterQ = useQuery({ queryKey: ['staff-roster', date], queryFn: () => getStaffRoster(date).then((r) => r.data.data || []), enabled: tab === 'attendance' });
  const leavesQ = useQuery({ queryKey: ['staff-leaves'], queryFn: () => getStaffLeaves().then((r) => r.data.data || []), enabled: tab === 'leave' });
  const summaryQ = useQuery({ queryKey: ['staff-summary', year, month], queryFn: () => getStaffAttendanceSummary(year, month).then((r) => r.data.data || []), enabled: tab === 'summary' });
  const roster = rosterQ.data || [];
  const schoolClosed = Boolean(roster[0]?.school_closed);

  useEffect(() => {
    if (!rosterQ.data) return;
    const next: Record<string, StaffAttendanceInputStatus> = {};
    for (const row of rosterQ.data) {
      if (row.school_closed) next[row.id] = 'HOLIDAY';
      else if (row.attendance_status === 'EXCUSED') next[row.id] = 'ABSENT';
      else if (INPUT_STATUSES.includes(row.attendance_status as StaffAttendanceInputStatus)) next[row.id] = row.attendance_status as StaffAttendanceInputStatus;
      else if (row.approved_leave) next[row.id] = 'ABSENT';
      else next[row.id] = 'PRESENT';
    }
    setRecords(next);
  }, [rosterQ.data]);

  const save = useMutation({
    mutationFn: () => markStaffAttendance({ date, records: roster.map((row) => ({ teacherId: row.id, status: records[row.id] || 'PRESENT' })) }),
    onSuccess: async (res) => {
      toast.success(`Staff attendance saved for ${res.data.data.marked} Teachers`);
      await Promise.all([qc.invalidateQueries({ queryKey: ['staff-roster', date] }), qc.invalidateQueries({ queryKey: ['staff-summary'] })]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not save staff attendance')),
  });
  const review = useMutation({
    mutationFn: ({ leave, action }: { leave: StaffLeaveRequest; action: 'APPROVE' | 'REJECT' }) => {
      const note = window.prompt(`${action === 'APPROVE' ? 'Approval' : 'Rejection'} note (optional)`) || undefined;
      return reviewStaffLeave(leave.id, action, note);
    },
    onSuccess: async () => { toast.success('Staff leave decision saved'); await Promise.all([qc.invalidateQueries({ queryKey: ['staff-leaves'] }), qc.invalidateQueries({ queryKey: ['staff-roster'] })]); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not review staff leave')),
  });

  const effectiveStatus = (row: StaffRosterRow): string => row.school_closed ? 'HOLIDAY' : row.approved_leave && (records[row.id] || 'ABSENT') === 'ABSENT' ? 'EXCUSED' : records[row.id] || 'PRESENT';
  const pendingCount = (leavesQ.data || []).filter((leave) => leave.status === 'PENDING').length;
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return <div className="animate-fade-up">
    <SectionHeader title="🧑‍🏫 Staff Attendance & Leave" sub="Daily Teacher operations without changing employment/profile status">
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--saffron-pale)' }}>{([['attendance', 'Daily Register'], ['leave', `Leave${pendingCount ? ` (${pendingCount})` : ''}`], ['summary', 'Monthly Summary']] as Array<[AdminTab, string]>).map(([key, label]) => <button key={key} className="px-3 py-1.5 rounded-lg text-sm font-bold" style={{ background: tab === key ? 'white' : 'transparent', color: tab === key ? 'var(--saffron)' : 'var(--slate)' }} onClick={() => setTab(key)}>{label}</button>)}</div>
    </SectionHeader>

    {tab === 'attendance' && <>
      <div className="card mb-4"><div className="flex flex-wrap items-end gap-3"><div><label className="text-xs font-bold block mb-1">Attendance date</label><input className="input" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></div>{schoolClosed && <div className="px-3 py-2 rounded-xl text-sm font-bold" style={{ background: '#FFF3F2', color: '#C62828' }}>🏫 School closed · {roster[0]?.closure_title || 'Holiday'}</div>}<div className="ml-auto text-xs" style={{ color: 'var(--slate)' }}>Approved leave is saved as EXCUSED automatically.</div></div></div>
      {rosterQ.isLoading ? <TableSkeleton rows={6} cols={5} /> : <div className="card"><div className="space-y-0">{roster.map((row, index) => <div key={row.id} className="flex flex-wrap items-center gap-3 py-3" style={{ borderBottom: index < roster.length - 1 ? '1px solid var(--border)' : 'none' }}><div className="w-9 h-9 rounded-full grid place-items-center font-bold" style={{ background: 'var(--saffron-pale)', color: 'var(--saffron)' }}>{row.name?.[0]}</div><div className="min-w-44 flex-1"><div className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{row.name}</div><div className="text-xs" style={{ color: 'var(--slate)' }}>{row.employee_id || 'No employee ID'} · {row.designation || 'Teacher'} · Profile: {row.profile_status}</div>{row.approved_leave && <div className="text-xs mt-1" style={{ color: '#6A4BBC' }}>Approved leave · {row.leave_reason}</div>}</div><div className="text-xs font-bold min-w-20" style={{ color: STATUS_COLOR[effectiveStatus(row)] || 'var(--navy)' }}>{effectiveStatus(row).replaceAll('_', ' ')}</div><div className="flex gap-1 flex-wrap justify-end">{INPUT_STATUSES.map((status) => <button key={status} disabled={schoolClosed && status !== 'HOLIDAY'} className="px-2.5 h-8 rounded-lg text-xs font-bold" style={{ background: (records[row.id] || 'PRESENT') === status ? STATUS_COLOR[status] : '#F0F4F8', color: (records[row.id] || 'PRESENT') === status ? 'white' : 'var(--slate)', opacity: schoolClosed && status !== 'HOLIDAY' ? .35 : 1 }} onClick={() => setRecords((current) => ({ ...current, [row.id]: status }))}>{status === 'HALF_DAY' ? '½ Day' : status[0] + status.slice(1).toLowerCase()}</button>)}</div></div>)}</div>{!roster.length ? <div className="py-8 text-center" style={{ color: 'var(--slate)' }}>No active Teachers in this School.</div> : <button className="btn-primary w-full justify-center mt-4" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save Staff Attendance'}</button>}</div>}
    </>}

    {tab === 'leave' && <div className="card">{leavesQ.isLoading ? <TableSkeleton rows={5} cols={6} /> : <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Teacher</th><th>Dates</th><th>Reason</th><th>Status</th><th>Review</th><th>Action</th></tr></thead><tbody>{(leavesQ.data || []).map((leave) => <tr key={leave.id}><td><b>{leave.teacher_name}</b><div className="text-xs" style={{ color: 'var(--slate)' }}>{leave.employee_id || '—'} · {leave.designation || 'Teacher'}</div></td><td>{dateText(leave.start_date)}{leave.end_date !== leave.start_date ? ` – ${dateText(leave.end_date)}` : ''}</td><td className="max-w-xs">{leave.reason}</td><td><LeaveBadge status={leave.status} /></td><td>{leave.review_note || '—'}</td><td>{leave.status === 'PENDING' ? <div className="flex gap-2"><button className="text-xs font-bold" style={{ color: 'var(--forest)' }} disabled={review.isPending} onClick={() => review.mutate({ leave, action: 'APPROVE' })}>Approve</button><button className="text-xs font-bold" style={{ color: '#C62828' }} disabled={review.isPending} onClick={() => review.mutate({ leave, action: 'REJECT' })}>Reject</button></div> : '—'}</td></tr>)}</tbody></table>{!leavesQ.data?.length && <div className="py-8 text-center" style={{ color: 'var(--slate)' }}>No staff leave requests.</div>}</div>}</div>}

    {tab === 'summary' && <div className="card"><div className="flex justify-between items-center mb-4"><h3 className="font-display font-bold" style={{ color: 'var(--navy)' }}>{monthLabel}</h3><input type="month" className="input w-auto" value={`${year}-${String(month).padStart(2, '0')}`} onChange={(e) => { const [y, m] = e.target.value.split('-').map(Number); if (y && m) { setYear(y); setMonth(m); } }} /></div>{summaryQ.isLoading ? <TableSkeleton rows={5} cols={8} /> : <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Teacher</th><th>Working</th><th>Present</th><th>Absent</th><th>Late</th><th>Half Day</th><th>Excused</th><th>Attendance</th></tr></thead><tbody>{(summaryQ.data || []).map((row) => <tr key={row.id}><td><b>{row.name}</b><div className="text-xs" style={{ color: 'var(--slate)' }}>{row.employee_id || '—'}</div></td><td>{row.working_days || 0}</td><td style={{ color: 'var(--forest)' }}>{row.present_days || 0}</td><td style={{ color: '#C62828' }}>{row.absent_days || 0}</td><td>{row.late_days || 0}</td><td>{row.half_days || 0}</td><td style={{ color: '#6A4BBC' }}>{row.excused_days || 0}</td><td><b>{Number(row.attendance_percentage || 0).toFixed(0)}%</b></td></tr>)}</tbody></table></div>}</div>}
  </div>;
}

export default function StaffOperationsPage() {
  const { user } = useAuthStore();
  return user?.role === 'TEACHER' ? <TeacherStaffWorkspace /> : <AdminStaffWorkspace />;
}