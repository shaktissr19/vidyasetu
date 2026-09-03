'use client';

import Link from 'next/link';
import type { AdaptiveLearningPlan } from '@/services/studentService';
import styles from '../StudentPortal.module.css';

interface AdaptiveLearningPanelProps {
  plan?: AdaptiveLearningPlan;
  busy: string;
  onStartAssessment: (assessmentId: string) => void | Promise<void>;
}

const ACTION_LABELS: Record<AdaptiveLearningPlan['actions'][number]['actionType'], string> = {
  CONTINUE_RESOURCE: 'Continue learning',
  REVIEW_RESOURCE: 'Review first',
  PRACTICE: 'Focused practice',
  MASTERY_CHECK: 'Mastery check',
  START_NEXT_CONCEPT: 'Next concept',
};

export default function AdaptiveLearningPanel({ plan, busy, onStartAssessment }: AdaptiveLearningPanelProps) {
  if (!plan) return null;

  return (
    <div className={styles.card} style={{ marginBottom: 18, border: '1px solid rgba(28,112,255,.16)', background: 'linear-gradient(135deg, rgba(28,112,255,.07), rgba(255,184,76,.07))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'start', flexWrap: 'wrap' }}>
        <div>
          <div className={styles.cardTitle}>⚡ Next best actions</div>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0', maxWidth: 760 }}>
            {plan.headline} VidyaSetu prioritises real concept evidence: learn → practise → repair gaps → prove mastery.
          </p>
        </div>
        <div className={styles.contentMeta} style={{ textAlign: 'right' }}>
          {plan.summary.nextActions} action{plan.summary.nextActions === 1 ? '' : 's'} · about {plan.summary.estimatedMinutes} min
          <br />{plan.summary.needsReview} need review · {plan.summary.mastered} mastered
        </div>
      </div>

      {plan.actions.length === 0 ? (
        <div className={styles.empty} style={{ marginTop: 12 }}>No urgent mapped action right now. Continue exploring your class learning library.</div>
      ) : (
        <div className={styles.contentGrid} style={{ marginTop: 14 }}>
          {plan.actions.map((action) => (
            <div className={styles.contentItem} key={action.id} style={{ position: 'relative' }}>
              <div className={styles.contentTop}>
                <span className={styles.contentType}>{action.rank}. {ACTION_LABELS[action.actionType]}</span>
                <span className={action.urgency === 'HIGH' ? styles.done : styles.contentType}>{action.urgency === 'HIGH' ? 'Priority' : action.urgency === 'NEXT' ? 'Next' : 'Focus'}</span>
              </div>
              <div className={styles.contentTitle}>{action.title}</div>
              <div className={styles.contentMeta}>{action.subjectName || action.subjectCode}{action.chapterTitle ? ` · ${action.chapterTitle}` : ''}</div>
              <p className={styles.contentMeta} style={{ margin: '8px 0 0' }}>{action.reason}</p>
              <div className={styles.contentMeta} style={{ marginTop: 8 }}>
                Target: <strong>{action.target.title}</strong> · ~{action.estimatedMinutes} min
                {action.target.kind === 'ASSESSMENT' && action.target.questionCount ? ` · ${action.target.questionCount} questions` : ''}
              </div>
              <div className={styles.contentActions}>
                {action.target.kind === 'RESOURCE' && action.target.publicSlug ? (
                  <Link href={`/learn/resource/${action.target.publicSlug}`} target="_blank" className={`${styles.miniBtn} ${styles.miniPrimary}`}>
                    {action.actionType === 'REVIEW_RESOURCE' ? 'Review lesson' : 'Open lesson'}
                  </Link>
                ) : action.target.kind === 'ASSESSMENT' ? (
                  <button
                    className={`${styles.miniBtn} ${styles.miniPrimary}`}
                    disabled={busy === `assessment-${action.target.id}`}
                    onClick={() => void onStartAssessment(action.target.id)}
                  >
                    {busy === `assessment-${action.target.id}` ? 'Starting…' : action.actionType === 'MASTERY_CHECK' ? 'Take mastery check' : 'Start practice'}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
