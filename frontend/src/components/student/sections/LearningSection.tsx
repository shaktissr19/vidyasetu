'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bookmarkLearningResource,
  getStudentLearningAssessment,
  getStudentLearningHome,
  removeLearningResourceBookmark,
  startStudentLearningAssessment,
  submitStudentLearningAssessment,
  updateStudentLearningProgress,
  type LearningAttemptResult,
  type LearningHomeAssessment,
  type StudentLearningAssessmentDetail,
} from '@/services/studentService';
import { updateLearningProgressResilient } from '@/lib/offlineLearning';
import useAuthStore from '@/store/authStore';
import type { StudentSectionProps } from '@/types/studentPortal';
import SubjectsSection from './SubjectsSection';
import AdaptiveLearningPanel from './AdaptiveLearningPanel';
import styles from '../StudentPortal.module.css';

export default function LearningSection(props: StudentSectionProps) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [activeAssessment, setActiveAssessment] = useState<StudentLearningAssessmentDetail | null>(null);
  const [attemptId, setAttemptId] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<LearningAttemptResult | null>(null);
  const [busy, setBusy] = useState('');

  const homeQuery = useQuery({
    queryKey: ['student-learning-home'],
    queryFn: () => getStudentLearningHome().then((response) => response.data.data),
    staleTime: 30_000,
  });

  const home = homeQuery.data;
  const growth = useMemo(
    () => (home?.recommendedResources || []).filter((item) => item.category !== 'ACADEMIC').slice(0, 4),
    [home],
  );
  const academic = useMemo(
    () => (home?.recommendedResources || []).filter((item) => item.category === 'ACADEMIC').slice(0, 6),
    [home],
  );

  async function refreshHome(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['student-learning-home'] });
  }

  async function toggleBookmark(resourceId: string, bookmarked: boolean): Promise<void> {
    setBusy(`bookmark-${resourceId}`);
    try {
      if (bookmarked) await removeLearningResourceBookmark(resourceId);
      else await bookmarkLearningResource(resourceId);
      await refreshHome();
      props.notify(bookmarked ? 'Bookmark removed' : 'Saved to your Learning bookmarks');
    } catch {
      props.notify('Could not update bookmark');
    } finally { setBusy(''); }
  }

  async function markComplete(resourceId: string): Promise<void> {
    setBusy(`progress-${resourceId}`);
    try {
      const outcome = user?.id
        ? await updateLearningProgressResilient(user.id, resourceId, 100)
        : (await updateStudentLearningProgress(resourceId, 100), { queued: false });
      if (outcome.queued) {
        props.notify('📶 Learning progress saved on this device. It will sync when you reconnect.');
      } else {
        await refreshHome();
        props.notify('Learning resource marked complete');
      }
    } catch {
      props.notify('Could not update learning progress');
    } finally { setBusy(''); }
  }

  async function openAssessment(assessment: { id: string }): Promise<void> {
    setBusy(`assessment-${assessment.id}`);
    setResult(null);
    setAnswers({});
    try {
      const [detailResponse, attemptResponse] = await Promise.all([
        getStudentLearningAssessment(assessment.id),
        startStudentLearningAssessment(assessment.id),
      ]);
      setActiveAssessment(detailResponse.data.data);
      setAttemptId(attemptResponse.data.data.id);
    } catch {
      props.notify('Could not start this practice set');
    } finally { setBusy(''); }
  }

  async function submitPractice(): Promise<void> {
    if (!activeAssessment || !attemptId) return;
    setBusy('submit-practice');
    try {
      const payload = activeAssessment.questions.map((question) => ({
        questionId: question.id,
        answer: answers[question.id] ? { option: answers[question.id] } : null,
      }));
      const response = await submitStudentLearningAssessment(attemptId, payload);
      setResult(response.data.data);
      await refreshHome();
      props.notify('Practice submitted and graded');
    } catch {
      props.notify('Could not submit practice');
    } finally { setBusy(''); }
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <h1 className={styles.title}>📚 Learning Home</h1>
          <div className={styles.subtitle}>
            {home ? `Class ${home.learner.className} · ${home.learner.boardName}` : `Class ${props.student?.classLabel || props.student?.gradeLevel || '—'} · personalised learning, practice and growth`}
          </div>
        </div>
        <Link href="/learn" target="_blank" className={styles.secondary}>Explore public Learning Library ↗</Link>
      </div>

      {homeQuery.isLoading ? <div className={styles.loading}>Building your class and board learning path…</div> : homeQuery.isError ? (
        <div className={styles.card} style={{ marginBottom: 18 }}>
          <div className={styles.error}>Your personalised Learning Home could not be loaded.</div>
          <button className={styles.primary} onClick={() => homeQuery.refetch()}>Retry</button>
        </div>
      ) : home ? (
        <>
          <div className={styles.card} style={{ marginBottom: 18, background: 'linear-gradient(135deg, rgba(28,112,255,.08), rgba(61,185,138,.08))' }}>
            <div className={styles.cardTitle}>🎯 Your learning path</div>
            <p style={{ color: 'var(--muted)', marginTop: 4 }}>
              VidyaSetu is using your Class {home.learner.className}{home.learner.schoolName ? `, ${home.learner.schoolName}` : ''} and {home.learner.boardName} context. Common cross-board resources remain available alongside board-specific material.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10, marginTop: 14 }}>
              <div className={styles.contentItem}><strong style={{ fontSize: 24 }}>{home.progress.started}</strong><div className={styles.contentMeta}>Resources started</div></div>
              <div className={styles.contentItem}><strong style={{ fontSize: 24 }}>{home.progress.completed}</strong><div className={styles.contentMeta}>Completed</div></div>
              <div className={styles.contentItem}><strong style={{ fontSize: 24 }}>{Math.round(Number(home.progress.average_progress || 0))}%</strong><div className={styles.contentMeta}>Average progress</div></div>
            </div>
          </div>

          <AdaptiveLearningPanel
            plan={home.adaptivePlan}
            busy={busy}
            onStartAssessment={(assessmentId) => openAssessment({ id: assessmentId })}
          />

          <div className={styles.card} style={{ marginBottom: 18 }}>
            <div className={styles.cardTitle}>📝 Practice & self-assessment</div>
            <p style={{ color: 'var(--muted)', marginTop: 0 }}>Short practice sets are separate from competitions. They help you learn, get explanations and build mastery at your own pace.</p>
            {home.assessments.length === 0 ? <div className={styles.empty}>Practice sets for your class and board are being added.</div> : (
              <div className={styles.contentGrid}>
                {home.assessments.slice(0, 6).map((assessment: LearningHomeAssessment) => (
                  <div className={styles.contentItem} key={assessment.id}>
                    <div className={styles.contentTop}><span className={styles.contentType}>{assessment.assessment_type.replaceAll('_', ' ')}</span></div>
                    <div className={styles.contentTitle}>{assessment.title}</div>
                    <div className={styles.contentMeta}>{assessment.question_count} questions · {assessment.total_marks} marks{assessment.time_limit_mins ? ` · ${assessment.time_limit_mins} min` : ''}</div>
                    {assessment.last_percentage != null && <div className={styles.contentMeta}>Last score: <strong>{Math.round(Number(assessment.last_percentage))}%</strong></div>}
                    <div className={styles.contentActions}>
                      <button className={`${styles.miniBtn} ${styles.miniPrimary}`} disabled={busy === `assessment-${assessment.id}`} onClick={() => openAssessment(assessment)}>
                        {busy === `assessment-${assessment.id}` ? 'Starting…' : 'Start practice'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {activeAssessment && (
            <div className={styles.card} style={{ marginBottom: 18, border: '1px solid rgba(61,185,138,.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                <div>
                  <div className={styles.cardTitle}>✅ {activeAssessment.title}</div>
                  <p style={{ color: 'var(--muted)' }}>{activeAssessment.summary || 'Choose the best answer for each question.'}</p>
                </div>
                <button className={styles.secondary} onClick={() => { setActiveAssessment(null); setResult(null); setAttemptId(''); }}>Close</button>
              </div>

              {activeAssessment.questions.map((question, index) => {
                const feedback = result?.feedback.find((item) => item.questionId === question.id);
                return (
                  <div key={question.id} className={styles.contentItem} style={{ marginTop: 12 }}>
                    <strong>{index + 1}. {question.prompt}</strong>
                    <div className={styles.contentMeta}>{question.difficulty} · {Number(question.marks_override ?? question.marks ?? 1)} mark</div>
                    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                      {question.options.map((option) => (
                        <label key={option.key} style={{ display: 'flex', gap: 9, alignItems: 'center', cursor: result ? 'default' : 'pointer' }}>
                          <input type="radio" name={`q-${question.id}`} disabled={Boolean(result)} checked={answers[question.id] === option.key} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.key }))} />
                          <span><strong>{option.key}.</strong> {option.text}</span>
                        </label>
                      ))}
                    </div>
                    {feedback && (
                      <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: feedback.correct ? 'rgba(61,185,138,.1)' : 'rgba(230,90,90,.08)' }}>
                        <strong>{feedback.correct ? 'Correct' : feedback.correct === null ? 'Skipped' : 'Review this one'}</strong>
                        {feedback.explanation ? <div className={styles.contentMeta} style={{ marginTop: 4 }}>{feedback.explanation}</div> : null}
                      </div>
                    )}
                  </div>
                );
              })}

              {result ? (
                <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: 'rgba(61,185,138,.1)' }}>
                  <strong style={{ fontSize: 22 }}>Score: {Math.round(result.percentage)}%</strong>
                  <div className={styles.contentMeta}>{result.correct_count} correct · {result.wrong_count} wrong · {result.skipped_count} skipped</div>
                </div>
              ) : (
                <button className={styles.primary} style={{ marginTop: 16 }} disabled={busy === 'submit-practice'} onClick={submitPractice}>
                  {busy === 'submit-practice' ? 'Grading…' : 'Submit practice'}
                </button>
              )}
            </div>
          )}

          <div className={styles.card} style={{ marginBottom: 18 }}>
            <div className={styles.cardTitle}>📘 Recommended academic resources</div>
            {academic.length === 0 ? <div className={styles.empty}>Academic resources for your class are being expanded.</div> : (
              <div className={styles.contentGrid}>
                {academic.map((item) => (
                  <div className={styles.contentItem} key={item.id}>
                    <div className={styles.contentTop}><span className={styles.contentType}>{item.subject_name || item.resource_type}</span></div>
                    <div className={styles.contentTitle}>{item.title}</div>
                    <div className={styles.contentMeta}>{item.summary}</div>
                    {Number(item.progress_pct) > 0 && <div className={styles.contentMeta}>Progress: {Math.round(Number(item.progress_pct))}%</div>}
                    <div className={styles.contentActions}>
                      {item.public_slug && <Link href={`/learn/resource/${item.public_slug}`} target="_blank" className={`${styles.miniBtn} ${styles.miniPrimary}`}>Open</Link>}
                      <button className={styles.miniBtn} disabled={busy === `bookmark-${item.id}`} onClick={() => toggleBookmark(item.id, item.bookmarked)}>{item.bookmarked ? '★ Saved' : '☆ Save'}</button>
                      {!item.is_completed && <button className={styles.miniBtn} disabled={busy === `progress-${item.id}`} onClick={() => markComplete(item.id)}>Mark complete</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.card} style={{ marginBottom: 18 }}>
            <div className={styles.cardTitle}>🌱 Beyond the syllabus</div>
            <p style={{ color: 'var(--muted)', marginTop: 0 }}>Motivation, study skills, work ethic, social responsibility, digital citizenship, well-being and career awareness are part of learning too.</p>
            {growth.length === 0 ? <div className={styles.empty}>Growth resources for your class are being added.</div> : (
              <div className={styles.contentGrid}>
                {growth.map((item) => (
                  <div className={styles.contentItem} key={item.id}>
                    <div className={styles.contentTop}><span className={styles.contentType}>{item.category.replaceAll('_', ' ')}</span></div>
                    <div className={styles.contentTitle}>{item.title}</div>
                    <div className={styles.contentMeta}>{item.summary}</div>
                    <div className={styles.contentActions}>
                      {item.public_slug && <Link href={`/learn/resource/${item.public_slug}`} target="_blank" className={`${styles.miniBtn} ${styles.miniPrimary}`}>Read</Link>}
                      <button className={styles.miniBtn} onClick={() => toggleBookmark(item.id, item.bookmarked)}>{item.bookmarked ? '★ Saved' : '☆ Save'}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}

      <SubjectsSection {...props} />
    </>
  );
}
