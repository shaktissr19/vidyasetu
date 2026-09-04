'use client';

import type { StudentDiagnosticProfile } from '@/services/studentService';
import useLanguageStore from '@/store/languageStore';
import styles from '../StudentPortal.module.css';

interface Props {
  profile?: StudentDiagnosticProfile;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}

type KnowledgeBand = 'STRONG' | 'LEARNING' | 'NEEDS_ATTENTION' | 'REVIEW_DUE' | 'LOW_EVIDENCE';

function bandFor(concept: StudentDiagnosticProfile['concepts'][number]): KnowledgeBand {
  if (concept.retentionStatus === 'REVIEW_DUE' || concept.retentionStatus === 'REVIEW_SOON') return 'REVIEW_DUE';
  if (concept.misconceptions.some((item) => item.state === 'ACTIVE') || concept.proficiencyScore < 60) return 'NEEDS_ATTENTION';
  if (concept.confidenceLevel === 'LOW' || concept.evidenceCount < 3) return 'LOW_EVIDENCE';
  if (concept.proficiencyScore >= 80 && ['MEDIUM', 'HIGH'].includes(concept.confidenceLevel)) return 'STRONG';
  return 'LEARNING';
}

export default function DiagnosticKnowledgeMap({ profile, loading, error, onRetry }: Props) {
  const lang = useLanguageStore((state) => state.lang);
  const t = useLanguageStore((state) => state.t);

  if (loading) {
    return <div className={styles.card} style={{ marginBottom: 18 }}><div className={styles.loading}>{t('आपकी कॉन्सेप्ट समझ का मानचित्र तैयार हो रहा है…', 'Building your concept knowledge map…')}</div></div>;
  }
  if (error) {
    return (
      <div className={styles.card} style={{ marginBottom: 18 }}>
        <div className={styles.error}>{t('लर्निंग इंटेलिजेंस अभी लोड नहीं हो सकी।', 'Learning intelligence could not be loaded right now.')}</div>
        {onRetry ? <button className={styles.secondary} onClick={onRetry}>{t('फिर कोशिश करें', 'Retry')}</button> : null}
      </div>
    );
  }
  if (!profile) return null;

  const labels: Record<KnowledgeBand, { en: string; hi: string; hintEn: string; hintHi: string }> = {
    STRONG: { en: 'Strong', hi: 'मज़बूत', hintEn: 'Good evidence across this concept', hintHi: 'इस कॉन्सेप्ट पर अच्छा प्रमाण है' },
    LEARNING: { en: 'Learning', hi: 'सीख रहे हैं', hintEn: 'Understanding is developing', hintHi: 'समझ विकसित हो रही है' },
    NEEDS_ATTENTION: { en: 'Needs attention', hi: 'ध्यान चाहिए', hintEn: 'Repair the gap before moving harder', hintHi: 'आगे बढ़ने से पहले कमी सुधारें' },
    REVIEW_DUE: { en: 'Review due', hi: 'रिविज़न बाकी', hintEn: 'Previously learned; refresh it now', hintHi: 'पहले सीखा था; अब दोहराएँ' },
    LOW_EVIDENCE: { en: 'Need more evidence', hi: 'और जाँच चाहिए', hintEn: 'A quick check will improve confidence', hintHi: 'छोटी जाँच से भरोसा बढ़ेगा' },
  };

  const ordered = [...profile.concepts].sort((a, b) => {
    const priority: Record<KnowledgeBand, number> = { REVIEW_DUE: 0, NEEDS_ATTENTION: 1, LOW_EVIDENCE: 2, LEARNING: 3, STRONG: 4 };
    return priority[bandFor(a)] - priority[bandFor(b)] || a.proficiencyScore - b.proficiencyScore;
  });

  return (
    <div className={styles.card} style={{ marginBottom: 18, border: '1px solid rgba(28,112,255,.15)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'start', flexWrap: 'wrap' }}>
        <div>
          <div className={styles.cardTitle}>🧭 {t('मेरा नॉलेज मैप', 'My Knowledge Map')}</div>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0', maxWidth: 760 }}>
            {t(
              'यह केवल स्कोर नहीं है। VidyaSetu आपके उत्तरों, प्रश्न की कठिनाई, कौशल और बार-बार दिखने वाली गलतफहमियों से तय करता है कि कहाँ आगे बढ़ना है और कहाँ दोहराना है।',
              'This is more than a score. VidyaSetu uses your answers, question difficulty, skills and repeated misconceptions to decide where to move ahead and where to review.',
            )}
          </p>
        </div>
        <div className={styles.contentMeta} style={{ textAlign: 'right' }}>
          {profile.summary.conceptsAssessed} {t('कॉन्सेप्ट जाँचे गए', 'concepts assessed')}<br />
          {profile.summary.reviewDue} {t('रिविज़न बाकी', 'review due')} · {profile.summary.activeMisconceptions} {t('सक्रिय गलतफहमियाँ', 'active misconceptions')}
        </div>
      </div>

      {ordered.length === 0 ? (
        <div className={styles.empty} style={{ marginTop: 14 }}>
          {t('अभी पर्याप्त उत्तर-आधारित प्रमाण नहीं है। पहला प्रैक्टिस या डायग्नोस्टिक पूरा करने पर आपका नॉलेज मैप यहाँ बनेगा।', 'There is not enough answer evidence yet. Complete your first practice or diagnostic and your knowledge map will appear here.')}
        </div>
      ) : (
        <div className={styles.contentGrid} style={{ marginTop: 14 }}>
          {ordered.slice(0, 8).map((concept) => {
            const band = bandFor(concept);
            const label = labels[band];
            const activeMisconception = concept.misconceptions.find((item) => item.state === 'ACTIVE');
            const conceptName = lang === 'hi' && concept.nameHi ? concept.nameHi : concept.name;
            return (
              <div className={styles.contentItem} key={concept.conceptId}>
                <div className={styles.contentTop}>
                  <span className={styles.contentType}>{lang === 'hi' ? label.hi : label.en}</span>
                  <span className={styles.contentType}>{Math.round(concept.proficiencyScore)}%</span>
                </div>
                <div className={styles.contentTitle}>{conceptName}</div>
                <div className={styles.contentMeta}>{concept.subjectName || concept.subjectCode}{concept.chapterTitle ? ` · ${concept.chapterTitle}` : ''}</div>
                <div className={styles.contentMeta} style={{ marginTop: 7 }}>
                  {t('समझ', 'Proficiency')}: <strong>{Math.round(concept.proficiencyScore)}%</strong> · {t('भरोसा', 'Confidence')}: <strong>{concept.confidenceLevel}</strong>
                </div>
                <div className={styles.contentMeta} style={{ marginTop: 4 }}>{lang === 'hi' ? label.hintHi : label.hintEn}</div>
                {activeMisconception ? (
                  <div className={styles.contentMeta} style={{ marginTop: 7 }}>
                    {t('बार-बार दिख रही गलतफहमी', 'Repeated misconception')}: <strong>{activeMisconception.misconception_code}</strong>
                  </div>
                ) : null}
                {concept.retentionStatus === 'REVIEW_DUE' || concept.retentionStatus === 'REVIEW_SOON' ? (
                  <div className={styles.contentMeta} style={{ marginTop: 7 }}>
                    {t('आपकी mastery बनी हुई है; यह केवल याददाश्त मजबूत रखने के लिए रिविज़न है।', 'Your mastery remains earned; this review is to keep the learning fresh.')}
                  </div>
                ) : null}
                <div className={styles.contentMeta} style={{ marginTop: 7 }}>
                  {concept.evidenceCount} {t('उत्तर-आधारित प्रमाण', 'answer evidence')} · {concept.diagnosticCount} {t('डायग्नोस्टिक', 'diagnostic')} · {concept.masteryCount} {t('mastery', 'mastery')}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
