'use client';

import Link from 'next/link';
import type { StudentPersonalizedJourney } from '@/services/studentService';
import useLanguageStore from '@/store/languageStore';
import styles from '../StudentPortal.module.css';

interface Props {
  data?: StudentPersonalizedJourney;
  loading: boolean;
  error: boolean;
  busy: string;
  onRetry: () => void;
  onStartAssessment: (assessmentId: string) => void | Promise<void>;
  onChangeMinutes: (minutes: 15 | 25 | 40) => void | Promise<void>;
  onSkip: (itemId: string) => void | Promise<void>;
}

const ACTION_COPY: Record<StudentPersonalizedJourney['journey']['items'][number]['actionType'], { en: string; hi: string }> = {
  CONTINUE_RESOURCE: { en: 'Continue', hi: 'जारी रखें' },
  REVIEW_RESOURCE: { en: 'Review', hi: 'दोहराएँ' },
  PRACTICE: { en: 'Practise', hi: 'प्रैक्टिस' },
  MASTERY_CHECK: { en: 'Prove mastery', hi: 'मास्टरी साबित करें' },
  START_NEXT_CONCEPT: { en: 'Start next', hi: 'अगला शुरू करें' },
  QUICK_DIAGNOSTIC: { en: 'Quick diagnostic', hi: 'त्वरित जाँच' },
  REPAIR_MISCONCEPTION: { en: 'Repair misconception', hi: 'गलतफहमी सुधारें' },
  SPACED_REVIEW: { en: 'Spaced review', hi: 'समय पर रिविज़न' },
  REVIEW_PREREQUISITE: { en: 'Strengthen foundation', hi: 'बुनियाद मजबूत करें' },
};

