'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import { getPublicLearningAssessment, type PublicLearningAssessmentDetail } from '@/services/publicService';
import styles from './publicLearning.module.css';

export default function PublicPracticeAssessmentPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const [assessment, setAssessment] = useState<PublicLearningAssessmentDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) return;
    let active = true;
    getPublicLearningAssessment(slug)
      .then((response) => { if (active) setAssessment(response.data.data); })
      .catch(() => { if (active) setError('This public practice set could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  if (loading) return <div className={styles.page}><GlobalTopbar /><div className={styles.article}>Loading practice set…</div></div>;
  if (!assessment || error) {
    return <div className={styles.page}><GlobalTopbar /><div className={styles.article}><h1>Practice unavailable</h1><p>{error || 'This practice set is not public.'}</p><Link className={styles.primary} href="/learn">Back to Learning Library</Link></div></div>;
  }

  return (
    <div className={styles.page}>
      <GlobalTopbar />
      <section className={styles.resourceHero}>
        <div className={styles.resourceShell}>
          <div className={styles.kicker}>FREE PRACTICE PREVIEW · {assessment.assessment_type.replaceAll('_', ' ')}</div>
          <h1 className={styles.resourceTitle}>{assessment.title}</h1>
          <p className={styles.resourceSummary}>{assessment.summary}</p>
          <div className={styles.pillRow}>
            {assessment.class_min && <span className={styles.pill}>Class {assessment.class_min}</span>}
            {(assessment.board_codes || []).map((board) => <span className={styles.pill} key={board}>{board}</span>)}
            <span className={styles.pill}>{assessment.questions.length} questions</span>
            {assessment.time_limit_mins && <span className={styles.pill}>{assessment.time_limit_mins} min</span>}
          </div>
        </div>
      </section>

      <article className={styles.article}>
        <div className={styles.note}>You can preview and answer these questions publicly. Correct answers, explanations, saved attempts and score history are available after Student login.</div>
        {assessment.questions.map((question, index) => (
          <div key={question.id} className={styles.resourceCard} style={{ marginTop: 16 }}>
            <div className={styles.cardTop}><span className={styles.badge}>{question.difficulty}</span><span className={styles.pill}>{question.marks} mark</span></div>
            <h3>{index + 1}. {question.prompt}</h3>
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              {question.options.map((option) => (
                <label key={option.key} style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="radio" name={`public-${question.id}`} checked={answers[question.id] === option.key} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.key }))} />
                  <span><strong>{option.key}.</strong> {option.text}</span>
                </label>
              ))}
            </div>
          </div>
        ))}

        <div className={styles.cta} style={{ marginTop: 24 }}>
          <div><strong>Ready to see your score and explanations?</strong><p>Sign in as a Student. VidyaSetu will save attempts and personalise future practice by class and board.</p></div>
          <div className={styles.actions}><Link className={styles.primary} href="/login?role=student">Student login</Link><Link className={styles.secondary} href="/learn">More learning</Link></div>
        </div>
      </article>
    </div>
  );
}
