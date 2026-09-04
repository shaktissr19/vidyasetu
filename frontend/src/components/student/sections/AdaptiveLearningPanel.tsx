'use client';

import Link from 'next/link';
import type { AdaptiveLearningPlan } from '@/services/studentService';
import useLanguageStore from '@/store/languageStore';
import styles from '../StudentPortal.module.css';

interface AdaptiveLearningPanelProps {
  plan?: AdaptiveLearningPlan;
  busy: string;
  onStartAssessment: (assessmentId: string) => void | Promise<void>;
}

const ACTION_LABELS: Record<AdaptiveLearningPlan['actions'][number]['actionType'], { en: string; hi: string }> = {
  CONTINUE_RESOURCE: { en: 'Continue learning', hi: 'सीखना जारी रखें' },
  REVIEW_RESOURCE: { en: 'Review first', hi: 'पहले दोहराएँ' },
  PRACTICE: { en: 'Focused practice', hi: 'फोकस्ड प्रैक्टिस' },
  MASTERY_CHECK: { en: 'Mastery check', hi: 'मास्टरी जाँच' },
  START_NEXT_CONCEPT: { en: 'Next concept', hi: 'अगला कॉन्सेप्ट' },
  QUICK_DIAGNOSTIC: { en: 'Quick diagnostic', hi: 'त्वरित जाँच' },
  REPAIR_MISCONCEPTION: { en: 'Repair misconception', hi: 'गलतफहमी सुधारें' },
  SPACED_REVIEW: { en: 'Spaced review', hi: 'समय पर रिविज़न' },
  REVIEW_PREREQUISITE: { en: 'Strengthen prerequisite', hi: 'बुनियाद मजबूत करें' },
};

export default function AdaptiveLearningPanel({ plan, busy, onStartAssessment }: AdaptiveLearningPanelProps) {
  const lang = useLanguageStore((state) => state.lang);
  const t = useLanguageStore((state) => state.t);
  if (!plan) return null;

  return (
    <div className={styles.card} style={{ marginBottom: 18, border: '1px solid rgba(28,112,255,.16)', background: 'linear-gradient(135deg, rgba(28,112,255,.07), rgba(255,184,76,.07))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'start', flexWrap: 'wrap' }}>
        <div>
          <div className={styles.cardTitle}>⚡ {t('अगला सबसे अच्छा कदम', 'Next best actions')}</div>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0', maxWidth: 760 }}>
            {plan.headline} {t('VidyaSetu अब mastery के साथ proficiency, confidence, retention और misconception evidence भी देखता है।', 'VidyaSetu now combines mastery with proficiency, confidence, retention and misconception evidence.')}
          </p>
        </div>
        <div className={styles.contentMeta} style={{ textAlign: 'right' }}>
          {plan.summary.nextActions} {t('कदम', 'actions')} · {t('लगभग', 'about')} {plan.summary.estimatedMinutes} min
          <br />{plan.summary.needsReview} {t('दोहराने हैं', 'need review')} · {plan.summary.mastered} {t('मास्टर्ड', 'mastered')}
          {typeof plan.summary.reviewDue === 'number' ? <><br />{plan.summary.reviewDue} {t('रिविज़न ड्यू', 'review due')} · {plan.summary.activeMisconceptions || 0} {t('गलतफहमियाँ', 'misconceptions')}</> : null}
        </div>
      </div>

      {plan.actions.length === 0 ? (
        <div className={styles.empty} style={{ marginTop: 12 }}>{t('अभी कोई जरूरी मैप्ड कदम नहीं है। अपनी क्लास की Learning Library से सीखना जारी रखें।', 'No urgent mapped action right now. Continue exploring your class learning library.')}</div>
      ) : (
        <div className={styles.contentGrid} style={{ marginTop: 14 }}>
          {plan.actions.map((action) => {
            const actionLabel = ACTION_LABELS[action.actionType];
            return (
              <div className={styles.contentItem} key={action.id} style={{ position: 'relative' }}>
                <div className={styles.contentTop}>
                  <span className={styles.contentType}>{action.rank}. {lang === 'hi' ? actionLabel.hi : actionLabel.en}</span>
                  <span className={action.urgency === 'HIGH' ? styles.done : styles.contentType}>{action.urgency === 'HIGH' ? t('प्राथमिकता', 'Priority') : action.urgency === 'NEXT' ? t('अगला', 'Next') : t('फोकस', 'Focus')}</span>
                </div>
                <div className={styles.contentTitle}>{action.title}</div>
                <div className={styles.contentMeta}>{action.subjectName || action.subjectCode}{action.chapterTitle ? ` · ${action.chapterTitle}` : ''}</div>
                <p className={styles.contentMeta} style={{ margin: '8px 0 0' }}>{action.reason}</p>
                {action.diagnostic ? (
                  <div className={styles.contentMeta} style={{ marginTop: 8 }}>
                    {t('समझ', 'Proficiency')} <strong>{Math.round(action.diagnostic.proficiencyScore)}%</strong> · {t('भरोसा', 'Confidence')} <strong>{action.diagnostic.confidenceLevel}</strong>
                  </div>
                ) : null}
                <div className={styles.contentMeta} style={{ marginTop: 8 }}>
                  {t('लक्ष्य', 'Target')}: <strong>{action.target.title}</strong> · ~{action.estimatedMinutes} min
                  {action.target.kind === 'ASSESSMENT' && action.target.questionCount ? ` · ${action.target.questionCount} ${t('प्रश्न', 'questions')}` : ''}
                </div>
                <div className={styles.contentActions}>
                  {action.target.kind === 'RESOURCE' && action.target.publicSlug ? (
                    <Link href={`/learn/resource/${action.target.publicSlug}`} target="_blank" className={`${styles.miniBtn} ${styles.miniPrimary}`}>
                      {action.actionType === 'REVIEW_RESOURCE' || action.actionType === 'REPAIR_MISCONCEPTION' || action.actionType === 'SPACED_REVIEW' || action.actionType === 'REVIEW_PREREQUISITE'
                        ? t('पाठ दोहराएँ', 'Review lesson') : t('पाठ खोलें', 'Open lesson')}
                    </Link>
                  ) : action.target.kind === 'ASSESSMENT' ? (
                    <button
                      className={`${styles.miniBtn} ${styles.miniPrimary}`}
                      disabled={busy === `assessment-${action.target.id}`}
                      onClick={() => void onStartAssessment(action.target.id)}
                    >
                      {busy === `assessment-${action.target.id}`
                        ? t('शुरू हो रहा है…', 'Starting…')
                        : action.actionType === 'MASTERY_CHECK'
                          ? t('मास्टरी जाँच लें', 'Take mastery check')
                          : action.actionType === 'QUICK_DIAGNOSTIC'
                            ? t('त्वरित जाँच शुरू करें', 'Start quick diagnostic')
                            : action.actionType === 'SPACED_REVIEW'
                              ? t('रिविज़न शुरू करें', 'Start review')
                              : t('प्रैक्टिस शुरू करें', 'Start practice')}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}