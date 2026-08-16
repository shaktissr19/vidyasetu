'use client';
import { useQuery } from '@tanstack/react-query';
import { getResults } from '@/services/schoolService';
import { SectionHeader, TableSkeleton } from '@/components/ui/index';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

export default function ResultsPage() {
  const { t } = useLanguageStore();
  const { data: results = [], isLoading } = useQuery({
    queryKey: ['school-results'],
    queryFn:  () => getResults().then(r => r.data.data),
  });

  return (
    <div className="animate-fade-up">
      <SectionHeader title={`📊 ${t('परिणाम', 'Results & Report Cards')}`}>
        <button className="btn-primary" onClick={() => toast('📄 Generating PDF report cards for all students...')}>
          📥 {t('सभी रिपोर्ट कार्ड', 'Generate All Report Cards')}
        </button>
      </SectionHeader>
      <div className="card">
        {isLoading ? <TableSkeleton rows={6} cols={5} /> : results.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-4xl mb-3">📊</div>
            <p className="font-display font-bold" style={{ color: 'var(--navy)' }}>{t('कोई परिणाम नहीं', 'No results published yet')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('कक्षा', 'Class')}</th>
                  <th>{t('परीक्षा', 'Exam')}</th>
                  <th>{t('औसत अंक', 'Avg Score')}</th>
                  <th>{t('उत्तीर्ण', 'Pass %')}</th>
                  <th>{t('कुल', 'Total Attempts')}</th>
                  <th>{t('कार्रवाई', 'Action')}</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const passPct = r.total_attempts > 0 ? Math.round((r.pass_count / r.total_attempts) * 100) : 0;
                  return (
                    <tr key={i}>
                      <td className="font-semibold">Class {r.class_name}{r.section ? `-${r.section}` : ''}</td>
                      <td>{r.exam_name}</td>
                      <td>
                        <span style={{ color: r.avg_score >= 75 ? 'var(--forest)' : r.avg_score >= 50 ? 'var(--saffron)' : '#C62828', fontWeight: 700 }}>
                          {r.avg_score}%
                        </span>
                      </td>
                      <td style={{ color: passPct >= 90 ? 'var(--forest)' : 'var(--saffron)', fontWeight: 700 }}>{passPct}%</td>
                      <td>{r.total_attempts}</td>
                      <td>
                        <button className="text-xs font-semibold px-3 py-1 rounded-lg"
                          style={{ background: 'var(--saffron-pale)', color: 'var(--saffron)' }}
                          onClick={() => toast('Viewing detailed results...')}>
                          {t('देखें', 'View')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
