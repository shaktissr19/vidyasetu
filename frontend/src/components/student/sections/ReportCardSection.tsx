'use client';

import { useQuery } from '@tanstack/react-query';
import { getReportCard } from '@/services/studentService';
import styles from '../StudentPortal.module.css';

const data = r => r?.data?.data;
const err = e => e?.response?.data?.error?.message || e?.message || 'Report card could not be loaded';
const SUBJECT = { MATH: 'Mathematics', SCI: 'Science', ENG: 'English', HIN: 'Hindi', SST: 'Social Science', SAN: 'Sanskrit' };

function grade(percent) {
  if (percent >= 90) return 'A+';
  if (percent >= 80) return 'A';
  if (percent >= 70) return 'B+';
  if (percent >= 60) return 'B';
  if (percent >= 50) return 'C';
  if (percent >= 33) return 'D';
  return 'F';
}

export default function ReportCardSection({ student }) {
  const reportQuery = useQuery({
    queryKey: ['student-report-card', student?.academicYear],
    queryFn: async () => data(await getReportCard(null, student?.academicYear)),
    enabled: !!student,
  });

  const report = reportQuery.data;
  const results = report?.results || [];
  const totalObtained = results.reduce((sum, r) => sum + Number(r.marks_obtained || 0), 0);
  const totalMax = results.reduce((sum, r) => sum + Number(r.max_marks || 0), 0);
  const overall = totalMax ? (totalObtained / totalMax) * 100 : 0;

  return (
    <>
      <div className={styles.sectionHeader}>
        <div><h1 className={styles.title}>📄 Report Card</h1><div className={styles.subtitle}>Scored school tests and academic-year attendance from PostgreSQL.</div></div>
        <button className={styles.primary} onClick={() => window.print()}>📥 Print / Save PDF</button>
      </div>

      {reportQuery.isLoading && <div className={styles.loading}>Preparing report card…</div>}
      {reportQuery.isError && <div className={styles.error}>{err(reportQuery.error)}</div>}
      {report && (
        <div className={styles.report}>
          <div className={styles.reportHead}>
            <div className={styles.muted}>{report.student.school_name}{report.student.udise_code ? ` · UDISE: ${report.student.udise_code}` : ''}</div>
            <div className={styles.reportTitle}>Progress Report — Academic Year {report.academicYear}</div>
          </div>
          <div className={styles.studentInfo}>
            <div><div className={styles.infoLabel}>STUDENT NAME</div><div className={styles.infoValue}>{report.student.name}</div></div>
            <div><div className={styles.infoLabel}>CLASS / SECTION</div><div className={styles.infoValue}>{report.student.class_name}-{report.student.section}</div></div>
            <div><div className={styles.infoLabel}>ROLL NUMBER</div><div className={styles.infoValue}>{report.student.roll_number || '—'}</div></div>
            <div><div className={styles.infoLabel}>ATTENDANCE</div><div className={styles.infoValue}>{report.attendance?.percentage != null ? `${Number(report.attendance.percentage).toFixed(1)}%` : '—'}</div></div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead><tr><th>Exam</th><th>Subject</th><th>Date</th><th>Max Marks</th><th>Marks</th><th>Grade</th><th>School Rank</th></tr></thead>
              <tbody>
                {results.map(r => {
                  const max = Number(r.max_marks || 0);
                  const obtained = Number(r.marks_obtained || 0);
                  const pct = max ? (obtained / max) * 100 : 0;
                  const codes = r.subject_codes || [];
                  return <tr key={r.exam_id}><td>{r.exam_name}</td><td>{codes.map(c => SUBJECT[c] || c).join(', ') || 'General'}</td><td>{new Date(r.start_time).toLocaleDateString('en-IN')}</td><td>{max}</td><td><b>{obtained}</b></td><td className={styles.grade}>{grade(pct)}</td><td>{r.rank_school ? `#${r.rank_school}` : '—'}</td></tr>;
                })}
                {results.length > 0 && <tr><td><b>Overall</b></td><td>—</td><td>—</td><td><b>{totalMax}</b></td><td><b>{totalObtained}</b></td><td className={styles.grade}>{grade(overall)}</td><td>—</td></tr>}
              </tbody>
            </table>
          </div>
          {!results.length && <div className={styles.empty}>No scored school tests are available for {report.academicYear} yet.</div>}

          <div className={styles.twoCol} style={{ marginTop: 20 }}>
            <div className={styles.card} style={{ boxShadow: 'none', margin: 0 }}><div className={styles.cardTitle}>📅 Attendance Summary</div><div className={styles.muted}>Working days: {report.attendance?.working_days || 0}<br />Present: {report.attendance?.present_days || 0}<br />Absent: {report.attendance?.absent_days || 0}<br />Late: {report.attendance?.late_days || 0}</div></div>
            <div className={styles.card} style={{ boxShadow: 'none', margin: 0 }}><div className={styles.cardTitle}>🎯 Academic Summary</div><div style={{ fontFamily: "'Baloo 2',cursive", fontSize: 34, fontWeight: 800, color: '#138808' }}>{results.length ? `${overall.toFixed(1)}%` : '—'}</div><div className={styles.muted}>{results.length} scored school tests · Grade {results.length ? grade(overall) : '—'}</div></div>
          </div>
        </div>
      )}
    </>
  );
}
