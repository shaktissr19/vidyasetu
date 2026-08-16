'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getReportCard } from '@/services/studentService';
import { CardSkeleton } from '@/components/ui/index';
import { gradeFromScore, formatDate } from '@/utils/formatters';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

export default function ReportCardPage() {
  const { t } = useLanguageStore();
  const [term, setTerm] = useState(2);

  const { data, isLoading } = useQuery({
    queryKey: ['report-card', term],
    queryFn:  () => getReportCard(term, '2025-26').then(r => r.data.data),
  });

  const student   = data?.student   || {};
  const results   = data?.results   || [];
  const attendance = data?.attendance || {};

  const total     = results.reduce((s, r) => s + (r.score || 0), 0);
  const maxTotal  = results.reduce((s, r) => s + 100, 0);
  const overallPct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--navy)' }}>
          📄 {t('रिपोर्ट कार्ड', 'Report Card')}
        </h1>
        <div className="flex gap-2">
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--saffron-pale)' }}>
            {[1, 2, 3].map(n => (
              <button key={n} onClick={() => setTerm(n)}
                className="px-3 py-1.5 rounded-lg text-sm font-bold transition-all"
                style={{ background: term === n ? 'white' : 'transparent', color: term === n ? 'var(--saffron)' : 'var(--slate)' }}>
                {t(`टर्म ${n}`, `Term ${n}`)}
              </button>
            ))}
          </div>
          <button className="btn-primary" onClick={() => toast('📥 Downloading report card PDF...')}>
            📥 {t('PDF', 'PDF')}
          </button>
        </div>
      </div>

      {isLoading ? <CardSkeleton /> : (
        <div className="card max-w-2xl" style={{ border: '2px solid var(--navy)' }}>
          {/* Header */}
          <div className="text-center pb-4 mb-4" style={{ borderBottom: '2px solid var(--navy)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--slate)' }}>{student.school_name}</p>
            <h2 className="font-display font-extrabold text-xl mt-1" style={{ color: 'var(--navy)' }}>
              {t('प्रगति पत्रक', 'Progress Report Card')} — {t(`टर्म ${term}`, `Term ${term}`)}, 2025–26
            </h2>
          </div>

          {/* Student info */}
          <div className="grid grid-cols-2 gap-3 mb-5 text-sm">
            {[
              [t('छात्र का नाम', 'Student Name'), student.name],
              [t('कक्षा / अनुभाग', 'Class / Section'), student.class_name && `${student.class_name}-${student.section}`],
              [t('रोल नंबर', 'Roll Number'), student.roll_number],
              [t('उपस्थिति', 'Attendance'), `${attendance.pct || 0}% (${t('अच्छा', 'Good')})`],
            ].map(([l, v]) => (
              <div key={l}>
                <span className="text-xs font-semibold" style={{ color: 'var(--slate)' }}>{l}</span>
                <p className="font-bold mt-0.5" style={{ color: 'var(--navy)' }}>{v || '—'}</p>
              </div>
            ))}
          </div>

          {/* Results table */}
          {results.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--slate)' }}>
              {t('इस टर्म के परिणाम अभी उपलब्ध नहीं हैं', 'Results not available for this term yet')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t('विषय', 'Subject')}</th>
                    <th className="text-right">{t('अंक', 'Marks')}</th>
                    <th className="text-right">{t('ग्रेड', 'Grade')}</th>
                    <th className="text-right">{t('टिप्पणी', 'Remark')}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => {
                    const { grade, color } = gradeFromScore(r.score || 0, 100);
                    return (
                      <tr key={i}>
                        <td className="font-semibold">{r.subject_name || r.exam_name}</td>
                        <td className="text-right font-bold">{r.score || 0}/100</td>
                        <td className="text-right font-extrabold font-display" style={{ color }}>{grade}</td>
                        <td className="text-right text-xs" style={{ color: 'var(--slate)' }}>
                          {r.score >= 90 ? 'Outstanding' : r.score >= 75 ? 'Very Good' : r.score >= 60 ? 'Good' : 'Needs work'}
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: '#F8F9FC', fontWeight: 700 }}>
                    <td className="font-extrabold">{t('कुल', 'Total')}</td>
                    <td className="text-right font-extrabold">{total}/{maxTotal}</td>
                    <td className="text-right font-extrabold font-display" style={{ color: gradeFromScore(total, maxTotal).color }}>
                      {gradeFromScore(total, maxTotal).grade}
                    </td>
                    <td className="text-right text-xs">{t('कक्षा रैंक', 'Class Rank')}: <strong>#{student.classRank || '—'}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-between mt-5 pt-4 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--slate)' }}>
            <span>{t('कक्षा शिक्षक', 'Class Teacher')}: ________</span>
            <span>{t('प्रधानाचार्य', 'Principal')}: ________</span>
          </div>
        </div>
      )}
    </div>
  );
}
