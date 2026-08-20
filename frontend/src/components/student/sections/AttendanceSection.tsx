'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAttendance } from '@/services/studentService';
import styles from '../StudentPortal.module.css';

const data = r => r?.data?.data;
const err = e => e?.response?.data?.error?.message || e?.message || 'Attendance could not be loaded';

export default function AttendanceSection() {
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const year = cursor.getFullYear();
  const month = cursor.getMonth() + 1;

  const attendanceQuery = useQuery({
    queryKey: ['attendance', year, month],
    queryFn: async () => data(await getAttendance(year, month)),
  });

  const monthName = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(cursor);
  const summary = attendanceQuery.data?.summary || {};
  const recordMap = useMemo(() => Object.fromEntries(
    (attendanceQuery.data?.records || []).map(r => [String(r.date).slice(0, 10), r])
  ), [attendanceQuery.data]);

  const calendarCells = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const days = new Date(year, month, 0).getDate();
    const mondayIndex = (first.getDay() + 6) % 7;
    const cells = Array.from({ length: mondayIndex }, () => null);
    for (let d = 1; d <= days; d += 1) {
      const date = new Date(year, month - 1, d);
      const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, date, record: recordMap[key] });
    }
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [year, month, recordMap]);

  function moveMonth(delta) {
    setCursor(new Date(year, month - 1 + delta, 1));
  }

  function dayClass(record, date) {
    if (!date) return '';
    if (record?.status === 'PRESENT') return styles.present;
    if (record?.status === 'ABSENT') return styles.absent;
    if (record?.status === 'LATE' || record?.status === 'HALF_DAY') return styles.late;
    if (record?.status === 'HOLIDAY' || [0, 6].includes(date.getDay())) return styles.holiday;
    return '';
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <div><h1 className={styles.title}>📅 Attendance</h1><div className={styles.subtitle}>Daily records and monthly summary from your school attendance register.</div></div>
        <div style={{ display: 'flex', gap: 8 }}><button className={styles.secondary} onClick={() => moveMonth(-1)}>←</button><button className={styles.secondary} onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Current Month</button><button className={styles.secondary} onClick={() => moveMonth(1)}>→</button></div>
      </div>

      {attendanceQuery.isError && <div className={styles.error}>{err(attendanceQuery.error)}</div>}
      <div className={styles.statGrid}>
        <div className={styles.stat} style={{ '--accent': '#138808' }}><div className={styles.statLabel}>Present</div><div className={styles.statValue}>{summary.present_days || 0}</div><div className={styles.statSub}>{monthName}</div></div>
        <div className={styles.stat} style={{ '--accent': '#ef4444' }}><div className={styles.statLabel}>Absent</div><div className={styles.statValue}>{summary.absent_days || 0}</div><div className={styles.statSub}>{monthName}</div></div>
        <div className={styles.stat} style={{ '--accent': '#f5c518' }}><div className={styles.statLabel}>Late / Half Day</div><div className={styles.statValue}>{Number(summary.late_days || 0) + Number(summary.half_days || 0)}</div><div className={styles.statSub}>Recorded exceptions</div></div>
        <div className={styles.stat} style={{ '--accent': '#0d1b3e' }}><div className={styles.statLabel}>Attendance %</div><div className={styles.statValue}>{summary.percentage != null ? `${Number(summary.percentage).toFixed(0)}%` : '—'}</div><div className={styles.statSub}>{summary.working_days || 0} working days</div></div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>{monthName}</div>
        {attendanceQuery.isLoading ? <div className={styles.loading}>Loading calendar…</div> : (
          <div className={styles.calendarWrap}>
            <div className={styles.calendar}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div className={styles.calHead} key={d}>{d}</div>)}
              {calendarCells.map((cell, index) => cell ? (
                <div className={`${styles.calDay} ${dayClass(cell.record, cell.date)}`} key={`${cell.day}-${index}`}>
                  <div className={styles.calNum}>{cell.day}</div>
                  <div className={styles.calStatus}>{cell.record?.status ? cell.record.status.replace('_', ' ') : ([0, 6].includes(cell.date.getDay()) ? 'Weekend' : '—')}</div>
                  {cell.record?.remark && <div style={{ fontSize: 9, marginTop: 3, color: '#667085' }}>{cell.record.remark}</div>}
                </div>
              ) : <div key={`blank-${index}`} />)}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