export default function PersonalizedJourneyPanel({
  data,
  loading,
  error,
  busy,
  onRetry,
  onStartAssessment,
  onChangeMinutes,
  onSkip,
}: Props) {
  const lang = useLanguageStore((state) => state.lang);
  const t = useLanguageStore((state) => state.t);

  if (loading) {
    return <div className={styles.card} style={{ marginBottom: 18 }}><div className={styles.loading}>{t('आज का निजी लर्निंग प्लान बन रहा है…', 'Building today’s personalized learning journey…')}</div></div>;
  }
  if (error || !data) {
    return (
      <div className={styles.card} style={{ marginBottom: 18 }}>
        <div className={styles.error}>{t('आज का निजी लर्निंग प्लान लोड नहीं हो सका।', 'Today’s personalized learning journey could not be loaded.')}</div>
        <button className={styles.primary} onClick={onRetry}>{t('फिर कोशिश करें', 'Retry')}</button>
      </div>
    );
  }

  const { journey, preferences } = data;
  const complete = journey.status === 'COMPLETED';

  return (
    <div className={styles.card} style={{ marginBottom: 18, border: '1px solid rgba(61,185,138,.22)', background: 'linear-gradient(135deg, rgba(61,185,138,.08), rgba(28,112,255,.06))' }}>
      <div style={{ display: 'flex', gap: 14, justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 760 }}>
          <div className={styles.cardTitle}>🧭 {t('आज की सीखने की यात्रा', 'Today’s learning journey')}</div>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0' }}>{journey.headline}</p>
          <p className={styles.contentMeta} style={{ margin: '6px 0 0' }}>{journey.explanation}</p>
        </div>
        <div style={{ minWidth: 210 }}>
          <div className={styles.contentMeta} style={{ marginBottom: 6 }}>{t('आज आपके पास कितना समय है?', 'How much time do you have today?')}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {([15, 25, 40] as const).map((minutes) => (
              <button
                key={minutes}
                className={preferences.dailyMinutes === minutes ? `${styles.miniBtn} ${styles.miniPrimary}` : styles.miniBtn}
                disabled={busy === 'journey-preference'}
                onClick={() => void onChangeMinutes(minutes)}
              >{minutes} min</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10, marginTop: 14 }}>
        <div className={styles.contentItem}><strong style={{ fontSize: 22 }}>{journey.progressPct}%</strong><div className={styles.contentMeta}>{t('आज का लक्ष्य', 'Today’s goal')}</div></div>
        <div className={styles.contentItem}><strong style={{ fontSize: 22 }}>{journey.completedMinutes}</strong><div className={styles.contentMeta}>{t('मिनट पूरे', 'minutes completed')}</div></div>
        <div className={styles.contentItem}><strong style={{ fontSize: 22 }}>{journey.remainingMinutes}</strong><div className={styles.contentMeta}>{t('मिनट बाकी', 'minutes remaining')}</div></div>
      </div>

      {complete ? (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'rgba(61,185,138,.12)' }}>
          <strong>✅ {t('आज का लक्ष्य पूरा हुआ', 'Today’s goal is complete')}</strong>
          <div className={styles.contentMeta} style={{ marginTop: 4 }}>{t('VidyaSetu आज नए काम जोड़कर लक्ष्य को लगातार नहीं बढ़ाएगा। अगला दैनिक प्लान नए दिन या आपके चुने हुए समय में बदलाव पर बनेगा।', 'VidyaSetu will not keep extending the goal with endless new tasks today. A fresh daily plan is created on a new day or when you intentionally change your time budget.')}</div>
        </div>
      ) : journey.items.length === 0 ? (
        <div className={styles.empty} style={{ marginTop: 14 }}>{t('आज कोई जरूरी मैप्ड कदम नहीं है। Learning Library से सीखना जारी रखें।', 'No urgent mapped step is available today. Continue learning from the Library.')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {journey.items.map((item) => {
            const done = item.status === 'COMPLETED';
            const skipped = item.status === 'SKIPPED';
            const action = ACTION_COPY[item.actionType];
            return (
              <div key={item.id} className={styles.contentItem} style={{ opacity: skipped ? .65 : 1 }}>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'start', flex: 1 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 999, display: 'grid', placeItems: 'center', fontWeight: 800, background: done ? 'rgba(61,185,138,.16)' : 'rgba(28,112,255,.12)' }}>
                      {done ? '✓' : item.position}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className={styles.contentTop}>
                        <span className={styles.contentType}>{lang === 'hi' ? action.hi : action.en}</span>
                        <span className={styles.contentType}>~{item.estimatedMinutes} min</span>
                      </div>
                      <div className={styles.contentTitle}>{item.title}</div>
                      <div className={styles.contentMeta}>{item.reason}</div>
                      <div className={styles.contentMeta} style={{ marginTop: 5 }}>{t('लक्ष्य', 'Target')}: <strong>{item.target.title}</strong></div>
                    </div>
                  </div>
                  <div className={styles.contentActions}>
                    {done ? <span className={styles.done}>{t('पूरा', 'Done')}</span> : skipped ? <span className={styles.contentType}>{t('आज छोड़ा', 'Skipped today')}</span> : (
                      <>
                        {item.target.kind === 'RESOURCE' && item.target.publicSlug ? (
                          <Link href={`/learn/resource/${item.target.publicSlug}`} target="_blank" className={`${styles.miniBtn} ${styles.miniPrimary}`}>{t('सीखना शुरू करें', 'Start')}</Link>
                        ) : item.target.kind === 'ASSESSMENT' ? (
                          <button className={`${styles.miniBtn} ${styles.miniPrimary}`} disabled={busy === `assessment-${item.target.id}`} onClick={() => void onStartAssessment(item.target.id)}>
                            {busy === `assessment-${item.target.id}` ? t('शुरू हो रहा है…', 'Starting…') : t('शुरू करें', 'Start')}
                          </button>
                        ) : null}
                        <button className={styles.miniBtn} disabled={busy === `journey-skip-${item.id}`} onClick={() => void onSkip(item.id)}>{t('आज छोड़ें', 'Skip today')}</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
