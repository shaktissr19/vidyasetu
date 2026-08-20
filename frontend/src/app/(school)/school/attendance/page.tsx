'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAttendanceRoster, getAttendanceSummary, getClasses, markAttendance } from '@/services/schoolService';
import { SectionHeader, TableSkeleton } from '@/components/ui/index';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'HOLIDAY';
type Tab = 'mark' | 'summary';
const STATUS: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'HOLIDAY'];
const COLOR: Record<AttendanceStatus, string> = { PRESENT: 'var(--forest)', ABSENT: '#C62828', LATE: 'var(--saffron)', HALF_DAY: '#1565C0', HOLIDAY: '#7A7F8C' };
const ICON: Record<AttendanceStatus, string> = { PRESENT: '✓', ABSENT: '✗', LATE: '⏰', HALF_DAY: '½', HOLIDAY: 'H' };

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

  useEffect(() => {
    if (!rosterQ.data) return;
    const next: Record<string, AttendanceStatus> = {};
    for (const student of rosterQ.data) next[student.id] = STATUS.includes(student.attendance_status as AttendanceStatus) ? student.attendance_status as AttendanceStatus : 'PRESENT';
    setRecords(next);
  }, [rosterQ.data]);

  const save = useMutation({
    mutationFn: () => markAttendance({ classId, date, records: roster.map((student) => ({ studentId: student.id, status: records[student.id] || 'PRESENT' })) }),
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

  function all(status: AttendanceStatus) {
    const next: Record<string, AttendanceStatus> = {};
    for (const student of roster) next[student.id] = status;
    setRecords(next);
  }

  const counts = STATUS.reduce<Record<AttendanceStatus, number>>((out, status) => {
    out[status] = roster.filter((student) => (records[student.id] || 'PRESENT') === status).length;
    return out;
  }, { PRESENT: 0, ABSENT: 0, LATE: 0, HALF_DAY: 0, HOLIDAY: 0 });

  return <div className="animate-fade-up">
    <SectionHeader title="📅 Attendance"><div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--saffron-pale)' }}>{([['mark', 'Mark Attendance'], ['summary', 'Summary']] as Array<[Tab, string]>).map(([key, label]) => <button key={key} className="px-4 py-1.5 rounded-lg text-sm font-bold" style={{ background: tab === key ? 'white' : 'transparent', color: tab === key ? 'var(--saffron)' : 'var(--slate)' }} onClick={() => setTab(key)}>{label}</button>)}</div></SectionHeader>
    {tab === 'mark' ? <>
      <div className="card mb-4"><div className="grid sm:grid-cols-2 gap-3"><div><label className="text-xs font-bold block mb-1">Date</label><input type="date" max={today} className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div><div><label className="text-xs font-bold block mb-1">Class / Section</label><select className="input select" value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Select class</option>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>Class {schoolClass.class_name}-{schoolClass.section} ({schoolClass.student_count})</option>)}</select></div></div></div>
      {!classId ? <div className="card text-center py-12"><div className="text-4xl mb-2">📅</div><b>Select a class to mark attendance</b></div> : rosterQ.isLoading ? <TableSkeleton rows={6} cols={4} /> : <div className="card">
        <div className="flex flex-wrap gap-2 items-center mb-4"><button className="btn-ghost text-xs" onClick={() => all('PRESENT')}>✓ All Present</button><button className="btn-ghost text-xs" onClick={() => all('HOLIDAY')}>H Mark Holiday</button><div className="ml-auto flex flex-wrap gap-3 text-xs font-bold">{STATUS.slice(0, 4).map((status) => <span key={status} style={{ color: COLOR[status] }}>{status.replace('_', ' ')}: {counts[status]}</span>)}</div></div>
        <div className="space-y-0">{roster.map((student, i) => <div key={student.id} className="flex items-center gap-3 py-3" style={{ borderBottom: i < roster.length - 1 ? '1px solid var(--border)' : 'none' }}><div className="w-9 h-9 rounded-full grid place-items-center font-bold" style={{ background: 'var(--saffron-pale)', color: 'var(--saffron)' }}>{student.name?.[0]}</div><div className="flex-1"><div className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{student.name}</div><div className="text-xs" style={{ color: 'var(--slate)' }}>{student.student_code} · Roll {student.roll_number || '—'}</div></div><div className="flex gap-1 flex-wrap justify-end">{STATUS.map((status) => <button key={status} title={status.replace('_', ' ')} className="w-9 h-9 rounded-lg text-xs font-bold" style={{ background: (records[student.id] || 'PRESENT') === status ? COLOR[status] : '#F0F4F8', color: (records[student.id] || 'PRESENT') === status ? 'white' : 'var(--slate)' }} onClick={() => setRecords((current) => ({ ...current, [student.id]: status }))}>{ICON[status]}</button>)}</div></div>)}</div>
        {!roster.length ? <div className="py-8 text-center" style={{ color: 'var(--slate)' }}>No approved Students in this class.</div> : <button className="btn-primary w-full justify-center mt-4" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save Attendance'}</button>}
      </div>}
    </> : <div className="card"><div className="flex justify-between items-center mb-4"><h3 className="font-display font-bold" style={{ color: 'var(--navy)' }}>Attendance Summary</h3><input type="date" max={today} className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} /></div>{summaryQ.isLoading ? <TableSkeleton rows={5} cols={7} /> : <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Class</th><th>Students</th><th>Present</th><th>Absent</th><th>Late</th><th>Half Day</th><th>Attendance %</th></tr></thead><tbody>{(summaryQ.data || []).map((row) => { const denominator = Number(row.total_students || 0); const attended = Number(row.present || 0) + Number(row.late || 0) + Number(row.half_day || 0); const pct = denominator ? Math.round(attended / denominator * 100) : 0; return <tr key={row.id}><td><b>Class {row.class_name}-{row.section}</b></td><td>{row.total_students}</td><td style={{ color: 'var(--forest)' }}>{row.present}</td><td style={{ color: '#C62828' }}>{row.absent}</td><td>{row.late}</td><td>{row.half_day}</td><td><b style={{ color: pct >= 85 ? 'var(--forest)' : 'var(--saffron)' }}>{pct}%</b></td></tr>; })}</tbody></table></div>}</div>}
  </div>;
}
