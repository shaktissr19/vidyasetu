'use client';

import { useQuery } from '@tanstack/react-query';
import { getReportCard } from '@/services/studentService';
import { apiErrorText } from '@/utils/errors';
import type { StudentSectionProps } from '@/types/studentPortal';
import styles from '../StudentPortal.module.css';

const SUBJECT: Record<string, string> = { MATH: 'Mathematics', SCI: 'Science', ENG: 'English', HIN: 'Hindi', SST: 'Social Science', SAN: 'Sanskrit' };

interface PortalReportResult {
  exam_id: string;
  exam_name?: string | null;
  subject_codes?: string[];
  start_time?: string | null;
  marks_obtained?: string | number | null;
  max_marks?: string | number | null;
  rank_school?: string | number | null;
}

interface PortalReport {
  academicYear?: string | null;
  student: {
    name?: string | null;
    school_name?: string | null;
    udise_code?: string | null;
    class_name?: string | null;
    section?: string | null;
    roll_number?: string | number | null;
  };
  attendance?: {
    percentage?: string | number | null;
    working_days?: string | number | null;
    present_days?: string | number | null;
    absent_days?: string | number | null;
    late_days?: string | number | null;
  };
  results?: PortalReportResult[];
}

function grade(percent: number): string {
  if (percent >= 90) return 'A+';
  if (percent >= 80) return 'A';
  if (percent >= 70) return 'B+';
  if (percent >= 60) return 'B';
  if (percent >= 50) return 'C';
  if (percent >= 33) return 'D';
  return 'F';
}

export default function ReportCardSection({ student }: StudentSectionProps) {
  const reportQuery = useQuery<PortalReport>({
    queryKey: ['student-report-card', student?.academicYear],
    queryFn: async () => (await getReportCard(null, student?.academicYear)).data.data as PortalReport,
    enabled: Boolean(student),
  });

  const report = reportQuery.data;
  const results = report?.results || [];
  const totalObtained = results.reduce((sum, result) => sum + Number(result.marks_obtained || 0), 0);
  const totalMax = results.reduce((sum, result) => sum + Number(result.max_marks || 0), 0);
  const overall = totalMax ? (totalObtained / totalMax) * 100 : 0;

  return (
    <>
      <div className={styles.sectionHeader}>
        <div><h1 className={styles.title}>📄 Report Card</h1><div className={styles.subtitle}>Scored school tests and academic-year attendance from PostgreSQL.</div></div>
        <button className={styles.primary} onClick={() => window.print()}>📥 Print / Save PDF</button>
      </div>

      {reportQuery.isLoading && <div className={styles.loading}>Preparing report card…</div>}
      {reportQuery.isError && <div className={styles.error}>{apiErrorText(reportQuery.error, 'Report card could not be loaded')}</div>}
      {report && (
        <div className={styles.report}>
          <div className={styles.reportHead}>
            <div className={styles.muted}>{report.student.school_name}{report.student.udise_code ? ` · UDISE: ${report.student.udise_code}` : ''}</div>
            <div className={styles.reportTitle}>Progress Report — Academic Year {report.academicYear || student?.academicYear || '—'}</div>
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
                {results.map(result => {
                  const max = Number(result.max_marks || 0);
                  const obtained = Number(result.marks_obtained || 0);
                  const pct = max ? (obtained / max) * 100 : 0;
                  const codes = result.subject_codes || [];
                  return <tr key={result.exam_id}><td>{result.exam_name}</td><td>{codes.map(code => SUBJECT[code] || code).join(', ') || 'General'}</td><td>{result.start_time ? new Date(result.start_time).toLocaleDateString('en-IN') : '—'}</td><td>{max}</td><td><b>{obtained}</b></td><td className={styles.grade}>{grade(pct)}</td><td>{result.rank_school ? `#${result.rank_school}` : '—'}</td></tr>;
                })}
                {results.length > 0 && <tr><td><b>Overall</b></td><td>—</td><td>—</td><td><b>{totalMax}</b></td><td><b>{totalObtained}</b></td><td className={styles.grade}>{grade(overall)}</td><td>—</td></tr>}
              </tbody>
            </table>
          </div>
          {!results.length && <div className={styles.empty}>No scored school tests are available for {report.academicYear || student?.academicYear || 'this academic year'} yet.</div>}

          <div className={styles.twoCol} style={{ marginTop: 20 }}>
            <div className={styles.card} style={{ boxShadow: 'none', margin: 0 }}><div className={styles.cardTitle}>📅 Attendance Summary</div><div className={styles.muted}>Working days: {report.attendance?.working_days || 0}<br />Present: {report.attendance?.present_days || 0}<br />Absent: {report.attendance?.absent_days || 0}<br />Late: {report.attendance?.late_days || 0}</div></div>
            <div className={styles.card} style={{ boxShadow: 'none', margin: 0 }}><div className={styles.cardTitle}>🎯 Academic Summary</div><div style={{ fontFamily: "'Baloo 2',cursive", fontSize: 34, fontWeight: 800, color: '#138808' }}>{results.length ? `${overall.toFixed(1)}%` : '—'}</div><div className={styles.muted}>{results.length} scored school tests · Grade {results.length ? grade(overall) : '—'}</div></div>
          </div>
        </div>
      )}
    </>
  );
}
