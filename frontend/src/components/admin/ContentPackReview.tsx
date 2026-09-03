'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getContentPackReview } from '@/services/contentPackReviewService';
import styles from '@/components/public/publicLearning.module.css';

const PACK_LABELS: Record<string, string> = {
  force: 'Force',
  'effects-of-force': 'Effects of Force',
  'contact-noncontact': 'Contact & Non-contact',
  pressure: 'Pressure',
  'pressure-in-liquids': 'Pressure in Liquids',
  'atmospheric-pressure': 'Atmospheric Pressure',
};

function statusTone(status: string): CSSProperties {
  if (status.startsWith('STAGED_')) return { borderColor: '#22c55e', color: '#86efac' };
  if (status === 'PRODUCTION_SCRIPT_READY') return { borderColor: '#f59e0b', color: '#fcd34d' };
  if (status === 'AUTHORING_READY') return { borderColor: '#38bdf8', color: '#7dd3fc' };
  return { borderColor: '#ef4444', color: '#fca5a5' };
}

function humanStatus(value: string): string {
  return value.replaceAll('_', ' ');
}

export default function ContentPackReview({ packKey }: { packKey: string }) {
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);

  const reviewQuery = useQuery({
    queryKey: ['content-pack-review', packKey],
    queryFn: () => getContentPackReview(packKey).then((response) => response.data.data),
  });

  if (reviewQuery.isLoading) {
    return <div className={styles.studio}><p style={{ color: 'white' }}>Loading content pack review…</p></div>;
  }

  if (reviewQuery.isError || !reviewQuery.data) {
    return (
      <div className={styles.studio}>
        <h1 style={{ color: 'white' }}>Content pack review unavailable</h1>
        <p style={{ color: 'rgba(255,255,255,.6)' }}>The review API could not load this supported content pack.</p>
        <Link className={styles.tinyButton} href="/admin/learning">← Learning Studio</Link>
      </div>
    );
  }

  const data = reviewQuery.data;
  const resource = data.resource;
  const body = language === 'hi' ? resource?.body_markdown_hi : resource?.body_markdown;
  const title = language === 'hi' ? resource?.title_hi || resource?.title : resource?.title;
  const summary = language === 'hi' ? resource?.summary_hi || resource?.summary : resource?.summary;

  return (
    <div className={styles.studio}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ color: '#ff9a3c', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>ACADEMIC CONTENT REVIEW</div>
        <h1 style={{ color: 'white', fontSize: 34, margin: '6px 0' }}>
          🧪 Class 8 {data.manifest.subject} · {data.manifest.concept}
        </h1>
        <p style={{ color: 'rgba(255,255,255,.58)', maxWidth: 960, lineHeight: 1.7 }}>
          One reusable cockpit for pack definition, bilingual lesson, question bank, assessments, learning journey and publication readiness.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <Link className={styles.tinyButton} href="/admin/learning">← Learning Studio</Link>
          <Link className={styles.tinyButton} href="/admin/learning/practice">Question Bank & Practice</Link>
          <button type="button" className={styles.tinyButton} style={language === 'en' ? { borderColor: '#ff8d32', color: '#ffb27a' } : undefined} onClick={() => setLanguage('en')}>English</button>
          <button type="button" className={styles.tinyButton} style={language === 'hi' ? { borderColor: '#ff8d32', color: '#ffb27a' } : undefined} onClick={() => setLanguage('hi')}>हिंदी</button>
        </div>

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }} aria-label="Force and Pressure content packs">
          {data.supportedPacks.map((pack) => {
            const active = pack.key === data.packKey;
            return (
              <Link
                key={pack.key}
                className={styles.tinyButton}
                style={active ? { borderColor: '#22c55e', color: '#86efac' } : undefined}
                href={pack.key === 'pressure' ? '/admin/learning/review/pressure' : `/admin/learning/review/${pack.key}`}
              >
                {PACK_LABELS[pack.key] || pack.key}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-5">
        {[
          ['Lesson', `${data.completeness.resourceCount} / ${data.completeness.expectedResourceCount}`],
          ['Questions', `${data.completeness.questionCount} / ${data.completeness.expectedQuestionCount}`],
          ['Assessments', `${data.completeness.assessmentCount} / ${data.completeness.expectedAssessmentCount}`],
          ['Bilingual', data.completeness.allBilingual ? 'PASS' : 'CHECK'],
          ['No negative marks', data.completeness.noNegativeMarking ? 'PASS' : 'CHECK'],
          ['Media binaries', data.completeness.mediaBinariesReady ? 'READY' : 'PENDING'],
        ].map(([label, value]) => (
          <div key={label} className={styles.adminPanel} style={{ padding: 14 }}>
            <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 11 }}>{label}</div>
            <div style={{ color: 'white', fontWeight: 900, fontSize: 19, marginTop: 4 }}>{value}</div>
          </div>
        ))}
      </div>

      <section className={styles.adminPanel} style={{ marginBottom: 18 }}>
        <div className={styles.adminItemTop}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Pack definition</h2>
            <p style={{ color: 'rgba(255,255,255,.5)' }}>{data.manifest.packId} · {data.manifest.version} · {data.manifest.theme}</p>
          </div>
          <span className={styles.badge}>{data.manifest.status}</span>
        </div>
        <div className={styles.pillRow} style={{ marginTop: 10 }}>
          {data.manifest.contentIdentity.map((stage) => <span className={styles.pill} key={stage}>{stage}</span>)}
          {data.manifest.languages.map((lang) => <span className={styles.pill} key={lang}>{lang.toUpperCase()}</span>)}
        </div>
        <div style={{ marginTop: 14 }}>
          <strong style={{ color: 'white' }}>Learning outcomes</strong>
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            {data.manifest.learningOutcomes.map((outcome, index) => (
              <div key={outcome.id || `${data.manifest.packId}-outcome-${index}`} style={{ padding: 10, borderRadius: 10, background: 'rgba(255,255,255,.04)' }}>
                <div style={{ color: '#ffb27a', fontSize: 11, fontWeight: 800 }}>{outcome.id || `Outcome ${index + 1}`}</div>
                <div style={{ color: 'white', fontSize: 13, marginTop: 3 }}>{language === 'hi' ? outcome.hi : outcome.en}</div>
              </div>
            ))}
            {!data.manifest.learningOutcomes.length && <div style={{ color: '#fcd34d', fontSize: 12 }}>Learning outcomes are not declared in this manifest.</div>}
          </div>
        </div>
      </section>

      <section className={styles.adminPanel} style={{ marginBottom: 18 }}>
        <h2>Learning journey implementation</h2>
        <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>{data.completeness.note}</p>
        <div className={styles.adminList}>
          {data.sequence.map((item) => (
            <div key={item.assetId} className={styles.adminItem}>
              <div className={styles.adminItemTop}>
                <div>
                  <strong>{item.order}. {item.stage} · {language === 'hi' ? item.titleHi : item.titleEn}</strong>
                  <p>{humanStatus(item.type)}{item.durationSecs ? ` · ${Math.round(item.durationSecs / 60)} min` : ''}{item.safetyLevel ? ` · Safety ${item.safetyLevel}` : ''}</p>
                </div>
                <span className={styles.tinyButton} style={statusTone(item.implementationStatus)}>{humanStatus(item.implementationStatus)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.adminPanel} style={{ marginBottom: 18 }}>
        <div className={styles.adminItemTop}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Bilingual learner lesson</h2>
            <strong>{title || `${data.manifest.concept} lesson not staged`}</strong>
            {summary && <p style={{ marginTop: 5 }}>{summary}</p>}
          </div>
          <span className={styles.badge}>{resource?.review_status || 'MISSING'}</span>
        </div>
        {resource ? (
          <>
            <div className={styles.pillRow} style={{ marginTop: 10 }}>
              {resource.class_min && <span className={styles.pill}>Class {resource.class_min}</span>}
              {resource.board_codes.map((board) => <span className={styles.pill} key={board}>{board}</span>)}
              <span className={styles.pill}>{resource.source_code}</span>
              <span className={styles.pill}>{resource.licence}</span>
              {resource.subject_label && <span className={styles.pill}>{resource.subject_label}</span>}
              {resource.topic_label && <span className={styles.pill}>{resource.topic_label}</span>}
            </div>
            <div style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,.82)', lineHeight: 1.75, fontSize: 14, marginTop: 16, padding: 16, borderRadius: 12, background: 'rgba(0,0,0,.18)', maxHeight: 620, overflowY: 'auto' }}>
              {body || 'This language body is missing.'}
            </div>
          </>
        ) : <p style={{ color: '#fca5a5' }}>The pack exists in Git, but its learner resource is not staged in this database.</p>}
      </section>

      <section className={styles.adminPanel} style={{ marginBottom: 18 }}>
        <h2>Bilingual question bank</h2>
        <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 12 }}>Click a question to inspect prompt, options, answer and explanation in English or Hindi.</p>
        <div className={styles.adminList} style={{ marginTop: 12 }}>
          {data.questions.map((question) => {
            const isOpen = openQuestion === question.id;
            const prompt = language === 'hi' ? question.prompt_hi || question.prompt : question.prompt;
            const explanation = language === 'hi' ? question.explanation_hi || question.explanation : question.explanation;
            return (
              <article className={styles.adminItem} key={question.id}>
                <button type="button" onClick={() => setOpenQuestion(isOpen ? null : question.id)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }}>
                  <div className={styles.adminItemTop}>
                    <div>
                      <strong>{question.public_code} · {prompt}</strong>
                      <p>{humanStatus(question.question_type)} · {question.difficulty} · {question.marks} mark{question.marks === 1 ? '' : 's'} · negative {question.negative_marks}</p>
                    </div>
                    <span className={styles.badge}>{question.review_status}</span>
                  </div>
                </button>
                {isOpen && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.08)' }}>
                    {question.options.length > 0 && (
                      <div style={{ display: 'grid', gap: 7 }}>
                        {question.options.map((option) => (
                          <div key={option.key} style={{ color: 'rgba(255,255,255,.8)', fontSize: 13, padding: '7px 9px', borderRadius: 8, background: 'rgba(255,255,255,.035)' }}>
                            <b>{option.key}.</b> {language === 'hi' ? option.textHi || option.text : option.text}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ marginTop: 10, color: '#86efac', fontSize: 12 }}><b>Correct answer:</b> {JSON.stringify(question.correct_answer)}</div>
                    <div style={{ marginTop: 7, color: 'rgba(255,255,255,.68)', fontSize: 12, lineHeight: 1.6 }}><b>Explanation:</b> {explanation || '—'}</div>
                  </div>
                )}
              </article>
            );
          })}
          {!data.questions.length && <p style={{ color: '#fca5a5' }}>No questions from this pack are staged in the database yet.</p>}
        </div>
      </section>

      <section className={styles.adminPanel}>
        <h2>Assessments</h2>
        <div className={styles.adminList} style={{ marginTop: 12 }}>
          {data.assessments.map((assessment) => (
            <article className={styles.adminItem} key={assessment.id}>
              <div className={styles.adminItemTop}>
                <div>
                  <strong>{language === 'hi' ? assessment.title_hi || assessment.title : assessment.title}</strong>
                  <p>{language === 'hi' ? assessment.summary_hi || assessment.summary : assessment.summary}</p>
                </div>
                <span className={styles.badge}>{assessment.review_status}</span>
              </div>
              <div className={styles.pillRow}>
                <span className={styles.pill}>{assessment.assessment_type}</span>
                <span className={styles.pill}>{assessment.questions.length} questions</span>
                <span className={styles.pill}>Pass {assessment.passing_pct}%</span>
                {assessment.time_limit_mins && <span className={styles.pill}>{assessment.time_limit_mins} min</span>}
              </div>
              <div style={{ color: 'rgba(255,255,255,.58)', fontSize: 11, marginTop: 8 }}>
                {assessment.questions.map((question) => question.publicCode).join(' · ')}
              </div>
            </article>
          ))}
          {!data.assessments.length && <p style={{ color: '#fca5a5' }}>Practice and mastery assessments are not staged in the database yet.</p>}
        </div>
      </section>

      <section className={styles.adminPanel} style={{ marginTop: 18 }}>
        <h2>Publication gate</h2>
        <div className={styles.pillRow}>
          {data.manifest.requiredReviews.map((review) => <span className={styles.pill} key={review}>{humanStatus(review)}</span>)}
          {!data.manifest.requiredReviews.length && <span className={styles.pill}>Manifest review policy not declared</span>}
        </div>
        <div style={{ display: 'grid', gap: 7, marginTop: 12, color: 'rgba(255,255,255,.7)', fontSize: 12 }}>
          <div>Database staging: <b style={{ color: data.completeness.resourceCount === data.completeness.expectedResourceCount && data.completeness.questionCount === data.completeness.expectedQuestionCount && data.completeness.assessmentCount === data.completeness.expectedAssessmentCount ? '#86efac' : '#fcd34d' }}>{data.completeness.resourceCount === data.completeness.expectedResourceCount && data.completeness.questionCount === data.completeness.expectedQuestionCount && data.completeness.assessmentCount === data.completeness.expectedAssessmentCount ? 'COMPLETE' : 'INCOMPLETE'}</b></div>
          <div>DRAFT safety: <b style={{ color: data.completeness.allDraft ? '#86efac' : '#fca5a5' }}>{data.completeness.allDraft ? 'PASS' : 'CHECK'}</b></div>
          <div>Bilingual data: <b style={{ color: data.completeness.allBilingual ? '#86efac' : '#fcd34d' }}>{data.completeness.allBilingual ? 'PASS' : 'CHECK'}</b></div>
          <div>Final media: <b style={{ color: data.completeness.mediaBinariesReady ? '#86efac' : '#fcd34d' }}>{data.completeness.mediaBinariesReady ? 'READY' : 'PENDING'}</b></div>
        </div>
        <p style={{ color: data.completeness.mediaBinariesReady ? '#86efac' : '#fcd34d', fontSize: 13, lineHeight: 1.7, marginTop: 12 }}>
          {data.completeness.mediaBinariesReady
            ? 'Media assets are ready for final publication review.'
            : 'Do not treat this multimedia pack as complete yet. Script/specification readiness is shown separately from final video, practical-video, worksheet and audio binaries.'}
        </p>
      </section>
    </div>
  );
}