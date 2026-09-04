'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getChildren, getChildPerformance, type ParentSubjectPerformance } from '@/services/parentService';
import { getParentLearningInsight, type LearningMasteryState } from '@/services/learningVisibilityService';
import ParentDiagnosticPanel from '@/components/learning/ParentDiagnosticPanel';
import { SectionHeader } from '@/components/ui/index';
import useLanguageStore from '@/store/languageStore';
import { apiErrorText } from '@/utils/errors';

const TREND_LABEL: Record<ParentSubjectPerformance['trend'], { label: string; color: string }> = {
  IMPROVING: { label: '↑ Improving', color: 'var(--forest)' },
  STEADY: { label: '→ Steady', color: 'var(--slate)' },
  DECLINING: { label: '↓ Needs attention', color: '#C62828' },
  NEW: { label: 'New', color: 'var(--saffron)' },
};

const MASTERY_LABEL: Record<LearningMasteryState, { label: string; bg: string; color: string }> = {
  NOT_STARTED: { label: 'Not started', bg: '#F4F6F9', color: '#64748B' },
  LEARNING: { label: 'Learning', bg: '#EEF4FF', color: '#2457A6' },
  PRACTISING: { label: 'Practising', bg: '#FFF7E8', color: '#9A6500' },
  NEEDS_REVIEW: { label: 'Needs review', bg: '#FFF0F0', color: '#B42318' },
  MASTERED: { label: 'Mastered', bg: '#ECF8F0', color: '#176B3A' },
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

  const learningQ = useQuery({
    queryKey: ['parent-learning-insight', selectedChild],
    queryFn: async () => {
      if (!selectedChild) throw new Error('No child selected');
      return getParentLearningInsight(selectedChild).then((r) => r.data.data);
    },
    enabled: !!selectedChild,
    staleTime: 20_000,
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

      {selectedChild ? <div className="mt-5"><ParentDiagnosticPanel studentId={selectedChild} /></div> : null}

      <div className="mt-5">
        {learningQ.isLoading ? (
          <div className="card"><div className="skeleton h-64 rounded-xl" /></div>
        ) : learningQ.isError ? (
          <div className="card" style={{ color: '#B42318' }}>{apiErrorText(learningQ.error, 'Could not load concept learning insights')}</div>
        ) : learningQ.data ? (
          <div className="space-y-5">
            <div className="card" style={{ borderLeft: '4px solid var(--saffron)' }}>
              <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                <div>
                  <h2 className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>🧭 {t('कॉन्सेप्ट लर्निंग इनसाइट्स', 'Concept Learning Insights')}</h2>
                  <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{learningQ.data.headline}</p>
                </div>
                <span className="text-xs px-3 py-1.5 rounded-full font-bold" style={{ background: '#F4F6F9', color: 'var(--slate)' }}>{t('केवल देखने के लिए', 'Read only')}</span>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl" style={{ background: '#FFF0F0' }}><div className="text-2xl font-black" style={{ color: '#B42318' }}>{learningQ.data.summary.needsReview}</div><div className="text-xs">Needs review</div></div>
                <div className="p-3 rounded-xl" style={{ background: '#FFF7E8' }}><div className="text-2xl font-black" style={{ color: '#9A6500' }}>{learningQ.data.summary.practising}</div><div className="text-xs">Practising</div></div>
                <div className="p-3 rounded-xl" style={{ background: '#EEF4FF' }}><div className="text-2xl font-black" style={{ color: '#2457A6' }}>{learningQ.data.summary.learning}</div><div className="text-xs">Learning</div></div>
                <div className="p-3 rounded-xl" style={{ background: '#ECF8F0' }}><div className="text-2xl font-black" style={{ color: '#176B3A' }}>{learningQ.data.summary.mastered}</div><div className="text-xs">Mastered</div></div>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-5">
              <div className="card">
                <h3 className="font-display font-bold mb-3" style={{ color: 'var(--navy)' }}>{t('अभी किन कॉन्सेप्ट पर ध्यान है', 'Current concept focus')}</h3>
                {learningQ.data.focusConcepts.length === 0 ? <div className="text-sm py-8 text-center" style={{ color: 'var(--slate)' }}>No concept learning evidence is available yet.</div> : (
                  <div className="space-y-2.5">
                    {learningQ.data.focusConcepts.map((concept) => {
                      const meta = MASTERY_LABEL[concept.state];
                      return (
                        <div key={concept.conceptId} className="p-3 rounded-xl" style={{ border: '1px solid var(--border)' }}>
                          <div className="flex items-start justify-between gap-3"><div><b>{concept.name}</b><div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{concept.subjectName || concept.subjectCode}{concept.chapterTitle ? ` · ${concept.chapterTitle}` : ''}</div></div><span className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span></div>
                          <div className="text-xs mt-2" style={{ color: 'var(--slate)' }}>Lesson progress {Math.round(concept.resourceCompletionPct)}%{concept.practiceBestPct !== null && concept.practiceBestPct !== undefined ? ` · Practice best ${Math.round(concept.practiceBestPct)}%` : ''}{concept.masteryPct !== null && concept.masteryPct !== undefined ? ` · Mastery ${Math.round(concept.masteryPct)}%` : ''}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="card">
                <h3 className="font-display font-bold mb-3" style={{ color: 'var(--navy)' }}>{t('अगले सीखने के कदम', 'Next learning steps')}</h3>
                {learningQ.data.nextActions.length === 0 ? <div className="text-sm py-8 text-center" style={{ color: 'var(--slate)' }}>No published mapped next action is available yet.</div> : (
                  <div className="space-y-3">
                    {learningQ.data.nextActions.map((action) => (
                      <div key={`${action.rank}-${action.conceptCode}`} className="p-3 rounded-xl" style={{ background: action.urgency === 'HIGH' ? '#FFF7F4' : '#F7F9FC', border: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between gap-2"><b>{action.rank}. {action.title}</b><span className="text-xs font-bold">~{action.estimatedMinutes} min</span></div>
                        <div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{action.subjectName || action.subjectCode} · {action.conceptName}</div>
                        <p className="text-sm mt-2" style={{ color: 'var(--slate)' }}>{action.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-xs mt-4 p-3 rounded-xl" style={{ background: '#FFF8EE', color: '#7A4E00' }}>
                  {t('यह मार्गदर्शन माता-पिता के लिए है। सीखने का कार्य छात्र अपने VidyaSetu खाते में पूरा करता है।', 'This is parent guidance. Learning actions are completed by the Student in their own VidyaSetu account.')}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}