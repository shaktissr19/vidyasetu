'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SectionHeader } from '@/components/ui/index';
import TeacherDiagnosticPanel from '@/components/learning/TeacherDiagnosticPanel';
import useLanguageStore from '@/store/languageStore';
import {
  getSchoolLearningOverview,
  getSchoolLearningTargets,
  type LearningInsightTarget,
  type LearningMasteryState,
} from '@/services/learningVisibilityService';
import { apiErrorText } from '@/utils/errors';

const STATE_META: Record<LearningMasteryState, { label: string; icon: string; bg: string; color: string }> = {
  NOT_STARTED: { label: 'Not started', icon: '○', bg: '#F4F6F9', color: '#64748B' },
  LEARNING: { label: 'Learning', icon: '📖', bg: '#EEF4FF', color: '#2457A6' },
  PRACTISING: { label: 'Practising', icon: '✍️', bg: '#FFF7E8', color: '#9A6500' },
  NEEDS_REVIEW: { label: 'Needs review', icon: '⚠️', bg: '#FFF0F0', color: '#B42318' },
  MASTERED: { label: 'Mastered', icon: '✅', bg: '#ECF8F0', color: '#176B3A' },
};

function targetLabel(target: LearningInsightTarget): string {
  return `${target.class_name}${target.section ? `-${target.section}` : ''} · ${target.subject_name}`;
}

