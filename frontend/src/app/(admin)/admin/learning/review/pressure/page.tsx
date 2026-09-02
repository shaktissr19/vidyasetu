'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPressureReview } from '@/services/pressureReviewService';
import styles from '@/components/public/publicLearning.module.css';

function statusTone(status: string): React.CSSProperties {
  if (status === 'STAGED_DRAFT') return { borderColor: '#22c55e', color: '#86efac' };
  if (status === 'PRODUCTION_SCRIPT_READY') return { borderColor: '#f59e0b', color: '#fcd34d' };
  return { borderColor: '#ef4444', color: '#fca5a5' };
}

export default function PressureReviewPage() {
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);

  const reviewQuery = useQuery({
    queryKey: ['pressure-review-v1'],
    queryFn: () => getPressureReview().then((response) => response.data.data),
  });

  if (reviewQuery.isLoading) {
    return <div className={styles.studio}><p style={{ color: 'white' }}>Loading Pressure review…</p></div>;
  }

  if (reviewQuery.isError || !reviewQuery.data) {
    return (
      <div className={styles.studio}>
        <h1 style={{ color: 'white' }}>Pressure review unavailable</h1>
        <p style={{ color: 'rgba(255,255,255,.6)' }}>The review API could not load the staged Pressure pack.</p>
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
        <div style={{ color: '#ff9a3c', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>CONTENT PILOT REVIEW</div>
        <h1 style={{ color: 'white', fontSize: 34, margin: '6px 0' }}>🧪 Class 8 Science · Pressure / दाब</h1>
        <p style={{ color: 'rgba(255,255,255,.58)', maxWidth: 960, lineHeight: 1.7 }}>
          One screen for academic, bilingual and implementation review before anything is published to students.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <Link className={styles.tinyButton} href="/admin/learning">← Learning Studio</Link>
          <Link className={styles.tinyButton} href="/admin/learning/practice">Question Bank & Practice</Link>
          <button type="button" className={styles.tinyButton} style={language === 'en' ? { borderColor: '#ff8d32', color: '#ffb27a' } : undefined} onClick={() => setLanguage('en')}>English</button>
          <button type="button" className={styles.tinyButton} style={language === 'hi' ? { borderColor: '#ff8d32', color: '#ffb27a' } : undefined} onClick={() => setLanguage('hi')}>हिंदी</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          ['Lesson', data.completeness.resourceCount === 1 ? '1 / 1' : `${data.completeness.resourceCount} / 1`],
          ['Questions', `${data.completeness.questionCount} / 12`],
          ['Assessments', `${data.completeness.assessmentCount} / 2`],
          ['Bilingual', data.completeness.allBilingual ? 'PASS' : 'CHECK'],
          ['Media binaries', data.completeness.mediaBinariesReady ? 'READY' : 'PENDING'],
        ].map(([label, value]) => (
          <div key={label} className={styles.adminPanel} style={{ padding: 14 }}>
            <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 11 }}>{label}</div>
            <div style={{ color: 'white', fontWeight: 900, fontSize: 20, marginTop: 4 }}>{value}</div>
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
            {data.manifest.learningOutcomes.map((outcome) => (
              <div key={outcome.id} style={{ padding: 10, borderRadius: 10, background: 'rgba(255,255,255,.04)' }}>
                <div style={{ color: '#ffb27a', fontSize: 11, fontWeight: 800 }}>{outcome.id}</div>
                <div style={{ color: 'white', fontSize: 13, marginTop: 3 }}>{language === 'hi' ? outcome.hi : outcome.en}</div>
              </div>
            ))}
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
                  <p>{item.type}{item.durationSecs ? ` · ${Math.round(item.durationSecs / 60)} min` : ''}{item.safetyLevel ? ` · Safety ${item.safetyLevel}` : ''}</p>
                </div>
                <span className={styles.tinyButton} style={statusTone(item.implementationStatus)}>{item.implementationStatus.replaceAll('_', ' ')}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.adminPanel} style={{ marginBottom: 18 }}>
        <div className={styles.adminItemTop}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Bilingual learner lesson</h2>
            <strong>{title || 'Pressure lesson missing'}</strong>
            {summary && <p style={{ marginTop: 5 }}>{summary}</p>}
          </div>
          <span className={styles.badge}>{resource?.review_status || 'MISSING'}</span>
        </div>
        {resource ? (
          <>
            <div className={styles.pillRow} style={{ marginTop: 10 }}>
              <span className={styles.pill}>Class {resource.class_min}</span>
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
        ) : <p style={{ color: '#fca5a5' }}>Staged resource not found.</p>}
      </section>

      <section className={styles.adminPanel} style={{ marginBottom: 18 }}>
        <h2>12-question bilingual bank</h2>
        <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 12 }}>Click a question to inspect Hindi/English prompt, options, answer and explanation.</p>
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
                      <p>{question.question_type.replaceAll('_', ' ')} · {question.difficulty} · {question.marks} mark</p>
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
        </div>
      </section>

      <section className={styles.adminPanel} style={{ marginTop: 18 }}>
        <h2>Publication gate</h2>
        <div className={styles.pillRow}>
          {data.manifest.requiredReviews.map((review) => <span className={styles.pill} key={review}>{review.replaceAll('_', ' ')}</span>)}
        </div>
        <p style={{ color: data.completeness.mediaBinariesReady ? '#86efac' : '#fcd34d', fontSize: 13, lineHeight: 1.7, marginTop: 12 }}>
          {data.completeness.mediaBinariesReady
            ? 'Media assets are ready for final publication review.'
            : 'Do not publish the full multimedia pack yet. The bilingual lesson, questions and assessments are staged; final video, practical-video, worksheet and audio binaries still need production.'}
        </p>
      </section>
    </div>
  );
}
