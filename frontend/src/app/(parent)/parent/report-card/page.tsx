'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getChildren, getChildReportCard } from '@/services/parentService';
import { gradeFromScore } from '@/utils/formatters';
import useLanguageStore from '@/store/languageStore';

const SUBJECT_NAMES: Record<string, string> = {
  MATH: 'Mathematics', SCI: 'Science', ENG: 'English', HIN: 'Hindi', SST: 'Social Science', SAN: 'Sanskrit',
};

export default function ParentReportCardPage() {
  const { t } = useLanguageStore();
  const [selectedChild, setSelectedChild] = useState<string | null>(null);

  const { data: children = [] } = useQuery({
    queryKey: ['parent-children'],
    queryFn: () => getChildren().then((r) => r.data.data),
  });

  useEffect(() => {
    if (children.length && !selectedChild) setSelectedChild(children[0]?.id || null);
  }, [children, selectedChild]);

  const { data: report, isLoading } = useQuery({
    queryKey: ['parent-report-card', selectedChild],
    queryFn: async () => {
      if (!selectedChild) throw new Error('No child selected');
      return getChildReportCard(selectedChild).then((r) => r.data.data);
    },
    enabled: !!selectedChild,
  });

  const totalObtained = (report?.results || []).reduce((sum, row) => sum + Number(row.marks_obtained || 0), 0);
  const totalMax = (report?.results || []).reduce((sum, row) => sum + Number(row.max_marks || 0), 0);
  const overall = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
  const overallGrade = gradeFromScore(totalObtained, totalMax || 1);

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5 print:hidden">
        <div>
          <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--forest)' }}>📄 {t('रिपोर्ट कार्ड', 'Report Card')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--slate)' }}>{t('स्कूल परीक्षा और वार्षिक उपस्थिति', 'School tests and annual attendance')}</p>
        </div>
        <button className="btn-green" onClick={() => window.print()}>📥 {t('PDF डाउनलोड करें', 'Download PDF')}</button>
      </div>

      {children.length > 0 && (
        <div className="flex gap-2 mb-5 flex-wrap print:hidden">
          {children.map((child) => (
            <button key={child.id} onClick={() => setSelectedChild(child.id)}
              className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={{
                background: selectedChild === child.id ? 'var(--forest)' : 'white',
                color: selectedChild === child.id ? 'white' : 'var(--slate)',
                border: `1.5px solid ${selectedChild === child.id ? 'var(--forest)' : 'var(--border)'}`,
              }}>
              {child.name.split(' ')[0]} ({t('कक्षा', 'Class')} {child.class_name})
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="card"><div className="skeleton h-80 rounded-xl" /></div>
      ) : report ? (
        <div className="card" style={{ border: '2px solid var(--forest)', borderRadius: 16 }}>
          <div className="text-center pb-5 mb-5" style={{ borderBottom: '2px solid var(--forest)' }}>
            <div className="font-display font-extrabold text-xl" style={{ color: 'var(--navy)' }}>{report.student.school_name}</div>
            {report.student.udise_code && <div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>UDISE: {report.student.udise_code}</div>}
            <div className="font-display font-bold text-lg mt-2" style={{ color: 'var(--forest)' }}>
              {t('प्रगति रिपोर्ट', 'Progress Report')} — {report.academicYear}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <div><div className="text-xs font-bold uppercase" style={{ color: 'var(--slate)' }}>{t('विद्यार्थी', 'Student')}</div><div className="font-semibold mt-1">{report.student.name}</div></div>
            <div><div className="text-xs font-bold uppercase" style={{ color: 'var(--slate)' }}>{t('कक्षा', 'Class')}</div><div className="font-semibold mt-1">{report.student.class_name}{report.student.section ? `-${report.student.section}` : ''}</div></div>
            <div><div className="text-xs font-bold uppercase" style={{ color: 'var(--slate)' }}>{t('रोल नंबर', 'Roll Number')}</div><div className="font-semibold mt-1">{report.student.roll_number || '—'}</div></div>
            <div><div className="text-xs font-bold uppercase" style={{ color: 'var(--slate)' }}>{t('उपस्थिति', 'Attendance')}</div><div className="font-semibold mt-1">{report.attendance?.percentage != null ? `${Number(report.attendance.percentage).toFixed(1)}%` : '—'}</div></div>
          </div>

          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>{t('परीक्षा', 'Exam')}</th><th>{t('विषय', 'Subject')}</th><th>{t('अंक', 'Marks')}</th><th>{t('ग्रेड', 'Grade')}</th><th>{t('स्कूल रैंक', 'School Rank')}</th></tr></thead>
              <tbody>
                {report.results.map((row) => {
                  const marks = Number(row.marks_obtained || 0);
                  const max = Number(row.max_marks || 0);
                  const { grade, color } = gradeFromScore(marks, max || 1);
                  const subjects = (row.subject_codes || []).map((code) => SUBJECT_NAMES[code] || code).join(', ') || t('सामान्य', 'General');
                  return (
                    <tr key={row.exam_id}>
                      <td className="font-semibold">{row.exam_name}</td>
                      <td>{subjects}</td>
                      <td>{marks}/{max}</td>
                      <td style={{ color, fontWeight: 800 }}>{grade}</td>
                      <td>{row.rank_school ? `#${row.rank_school}` : '—'}</td>
                    </tr>
                  );
                })}
                {report.results.length > 0 && (
                  <tr>
                    <td className="font-bold">{t('कुल', 'Overall')}</td><td>—</td><td className="font-bold">{totalObtained}/{totalMax}</td>
                    <td style={{ color: overallGrade.color, fontWeight: 800 }}>{overallGrade.grade}</td><td>—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {report.results.length === 0 && <div className="text-center py-8" style={{ color: 'var(--slate)' }}>{t('अभी कोई स्कूल परीक्षा परिणाम नहीं है', 'No scored school-test results are available yet')}</div>}

          <div className="grid md:grid-cols-2 gap-4 mt-5">
            <div className="rounded-xl p-4" style={{ background: 'var(--forest-pale)' }}>
              <div className="font-display font-bold" style={{ color: 'var(--forest)' }}>📅 {t('उपस्थिति सारांश', 'Attendance Summary')}</div>
              <div className="text-sm mt-2 leading-6" style={{ color: 'var(--slate)' }}>
                {t('कार्य दिवस', 'Working days')}: {report.attendance?.working_days || 0}<br />
                {t('उपस्थित', 'Present')}: {report.attendance?.present_days || 0}<br />
                {t('अनुपस्थित', 'Absent')}: {report.attendance?.absent_days || 0}<br />
                {t('देर', 'Late')}: {report.attendance?.late_days || 0}
              </div>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'var(--saffron-pale)' }}>
              <div className="font-display font-bold" style={{ color: 'var(--saffron)' }}>🎯 {t('शैक्षणिक सारांश', 'Academic Summary')}</div>
              <div className="font-display font-extrabold text-3xl mt-2" style={{ color: 'var(--navy)' }}>{report.results.length ? `${overall.toFixed(1)}%` : '—'}</div>
              <div className="text-sm" style={{ color: 'var(--slate)' }}>{report.results.length} {t('स्कोर की गई परीक्षाएँ', 'scored school tests')}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card text-center py-12" style={{ color: 'var(--slate)' }}>{t('कोई रिपोर्ट उपलब्ध नहीं', 'No report available')}</div>
      )}
    </div>
  );
}