export default function SchoolLearningInsightsPage() {
  const { t } = useLanguageStore();
  const [targetKey, setTargetKey] = useState('');

  const targetsQ = useQuery({
    queryKey: ['school-learning-insight-targets'],
    queryFn: async () => (await getSchoolLearningTargets()).data.data || [],
    staleTime: 30_000,
  });

  const targets = targetsQ.data || [];
  useEffect(() => {
    if (!targetKey && targets.length) {
      const first = targets[0];
      setTargetKey(`${first.class_id}|${first.subject_code}`);
    }
  }, [targetKey, targets]);

  const selected = useMemo(() => {
    const [classId, subjectCode] = targetKey.split('|');
    return targets.find((item) => item.class_id === classId && item.subject_code === subjectCode) || null;
  }, [targetKey, targets]);

  const overviewQ = useQuery({
    queryKey: ['school-learning-insights', selected?.class_id, selected?.subject_code],
    queryFn: async () => {
      if (!selected) throw new Error('Select a class and subject');
      return (await getSchoolLearningOverview(selected.class_id, selected.subject_code)).data.data;
    },
    enabled: Boolean(selected),
    staleTime: 15_000,
  });

  const data = overviewQ.data;

  return (
    <div className="animate-fade-up">
      <SectionHeader
        title={`🧭 ${t('लर्निंग इनसाइट्स', 'Learning Insights')}`}
        sub={t(
          'कॉन्सेप्ट-स्तर के प्रमाण से जानें कि किस छात्र को दोहराव, अभ्यास या मास्टरी सहायता चाहिए',
          'Use concept-level evidence to see who needs review, practice or mastery support',
        )}
      />

      <div className="card mb-5" style={{ borderLeft: '4px solid var(--saffron)' }}>
        <div className="grid md:grid-cols-[minmax(260px,430px)_1fr] gap-4 items-end">
          <div>
            <label className="text-xs font-bold mb-1.5 block">{t('कक्षा और विषय', 'Class & Subject')}</label>
            <select className="input select" value={targetKey} onChange={(event) => setTargetKey(event.target.value)}>
              {targets.map((target) => (
                <option key={`${target.class_id}-${target.subject_code}`} value={`${target.class_id}|${target.subject_code}`}>
                  {targetLabel(target)}
                </option>
              ))}
            </select>
          </div>
          <div className="text-sm" style={{ color: 'var(--slate)' }}>
            {t(
              'शिक्षक केवल अपनी असाइन की गई कक्षा और विषय देख सकते हैं। स्कूल एडमिन सक्रिय कक्षाओं का अवलोकन कर सकते हैं।',
              'Teachers can see only their assigned class + subject. School Admins can review active School classes.',
            )}
          </div>
        </div>
      </div>

      {targetsQ.isLoading || overviewQ.isLoading ? (
        <div className="space-y-3"><div className="skeleton h-28 rounded-xl" /><div className="skeleton h-64 rounded-xl" /></div>
      ) : targetsQ.isError ? (
        <div className="card" style={{ color: '#B42318' }}>{apiErrorText(targetsQ.error, 'Could not load assigned learning scopes')}</div>
      ) : !targets.length ? (
        <div className="card text-center py-12" style={{ color: 'var(--slate)' }}>
          {t('कोई असाइन की गई कक्षा/विषय उपलब्ध नहीं है।', 'No assigned class/subject learning scope is available.')}
        </div>
      ) : overviewQ.isError ? (
        <div className="card" style={{ color: '#B42318' }}>{apiErrorText(overviewQ.error, 'Could not load learning insights')}</div>
      ) : data ? (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
            <div className="card"><div className="text-2xl font-black" style={{ color: '#B42318' }}>{data.summary.studentsNeedingReview}</div><div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Students needing review</div></div>
            <div className="card"><div className="text-2xl font-black" style={{ color: '#B42318' }}>{data.summary.needsReview}</div><div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Concept review signals</div></div>
            <div className="card"><div className="text-2xl font-black" style={{ color: '#9A6500' }}>{data.summary.practising}</div><div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Practising</div></div>
            <div className="card"><div className="text-2xl font-black" style={{ color: '#176B3A' }}>{data.summary.mastered}</div><div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Mastered signals</div></div>
            <div className="card"><div className="text-2xl font-black" style={{ color: 'var(--navy)' }}>{data.summary.learnerReadyConcepts}/{data.scope.conceptCount}</div><div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Learner-ready concepts</div></div>
          </div>

          {selected ? <TeacherDiagnosticPanel classId={selected.class_id} subjectCode={selected.subject_code} /> : null}

          <div className="card mb-5">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <div>
                <h2 className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>Concept heatmap</h2>
                <div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{data.scope.studentCount} active Students · {data.scope.conceptCount} mapped concepts</div>
              </div>
            </div>
            {data.concepts.length === 0 ? (
              <div className="text-center py-10" style={{ color: 'var(--slate)' }}>No canonical learning content is mapped to this class and subject yet.</div>
            ) : (
              <div className="grid md:grid-cols-2 gap-3">
                {data.concepts.map((concept) => (
                  <div key={concept.conceptId} className="p-4 rounded-xl" style={{ border: '1px solid var(--border)', background: '#fff' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div><b style={{ color: 'var(--navy)' }}>{concept.name}</b><div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{concept.code}{concept.chapterTitle ? ` · ${concept.chapterTitle}` : ''}</div></div>
                      <span className={`status-badge ${concept.learnerReady ? 'status-active' : ''}`} style={!concept.learnerReady ? { background: '#FFF4E8', color: '#9A6500' } : undefined}>
                        {concept.learnerReady ? 'Learner ready' : 'Mapped · review pending'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-4 text-center text-xs">
                      <div className="p-2 rounded-lg" style={{ background: '#FFF0F0' }}><b>{concept.summary.needsReview}</b><div>Review</div></div>
                      <div className="p-2 rounded-lg" style={{ background: '#FFF7E8' }}><b>{concept.summary.practising}</b><div>Practice</div></div>
                      <div className="p-2 rounded-lg" style={{ background: '#ECF8F0' }}><b>{concept.summary.mastered}</b><div>Mastered</div></div>
                    </div>
                    <div className="text-xs mt-3" style={{ color: 'var(--slate)' }}>
                      Published assets: {concept.publishedResourceCount} lesson(s) · {concept.publishedAssessmentCount} assessment(s)
                      {concept.averageMasteryPct != null ? ` · Avg mastery ${Math.round(concept.averageMasteryPct)}%` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="font-display font-bold text-lg mb-4" style={{ color: 'var(--navy)' }}>Student intervention view</h2>
            {data.students.length === 0 ? <div className="text-center py-8" style={{ color: 'var(--slate)' }}>No approved active Students in this class.</div> : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>Student</th><th>Needs review</th><th>Practising</th><th>Learning</th><th>Mastered</th><th>Priority concepts</th></tr></thead>
                  <tbody>
                    {data.students.map((student) => {
                      const priorities = student.concepts.filter((concept) => concept.state === 'NEEDS_REVIEW' || concept.state === 'PRACTISING').slice(0, 3);
                      return (
                        <tr key={student.studentId} style={student.attentionRequired ? { background: '#FFF9F7' } : undefined}>
                          <td><b>{student.name}</b><div className="text-xs" style={{ color: 'var(--slate)' }}>{student.rollNumber ? `Roll ${student.rollNumber} · ` : ''}{student.studentCode}</div></td>
                          <td style={{ fontWeight: 800, color: student.summary.needsReview ? '#B42318' : 'var(--slate)' }}>{student.summary.needsReview}</td>
                          <td>{student.summary.practising}</td><td>{student.summary.learning}</td><td style={{ color: '#176B3A', fontWeight: 700 }}>{student.summary.mastered}</td>
                          <td>
                            <div className="flex gap-1.5 flex-wrap">
                              {priorities.map((concept) => {
                                const meta = STATE_META[concept.state];
                                return <span key={concept.conceptId} className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: meta.bg, color: meta.color }}>{meta.icon} {concept.code}</span>;
                              })}
                              {!priorities.length && <span className="text-xs" style={{ color: 'var(--slate)' }}>No intervention flag</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}