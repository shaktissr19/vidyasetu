'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAttendanceRoster, getAttendanceSummary, getClasses, markAttendance } from '@/services/schoolService';
import { SectionHeader, TableSkeleton } from '@/components/ui/index';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

type MarkableStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'HOLIDAY';
type AttendanceStatus = MarkableStatus | 'EXCUSED';
type Tab = 'mark' | 'summary';
const STATUS: MarkableStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'HOLIDAY'];
const COLOR: Record<AttendanceStatus, string> = { PRESENT: 'var(--forest)', ABSENT: '#C62828', LATE: 'var(--saffron)', HALF_DAY: '#1565C0', HOLIDAY: '#7A7F8C', EXCUSED: '#6D4BC3' };
const ICON: Record<AttendanceStatus, string> = { PRESENT: '✓', ABSENT: '✗', LATE: '⏰', HALF_DAY: '½', HOLIDAY: 'H', EXCUSED: 'E' };

export default function SchoolAttendancePage() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [classId, setClassId] = useState('');
  const [records, setRecords] = useState<Record<string, AttendanceStatus>>({});
  const [tab, setTab] = useState<Tab>('mark');

  const classesQ = useQuery({ queryKey: ['school-classes'], queryFn: () => getClasses().then((r) => r.data.data || []) });
  const classes = classesQ.data || [];
  const rosterQ = useQuery({ queryKey: ['attendance-roster', classId, date], queryFn: () => getAttendanceRoster(classId, date).then((r) => r.data.data || []), enabled: !!classId });
  const roster = rosterQ.data || [];
  const summaryQ = useQuery({ queryKey: ['attendance-summary', date], queryFn: () => getAttendanceSummary(date).then((r) => r.data.data || []), enabled: tab === 'summary' });
  const schoolClosed = Boolean(roster[0]?.school_closed);
  const closureTitle = roster[0]?.closure_title as string | null | undefined;

  useEffect(() => {
    if (!rosterQ.data) return;
    const next: Record<string, AttendanceStatus> = {};
    for (const student of rosterQ.data) {
      if (student.school_closed) next[student.id] = 'HOLIDAY';
      else {
        const status = student.attendance_status as AttendanceStatus;
        next[student.id] = [...STATUS, 'EXCUSED'].includes(status) ? status : 'PRESENT';
      }
    }
    setRecords(next);
  }, [rosterQ.data]);

  const save = useMutation({
    mutationFn: () => markAttendance({ classId, date, records: roster.map((student) => {
      const status = records[student.id] || 'PRESENT';
      // EXCUSED is governance-derived, never manually written by the browser.
      // Sending ABSENT lets the API re-resolve it against the approved leave record.
      return { studentId: student.id, status: status === 'EXCUSED' ? 'ABSENT' : status };
    }) }),
    onSuccess: async (res) => {
      toast.success(`Attendance saved for ${res.data.data.marked} Students`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['attendance-roster', classId, date] }),
        qc.invalidateQueries({ queryKey: ['attendance-summary', date] }),
        qc.invalidateQueries({ queryKey: ['school-overview'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Failed to save attendance')),
  });

  function all(status: MarkableStatus) {
    const next: Record<string, AttendanceStatus> = {};
    for (const student of roster) next[student.id] = status;
    setRecords(next);
  }

  const counts = (['PRESENT','ABSENT','LATE','HALF_DAY','HOLIDAY','EXCUSED'] as AttendanceStatus[]).reduce<Record<AttendanceStatus, number>>((out, status) => {
    out[status] = roster.filter((student) => (records[student.id] || 'PRESENT') === status).length;
    return out;
  }, { PRESENT: 0, ABSENT: 0, LATE: 0, HALF_DAY: 0, HOLIDAY: 0, EXCUSED: 0 });

  return <div className="animate-fade-up">
    <SectionHeader title="📅 Attendance"><div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--saffron-pale)' }}>{([['mark', 'Mark Attendance'], ['summary', 'Summary']] as Array<[Tab, string]>).map(([key, label]) => <button key={key} className="px-4 py-1.5 rounded-lg text-sm font-bold" style={{ background: tab === key ? 'white' : 'transparent', color: tab === key ? 'var(--saffron)' : 'var(--slate)' }} onClick={() => setTab(key)}>{label}</button>)}</div></SectionHeader>
    {tab === 'mark' ? <>
      <div className="card mb-4"><div className="grid sm:grid-cols-2 gap-3"><div><label className="text-xs font-bold block mb-1">Date</label><input type="date" max={today} className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div><div><label className="text-xs font-bold block mb-1">Class / Section</label><select className="input select" value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Select class</option>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>Class {schoolClass.class_name}-{schoolClass.section} ({schoolClass.student_count})</option>)}</select></div></div></div>
      {!classId ? <div className="card text-center py-12"><div className="text-4xl mb-2">📅</div><b>Select a class to mark attendance</b></div> : rosterQ.isLoading ? <TableSkeleton rows={6} cols={4} /> : <div className="card">
        {schoolClosed && <div className="mb-4 p-3 rounded-xl text-sm font-semibold" style={{ background: '#FFF7E8', color: '#9A6500', border: '1px solid #F7D79A' }}>🏖️ School calendar closed for this class on {date}{closureTitle ? ` — ${closureTitle}` : ''}. The roster is restricted to Holiday status.</div>}
        {counts.EXCUSED > 0 && !schoolClosed && <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: '#F5F0FF', color: '#5B3AA8', border: '1px solid #D8C9F4' }}>🩺 {counts.EXCUSED} Student{counts.EXCUSED === 1 ? '' : 's'} currently covered by approved leave. Excused stays separate from Present and unexcused Absence.</div>}
        <div className="flex flex-wrap gap-2 items-center mb-4"><button className="btn-ghost text-xs" disabled={schoolClosed} onClick={() => all('PRESENT')}>✓ All Present</button><button className="btn-ghost text-xs" onClick={() => all('HOLIDAY')}>H Mark Holiday</button><div className="ml-auto flex flex-wrap gap-3 text-xs font-bold">{(['PRESENT','ABSENT','LATE','HALF_DAY','EXCUSED'] as AttendanceStatus[]).map((status) => <span key={status} style={{ color: COLOR[status] }}>{status.replace('_', ' ')}: {counts[status]}</span>)}</div></div>
        <div className="space-y-0">{roster.map((student, i) => <div key={student.id} className="flex items-center gap-3 py-3" style={{ borderBottom: i < roster.length - 1 ? '1px solid var(--border)' : 'none' }}><div className="w-9 h-9 rounded-full grid place-items-center font-bold" style={{ background: student.approved_leave ? '#F5F0FF' : 'var(--saffron-pale)', color: student.approved_leave ? '#6D4BC3' : 'var(--saffron)' }}>{student.name?.[0]}</div><div className="flex-1"><div className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{student.name}</div><div className="text-xs" style={{ color: 'var(--slate)' }}>{student.student_code} · Roll {student.roll_number || '—'}{student.approved_leave ? ' · Approved leave' : ''}</div>{student.approved_leave && student.leave_reason && <div className="text-[11px] mt-0.5" style={{ color: '#6D4BC3' }}>{student.leave_reason}</div>}</div><div className="flex gap-1 flex-wrap justify-end">{records[student.id] === 'EXCUSED' && <div title="Approved leave" className="w-9 h-9 rounded-lg text-xs font-bold grid place-items-center" style={{ background: COLOR.EXCUSED, color: 'white' }}>{ICON.EXCUSED}</div>}{STATUS.map((status) => <button key={status} title={status.replace('_', ' ')} disabled={schoolClosed && status !== 'HOLIDAY'} className="w-9 h-9 rounded-lg text-xs font-bold disabled:opacity-35" style={{ background: (records[student.id] || 'PRESENT') === status ? COLOR[status] : '#F0F4F8', color: (records[student.id] || 'PRESENT') === status ? 'white' : 'var(--slate)' }} onClick={() => setRecords((current) => ({ ...current, [student.id]: status }))}>{ICON[status]}</button>)}</div></div>)}</div>
        {!roster.length ? <div className="py-8 text-center" style={{ color: 'var(--slate)' }}>No approved Students in this class.</div> : <button className="btn-primary w-full justify-center mt-4" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : schoolClosed ? 'Save Holiday Attendance' : 'Save Attendance'}</button>}
      </div>}
    </> : <div className="card"><div className="flex justify-between items-center mb-4"><h3 className="font-display font-bold" style={{ color: 'var(--navy)' }}>Attendance Summary</h3><input type="date" max={today} className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} /></div>{summaryQ.isLoading ? <TableSkeleton rows={5} cols={8} /> : <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Class</th><th>Students</th><th>Present</th><th>Absent</th><th>Excused</th><th>Late</th><th>Half Day</th><th>Attendance %</th></tr></thead><tbody>{(summaryQ.data || []).map((row) => { const denominator = Number(row.total_students || 0); const attended = Number(row.present || 0) + Number(row.late || 0) + Number(row.half_day || 0); const pct = denominator ? Math.round(attended / denominator * 100) : 0; return <tr key={row.id}><td><b>Class {row.class_name}-{row.section}</b></td><td>{row.total_students}</td><td style={{ color: 'var(--forest)' }}>{row.present}</td><td style={{ color: '#C62828' }}>{row.absent}</td><td style={{ color: '#6D4BC3', fontWeight: 700 }}>{row.excused || 0}</td><td>{row.late}</td><td>{row.half_day}</td><td><b style={{ color: pct >= 85 ? 'var(--forest)' : 'var(--saffron)' }}>{pct}%</b></td></tr>; })}</tbody></table></div>}</div>}
  </div>;
}
