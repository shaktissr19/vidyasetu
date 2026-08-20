'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getChildren, getChildPerformance, type ParentSubjectPerformance } from '@/services/parentService';
import { SectionHeader } from '@/components/ui/index';
import useLanguageStore from '@/store/languageStore';

const TREND_LABEL: Record<ParentSubjectPerformance['trend'], { label: string; color: string }> = {
  IMPROVING: { label: '↑ Improving', color: 'var(--forest)' },
  STEADY: { label: '→ Steady', color: 'var(--slate)' },
  DECLINING: { label: '↓ Needs attention', color: '#C62828' },
  NEW: { label: 'New', color: 'var(--saffron)' },
};

function scoreAt(subject: ParentSubjectPerformance, index: number) {
  const score = subject.scores[index];
  return score ? `${Math.round(score.percentage)}%` : '—';
}

export default function ParentPerformancePage() {
  const { t } = useLanguageStore();
  const [selectedChild, setSelectedChild] = useState<string | null>(null);

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ['parent-children'],
    queryFn: () => getChildren().then((r) => r.data.data),
  });

  useEffect(() => {
    if (children.length && !selectedChild) setSelectedChild(children[0]?.id || null);
  }, [children, selectedChild]);

  const { data, isLoading } = useQuery({
    queryKey: ['parent-performance', selectedChild],
    queryFn: async () => {
      if (!selectedChild) throw new Error('No child selected');
      return getChildPerformance(selectedChild).then((r) => r.data.data);
    },
    enabled: !!selectedChild,
  });

  return (
    <div className="animate-fade-up">
      <SectionHeader title={`📊 ${t('विस्तृत प्रदर्शन', 'Detailed Performance')}`} />

      {children.length > 0 && (
        <div className="flex gap-2 mb-5 flex-wrap">
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

      {(childrenLoading || isLoading) ? (
        <div className="card"><div className="skeleton h-56 rounded-xl" /></div>
      ) : !data ? (
        <div className="card text-center py-12" style={{ color: 'var(--slate)' }}>{t('कोई बच्चा लिंक नहीं है', 'No linked child available')}</div>
      ) : (
        <div className="card" style={{ borderLeft: '4px solid var(--forest)' }}>
          <div className="flex flex-wrap items-end justify-between gap-2 mb-5">
            <div>
              <h2 className="font-display font-bold text-lg" style={{ color: 'var(--forest)' }}>
                {t('अंतिम 3 परीक्षा स्कोर', 'Last 3 Exam Scores')} — {data.student.name}
              </h2>
              <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>
                {data.student.school_name || t('स्वतंत्र विद्यार्थी', 'Independent student')} · {t('कक्षा', 'Class')} {data.student.class_name}{data.student.section ? `-${data.student.section}` : ''}
              </p>
            </div>
            {data.student.academic_year && <span className="status-badge status-active">{data.student.academic_year}</span>}
          </div>

          {data.subjects.length === 0 ? (
            <div className="text-center py-10" style={{ color: 'var(--slate)' }}>
              {t('अभी तक कोई स्कोर की गई स्कूल परीक्षा नहीं है', 'No scored school tests are available yet')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>{t('विषय', 'Subject')}</th><th>Exam 1</th><th>Exam 2</th><th>{t('नवीनतम', 'Latest')}</th><th>{t('रुझान', 'Trend')}</th></tr></thead>
                <tbody>
                  {data.subjects.map((subject) => {
                    const trend = TREND_LABEL[subject.trend];
                    const latestIndex = Math.max(0, subject.scores.length - 1);
                    return (
                      <tr key={subject.subjectCode}>
                        <td className="font-semibold">{subject.subjectName}</td>
                        <td>{scoreAt(subject, 0)}</td>
                        <td>{scoreAt(subject, subject.scores.length >= 3 ? 1 : -1)}</td>
                        <td><strong>{scoreAt(subject, latestIndex)}</strong></td>
                        <td style={{ color: trend.color, fontWeight: 700 }}>{trend.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
