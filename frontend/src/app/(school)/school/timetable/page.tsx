'use client';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getClasses, getSubjects, getTeachers, getTimetable, saveTimetable, type TimetableRow } from '@/services/schoolService';
import { SectionHeader, TableSkeleton } from '@/components/ui/index';
import useAuthStore from '@/store/authStore';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

type Day = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';
interface EditorRow { day: Day; periodNumber: number; startTime: string; endTime: string; subjectCode: string; teacherId: string; roomNumber: string; isBreak: boolean; breakLabel: string; }
type EditorKey = keyof EditorRow;
const DAYS: Day[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAY: Record<Day, string> = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat' };
const newRow = (): EditorRow => ({ day: 'MON', periodNumber: 1, startTime: '08:00', endTime: '08:40', subjectCode: '', teacherId: '', roomNumber: '', isBreak: false, breakLabel: '' });

export default function SchoolTimetablePage() {
  const { user } = useAuthStore();
  const canEdit = Boolean(user?.role && ['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(user.role));
  const qc = useQueryClient();
  const [classId, setClassId] = useState('');
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<EditorRow[]>([]);

  const classesQ = useQuery({ queryKey: ['school-classes'], queryFn: () => getClasses().then((r) => r.data.data || []) });
  const teachersQ = useQuery({ queryKey: ['school-teachers'], queryFn: () => getTeachers().then((r) => r.data.data || []) });
  const subjectsQ = useQuery({ queryKey: ['school-subjects'], queryFn: () => getSubjects().then((r) => r.data.data || []) });
  const q = useQuery({ queryKey: ['school-timetable', classId], queryFn: () => getTimetable(classId).then((r) => r.data.data || []), enabled: !!classId });

  useEffect(() => {
    if (!q.data) return;
    setRows(q.data.map((period) => ({ day: period.day as Day, periodNumber: period.period_number, startTime: String(period.start_time).slice(0, 5), endTime: String(period.end_time).slice(0, 5), subjectCode: period.subject_code || '', teacherId: period.teacher_id || '', roomNumber: period.room_number || '', isBreak: Boolean(period.is_break), breakLabel: period.break_label || '' })));
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => saveTimetable(classId, rows.map((row) => ({ ...row, periodNumber: Number(row.periodNumber), teacherId: row.teacherId || null, subjectCode: row.subjectCode || null }))),
    onSuccess: async () => { toast.success('Timetable saved'); setEditing(false); await qc.invalidateQueries({ queryKey: ['school-timetable', classId] }); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Failed to save timetable')),
  });

  const periods = q.data || [];
  const byDay = useMemo<Record<Day, TimetableRow[]>>(() => ({
    MON: periods.filter((row) => row.day === 'MON').sort((a, b) => a.period_number - b.period_number),
    TUE: periods.filter((row) => row.day === 'TUE').sort((a, b) => a.period_number - b.period_number),
    WED: periods.filter((row) => row.day === 'WED').sort((a, b) => a.period_number - b.period_number),
    THU: periods.filter((row) => row.day === 'THU').sort((a, b) => a.period_number - b.period_number),
    FRI: periods.filter((row) => row.day === 'FRI').sort((a, b) => a.period_number - b.period_number),
    SAT: periods.filter((row) => row.day === 'SAT').sort((a, b) => a.period_number - b.period_number),
  }), [periods]);
  const periodNumbers = [...new Set(periods.map((row) => row.period_number))].sort((a, b) => a - b);

  function change<K extends EditorKey>(index: number, key: K, value: EditorRow[K]) { setRows((current) => current.map((row, position) => position === index ? { ...row, [key]: value } : row)); }
  function add() { const row = newRow(); row.periodNumber = rows.length ? Math.min(12, Math.max(...rows.map((item) => Number(item.periodNumber) || 0)) + 1) : 1; setRows((current) => [...current, row]); setEditing(true); }

  return <div className="animate-fade-up">
    <SectionHeader title="🗓️ Timetable" sub={canEdit ? 'Build class schedules with Teacher conflict checks' : 'View the School timetable'}>{classId && canEdit && <button className="btn-primary" onClick={() => setEditing((value) => !value)}>{editing ? 'View Timetable' : 'Edit Timetable'}</button>}</SectionHeader>
    <div className="card mb-5"><select className="input select w-full max-w-xs" value={classId} onChange={(e) => { setClassId(e.target.value); setEditing(false); }}><option value="">Select a class</option>{(classesQ.data || []).map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>Class {schoolClass.class_name}-{schoolClass.section}</option>)}</select></div>
    {!classId && <div className="card text-center py-12"><div className="text-4xl mb-2">🗓️</div><b>Select a class to view its timetable</b></div>}
    {classId && q.isLoading && <TableSkeleton rows={6} cols={7} />}
    {classId && !q.isLoading && editing && canEdit && <div className="card"><div className="flex justify-between items-center mb-4"><h3 className="font-display font-bold" style={{ color: 'var(--navy)' }}>Timetable Editor</h3><button className="btn-ghost text-xs" onClick={add}>+ Add Period</button></div><div className="space-y-2">{rows.map((row, i) => <div key={i} className="grid md:grid-cols-[90px_85px_95px_95px_1fr_1fr_110px_80px] gap-2 items-center p-2 rounded-xl" style={{ background: '#F7F8FA' }}><select className="input select" value={row.day} onChange={(e) => change(i, 'day', e.target.value as Day)}>{DAYS.map((day) => <option key={day}>{day}</option>)}</select><input type="number" min="1" max="12" className="input" value={row.periodNumber} onChange={(e) => change(i, 'periodNumber', Number(e.target.value))} /><input type="time" className="input" value={row.startTime} onChange={(e) => change(i, 'startTime', e.target.value)} /><input type="time" className="input" value={row.endTime} onChange={(e) => change(i, 'endTime', e.target.value)} />{row.isBreak ? <input className="input" placeholder="Break label" value={row.breakLabel} onChange={(e) => change(i, 'breakLabel', e.target.value)} /> : <select className="input select" value={row.subjectCode} onChange={(e) => change(i, 'subjectCode', e.target.value)}><option value="">Subject</option>{(subjectsQ.data || []).map((subject) => <option key={subject.code} value={subject.code}>{subject.name}</option>)}</select>}{row.isBreak ? <div /> : <select className="input select" value={row.teacherId} onChange={(e) => change(i, 'teacherId', e.target.value)}><option value="">Teacher</option>{(teachersQ.data || []).filter((teacher) => teacher.status === 'ACTIVE').map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select>}<label className="text-xs flex gap-1 items-center"><input type="checkbox" checked={row.isBreak} onChange={(e) => change(i, 'isBreak', e.target.checked)} /> Break</label><button className="text-xs font-bold" style={{ color: '#C62828' }} onClick={() => setRows((current) => current.filter((_, position) => position !== i))}>Remove</button></div>)}</div>{!rows.length && <div className="py-8 text-center" style={{ color: 'var(--slate)' }}>No periods. Add the first period to build this timetable.</div>}<button className="btn-primary mt-4" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save Timetable'}</button></div>}
    {classId && !q.isLoading && !editing && <div className="card overflow-x-auto">{!periods.length ? <div className="text-center py-12"><div className="text-4xl mb-2">🗓️</div><b>No timetable configured yet</b>{canEdit && <div><button className="btn-primary mt-4" onClick={() => { setRows([]); setEditing(true); setTimeout(add, 0); }}>Create Timetable</button></div>}</div> : <table className="w-full text-sm" style={{ minWidth: 700 }}><thead><tr><th className="p-2 text-left" style={{ background: '#F8F9FC' }}>Period</th>{DAYS.map((day) => <th key={day} className="p-2 text-center" style={{ background: '#F8F9FC' }}>{DAY[day]}</th>)}</tr></thead><tbody>{periodNumbers.map((number) => <tr key={number}><td className="p-2" style={{ borderBottom: '1px solid var(--border)' }}><b>{number}</b><div className="text-xs" style={{ color: 'var(--slate)' }}>{periods.find((period) => period.period_number === number)?.start_time?.slice(0, 5)}–{periods.find((period) => period.period_number === number)?.end_time?.slice(0, 5)}</div></td>{DAYS.map((day) => { const period = byDay[day].find((item) => item.period_number === number); return <td key={day} className="p-2 text-center" style={{ borderBottom: '1px solid var(--border)' }}>{period ? period.is_break ? <span className="text-xs" style={{ color: 'var(--slate)' }}>— {period.break_label || 'Break'} —</span> : <div className="rounded-lg px-2 py-1.5 text-xs" style={{ background: 'var(--saffron-pale)', color: 'var(--navy)' }}><b>{period.subject || period.subject_code}</b><div style={{ color: 'var(--slate)' }}>{period.teacher_name || 'Unassigned'}</div></div> : '—'}</td>; })}</tr>)}</tbody></table>}</div>}
  </div>;
}
