'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAttendance, type StudentAttendanceData } from '@/services/studentService';
import { apiErrorText } from '@/utils/errors';
import type { AttendanceRecord, AttendanceSummary } from '@/types/api';
import type { StudentSectionProps } from '@/types/studentPortal';
import styles from '../StudentPortal.module.css';

interface CalendarCell {
  day: number;
  date: Date;
  record?: AttendanceRecord;
}

export default function AttendanceSection(_props: StudentSectionProps) {
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const year = cursor.getFullYear();
  const month = cursor.getMonth() + 1;

  const attendanceQuery = useQuery<StudentAttendanceData>({
    queryKey: ['attendance', year, month],
    queryFn: async () => (await getAttendance(year, month)).data.data,
  });

  const monthName = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(cursor);
  const summary: AttendanceSummary = attendanceQuery.data?.summary || {};
  const recordMap = useMemo<Record<string, AttendanceRecord>>(() => Object.fromEntries(
    (attendanceQuery.data?.records || []).map(record => [String(record.date || '').slice(0, 10), record])
  ), [attendanceQuery.data]);

  const calendarCells = useMemo<Array<CalendarCell | null>>(() => {
    const first = new Date(year, month - 1, 1);
    const days = new Date(year, month, 0).getDate();
    const mondayIndex = (first.getDay() + 6) % 7;
    const cells: Array<CalendarCell | null> = Array.from({ length: mondayIndex }, () => null);
    for (let day = 1; day <= days; day += 1) {
      const date = new Date(year, month - 1, day);
      const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ day, date, record: recordMap[key] });
    }
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [year, month, recordMap]);

  function moveMonth(delta: number): void {
    setCursor(new Date(year, month - 1 + delta, 1));
  }

  function dayClass(record: AttendanceRecord | undefined, date: Date): string {
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

      {attendanceQuery.isError && <div className={styles.error}>{apiErrorText(attendanceQuery.error, 'Attendance could not be loaded')}</div>}
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
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div className={styles.calHead} key={day}>{day}</div>)}
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
