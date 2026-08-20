'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getResultDetail, getResults } from '@/services/schoolService';
import { SectionHeader, StatCard, TableSkeleton } from '@/components/ui/index';
import useLanguageStore from '@/store/languageStore';

const errorText = e => e?.response?.data?.error?.message || e?.message || 'Request failed';

function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function SchoolResultsPage() {
  const { t } = useLanguageStore();
  const [selectedExamId, setSelectedExamId] = useState('');

  const resultsQ = useQuery({
    queryKey: ['school-results'],
    queryFn: () => getResults().then(r => r.data.data || []),
  });
  const detailQ = useQuery({
    queryKey: ['school-result-detail', selectedExamId],
    queryFn: () => getResultDetail(selectedExamId).then(r => r.data.data),
    enabled: !!selectedExamId,
  });

  const results = resultsQ.data || [];
  const detail = detailQ.data;
  const grouped = useMemo(() => {
    const map = new Map();
    results.forEach(row => {
      if (!map.has(row.exam_id)) map.set(row.exam_id, { examId: row.exam_id, examName: row.exam_name, rows: [] });
      map.get(row.exam_id).rows.push(row);
    });
    return [...map.values()];
  }, [results]);

  const totals = useMemo(() => {
    const attempts = results.reduce((sum, r) => sum + Number(r.total_attempts || 0), 0);
    const passes = results.reduce((sum, r) => sum + Number(r.pass_count || 0), 0);
    const weighted = results.reduce((sum, r) => sum + Number(r.avg_score || 0) * Number(r.total_attempts || 0), 0);
    return {
      attempts,
      passRate: attempts ? Math.round((passes / attempts) * 100) : 0,
      average: attempts ? Math.round(weighted / attempts) : 0,
      exams: grouped.length,
    };
  }, [results, grouped.length]);

  function exportSummary() {
    downloadCsv('school-results-summary.csv', [
      ['Exam', 'Class', 'Section', 'Average %', 'Pass Count', 'Attempts'],
      ...results.map(r => [r.exam_name, r.class_name, r.section, r.avg_score, r.pass_count, r.total_attempts]),
    ]);
  }

  function exportDetail() {
    if (!detail) return;
    downloadCsv(`${detail.exam.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-results.csv`, [
      ['Student ID', 'Roll Number', 'Student', 'Class', 'Section', 'Marks', 'Percentage', 'Correct', 'Wrong', 'Skipped', 'School Rank', 'Submitted At'],
      ...(detail.students || []).map(s => [s.student_code, s.roll_number, s.name, s.class_name, s.section, s.total_marks, s.percentage, s.correct_count, s.wrong_count, s.skipped_count, s.rank_school, s.submitted_at]),
    ]);
  }

  if (resultsQ.isError) return <div className="card" style={{ color: '#C62828' }}>{errorText(resultsQ.error)}</div>;

  return (
    <div className="animate-fade-up">
      <SectionHeader title={`📊 ${t('परिणाम', 'Results & Report Cards')}`} sub={t('स्कूल परीक्षाओं का प्रदर्शन और छात्रवार परिणाम', 'School exam performance and student-level results')}>
        <button className="btn-outline text-sm" disabled={!results.length} onClick={exportSummary}>📤 {t('एक्सपोर्ट', 'Export Summary')}</button>
        <button className="btn-primary text-sm" disabled={!detail} onClick={() => window.print()}>🖨️ {t('प्रिंट', 'Print Current Result')}</button>
      </SectionHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="School Exams" value={totals.exams} sub="with scored results" accent="var(--navy)" />
        <StatCard label="Attempts" value={totals.attempts} sub="scored submissions" accent="var(--saffron)" />
        <StatCard label="Average" value={`${totals.average}%`} sub="weighted school average" accent="var(--gold)" />
        <StatCard label="Pass Rate" value={`${totals.passRate}%`} sub="33% threshold" accent="var(--forest)" />
      </div>

      <div className="card mb-5">
        {resultsQ.isLoading ? <TableSkeleton rows={6} cols={6} /> : grouped.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-4xl mb-3">📊</div>
            <p className="font-display font-bold" style={{ color: 'var(--navy)' }}>{t('कोई परिणाम नहीं', 'No scored School exam results yet')}</p>
            <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Create and run a School Test from the Exams section; scored submissions will appear here automatically.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Exam</th><th>Class</th><th>Avg Score</th><th>Pass %</th><th>Attempts</th><th>Action</th></tr></thead>
              <tbody>
                {results.map((r, i) => {
                  const passPct = Number(r.total_attempts) ? Math.round((Number(r.pass_count) / Number(r.total_attempts)) * 100) : 0;
                  return <tr key={`${r.exam_id}-${r.class_name}-${r.section}-${i}`}>
                    <td className="font-semibold">{r.exam_name}</td>
                    <td>Class {r.class_name}{r.section ? `-${r.section}` : ''}</td>
                    <td><span style={{ color: Number(r.avg_score) >= 75 ? 'var(--forest)' : Number(r.avg_score) >= 50 ? 'var(--saffron)' : '#C62828', fontWeight: 700 }}>{Number(r.avg_score || 0).toFixed(1)}%</span></td>
                    <td style={{ color: passPct >= 80 ? 'var(--forest)' : 'var(--saffron)', fontWeight: 700 }}>{passPct}%</td>
                    <td>{r.total_attempts}</td>
                    <td><button className="text-xs font-semibold px-3 py-1 rounded-lg" style={{ background: 'var(--saffron-pale)', color: 'var(--saffron)' }} onClick={() => setSelectedExamId(r.exam_id)}>View Students</button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedExamId && (
        <div className="card" id="school-result-detail">
          {detailQ.isLoading ? <TableSkeleton rows={8} cols={8} /> : detailQ.isError ? (
            <div style={{ color: '#C62828' }}>{errorText(detailQ.error)}</div>
          ) : detail ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>{detail.exam.title}</h3>
                  <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Max marks: {Number(detail.exam.total_questions) * Number(detail.exam.marks_per_question)} · Status: {detail.exam.status}</p>
                </div>
                <div className="flex gap-2">
                  <button className="btn-outline text-xs" onClick={exportDetail}>📥 Export Student Results</button>
                  <button className="btn-ghost text-xs" onClick={() => setSelectedExamId('')}>Close</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>Rank</th><th>Student</th><th>Student ID</th><th>Class</th><th>Marks</th><th>%</th><th>Correct</th><th>Wrong</th><th>Skipped</th></tr></thead>
                  <tbody>
                    {(detail.students || []).map((s, index) => <tr key={s.student_id}>
                      <td className="font-bold">{s.rank_school || index + 1}</td>
                      <td className="font-semibold">{s.name}<div className="text-xs font-normal" style={{ color: 'var(--slate)' }}>Roll {s.roll_number || '—'}</div></td>
                      <td className="font-mono text-xs">{s.student_code}</td>
                      <td>{s.class_name}-{s.section}</td>
                      <td className="font-bold">{s.total_marks}</td>
                      <td style={{ color: Number(s.percentage) >= 75 ? 'var(--forest)' : Number(s.percentage) >= 33 ? 'var(--saffron)' : '#C62828', fontWeight: 700 }}>{Number(s.percentage || 0).toFixed(1)}%</td>
                      <td style={{ color: 'var(--forest)' }}>{s.correct_count}</td>
                      <td style={{ color: '#C62828' }}>{s.wrong_count}</td>
                      <td>{s.skipped_count}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
