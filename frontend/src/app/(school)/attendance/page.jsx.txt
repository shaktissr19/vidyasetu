'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getStudents, getClasses, markAttendance, getAttendanceSummary } from '@/services/schoolService';
import { SectionHeader, StatusBadge } from '@/components/ui/index';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = ['PRESENT', 'ABSENT', 'LATE', 'HOLIDAY'];
const STATUS_COLOR   = { PRESENT: 'var(--forest)', ABSENT: '#C62828', LATE: 'var(--saffron)', HOLIDAY: '#9CA3AF' };
const STATUS_LABEL   = { PRESENT: '✓', ABSENT: '✗', LATE: '⏰', HOLIDAY: 'H' };

export default function SchoolAttendancePage() {
  const { t } = useLanguageStore();
  const today = new Date().toISOString().split('T')[0];
  const [date,    setDate]    = useState(today);
  const [classId, setClassId] = useState('');
  const [records, setRecords] = useState({});   // { studentId: 'PRESENT' | 'ABSENT' ... }
  const [tab,     setTab]     = useState('mark'); // 'mark' | 'summary'

  const { data: classesRes } = useQuery({ queryKey: ['school-classes'], queryFn: () => getClasses().then(r => r.data.data) });
  const classes = classesRes || [];

  const { data: studentsRes, isLoading } = useQuery({
    queryKey: ['school-students-att', classId],
    queryFn:  () => getStudents({ classId, limit: 100 }).then(r => r.data.data),
    enabled: !!classId,
  });
  const students = studentsRes || [];

  const { data: summaryRes } = useQuery({
    queryKey: ['attendance-summary', date],
    queryFn:  () => getAttendanceSummary(date).then(r => r.data.data),
    enabled: tab === 'summary',
  });
  const summary = summaryRes || [];

  const markMut = useMutation({
    mutationFn: () => markAttendance({
      classId,
      date,
      records: students.map(s => ({ studentId: s.id, status: records[s.id] || 'PRESENT' })),
    }),
    onSuccess: () => toast.success(`✅ Attendance marked for ${students.length} students! WhatsApp sent to absent parents.`),
    onError:   (err) => toast.error(err.response?.data?.error?.message || 'Failed to mark attendance'),
  });

  function toggleAll(status) {
    const updated = {};
    students.forEach(s => { updated[s.id] = status; });
    setRecords(updated);
  }

  const presentCount = students.filter(s => (records[s.id] || 'PRESENT') === 'PRESENT').length;
  const absentCount  = students.filter(s => (records[s.id] || 'PRESENT') === 'ABSENT').length;

  return (
    <div className="animate-fade-up">
      <SectionHeader title={`📅 ${t('उपस्थिति', 'Attendance')}`}>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--saffron-pale)' }}>
          {[['mark', t('मार्क करें', 'Mark')], ['summary', t('सारांश', 'Summary')]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className="px-4 py-1.5 rounded-lg text-sm font-bold transition-all"
              style={{ background: tab === k ? 'white' : 'transparent', color: tab === k ? 'var(--saffron)' : 'var(--slate)' }}>
              {l}
            </button>
          ))}
        </div>
      </SectionHeader>

      {tab === 'mark' ? (
        <>
          {/* Controls */}
          <div className="card mb-5">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[160px]">
                <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--slate)' }}>{t('दिनांक', 'Date')}</label>
                <input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} className="input" />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--slate)' }}>{t('कक्षा', 'Class')}</label>
                <select value={classId} onChange={e => { setClassId(e.target.value); setRecords({}); }} className="input select w-full">
                  <option value="">{t('कक्षा चुनें', 'Select class')}</option>
                  {classes.map(c => <option key={c.id} value={c.id}>Class {c.class_name}{c.section ? `-${c.section}` : ''} ({c.student_count})</option>)}
                </select>
              </div>
            </div>
          </div>

          {classId && students.length > 0 && (
            <>
              {/* Bulk actions + counts */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="flex gap-2">
                  <button className="btn-ghost text-xs" onClick={() => toggleAll('PRESENT')}>✓ {t('सभी उपस्थित', 'All Present')}</button>
                  <button className="btn-ghost text-xs" onClick={() => toggleAll('ABSENT')}>✗ {t('सभी अनुपस्थित', 'All Absent')}</button>
                </div>
                <div className="ml-auto flex gap-3 text-xs font-bold">
                  <span style={{ color: 'var(--forest)' }}>✓ {presentCount} {t('उपस्थित', 'Present')}</span>
                  <span style={{ color: '#C62828' }}>✗ {absentCount} {t('अनुपस्थित', 'Absent')}</span>
                </div>
              </div>

              {/* Student list */}
              <div className="card">
                <div className="divide-y" style={{ '--tw-divide-opacity': 1 }}>
                  {students.map((s, i) => {
                    const status = records[s.id] || 'PRESENT';
                    return (
                      <div key={s.id} className="flex items-center gap-4 py-3"
                        style={{ borderBottom: i < students.length - 1 ? '1px solid var(--border)' : 'none', animationDelay: `${i * 0.02}s` }}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                          style={{ background: 'var(--saffron-pale)', color: 'var(--saffron)' }}>
                          {s.name?.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate" style={{ color: 'var(--navy)' }}>{s.name}</p>
                          <p className="text-xs" style={{ color: 'var(--slate)' }}>Roll: {s.roll_number || '—'}</p>
                        </div>
                        {/* Status buttons */}
                        <div className="flex gap-1.5 flex-shrink-0">
                          {STATUS_OPTIONS.map(opt => (
                            <button key={opt} onClick={() => setRecords(r => ({ ...r, [s.id]: opt }))}
                              className="w-9 h-9 rounded-lg text-xs font-bold transition-all"
                              style={{
                                background: status === opt ? STATUS_COLOR[opt] : '#F0F4F8',
                                color: status === opt ? 'white' : 'var(--slate)',
                                transform: status === opt ? 'scale(1.1)' : 'scale(1)',
                              }}>
                              {STATUS_LABEL[opt]}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button className="btn-primary w-full justify-center mt-4 py-3 text-base"
                  disabled={markMut.isPending} onClick={() => markMut.mutate()}>
                  {markMut.isPending ? 'Saving...' : `✅ ${t('उपस्थिति सेव करें', 'Save Attendance')} & ${t('अभिभावकों को सूचित करें', 'Notify Parents')}`}
                </button>
              </div>
            </>
          )}

          {classId && isLoading && (
            <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
          )}

          {!classId && (
            <div className="card text-center py-12">
              <div className="text-4xl mb-3">📅</div>
              <p className="font-display font-bold" style={{ color: 'var(--navy)' }}>{t('कक्षा चुनें', 'Select a class to mark attendance')}</p>
            </div>
          )}
        </>
      ) : (
        // Summary tab
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold" style={{ color: 'var(--navy)' }}>{t('आज का सारांश', "Today's Summary")}</h3>
            <input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} className="input w-auto text-sm" />
          </div>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('कक्षा', 'Class')}</th>
                  <th>{t('कुल', 'Total')}</th>
                  <th>{t('उपस्थित', 'Present')}</th>
                  <th>{t('अनुपस्थित', 'Absent')}</th>
                  <th>{t('%', '%')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.map(row => {
                  const pct = row.total_students > 0 ? Math.round((row.present / row.total_students) * 100) : 0;
                  return (
                    <tr key={`${row.class_name}-${row.section}`}>
                      <td className="font-semibold">Class {row.class_name}{row.section ? `-${row.section}` : ''}</td>
                      <td>{row.total_students}</td>
                      <td style={{ color: 'var(--forest)', fontWeight: 700 }}>{row.present || 0}</td>
                      <td style={{ color: '#C62828', fontWeight: 700 }}>{row.absent || 0}</td>
                      <td>
                        <span style={{ color: pct >= 85 ? 'var(--forest)' : 'var(--saffron)', fontWeight: 700 }}>{pct}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
