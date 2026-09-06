'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  startAttempt,
  submitAttempt,
  type CompetitionAttempt,
  type CompetitionSubmitResult,
} from '@/services/competitionService';
import { apiErrorText } from '@/utils/errors';
import useLanguageStore from '@/store/languageStore';

const OPTIONS = ['A', 'B', 'C', 'D'] as const;

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function CompetitionAttemptPage() {
  const params = useParams<{ examId: string }>();
  const examId = typeof params?.examId === 'string' ? params.examId : '';
  const { lang, t } = useLanguageStore();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<CompetitionSubmitResult | null>(null);

  const { data: attempt, isLoading, error } = useQuery<CompetitionAttempt>({
    queryKey: ['competition-attempt', examId],
    queryFn: () => startAttempt(examId).then((response) => response.data.data),
    enabled: Boolean(examId),
    retry: false,
    staleTime: Infinity,
  });

  const storageKey = attempt?.attemptId ? `vidyasetu:competition:${attempt.attemptId}:answers` : '';

  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = window.sessionStorage.getItem(storageKey);
      if (saved) setAnswers(JSON.parse(saved) as Record<string, string>);
    } catch {
      // A corrupt browser snapshot must never block the competition attempt.
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    window.sessionStorage.setItem(storageKey, JSON.stringify(answers));
  }, [answers, storageKey]);

  useEffect(() => {
    if (!attempt?.endsAt || submitted) return;
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((new Date(attempt.endsAt).getTime() - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [attempt?.endsAt, submitted]);

  useEffect(() => {
    if (!attempt || submitted) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [attempt, submitted]);

  const submitCurrent = useCallback(async (automatic = false) => {
    if (!attempt || submitting || submitted) return;
    setSubmitting(true);
    try {
      const payload = attempt.questions.map((question) => ({
        questionId: question.id,
        selectedOption: answers[question.id] || null,
      }));
      const result = (await submitAttempt(attempt.attemptId, payload)).data.data;
      setSubmitted(result);
      if (storageKey) window.sessionStorage.removeItem(storageKey);
      toast.success(automatic ? t('समय पूरा — उत्तर सुरक्षित रूप से जमा हो गए।', 'Time is up — your answers were submitted safely.') : t('प्रतियोगिता जमा हो गई।', 'Competition submitted.'));
    } catch (submitError: unknown) {
      toast.error(apiErrorText(submitError, 'Could not submit the competition. Please retry.'));
    } finally {
      setSubmitting(false);
    }
  }, [answers, attempt, storageKey, submitted, submitting, t]);

  useEffect(() => {
    if (!attempt || submitted || submitting || secondsLeft > 0) return;
    const deadline = new Date(attempt.endsAt).getTime();
    if (Date.now() >= deadline) void submitCurrent(true);
  }, [attempt, secondsLeft, submitCurrent, submitted, submitting]);

  const answeredCount = useMemo(() => Object.values(answers).filter(Boolean).length, [answers]);

  if (isLoading) return <div className="card" style={{ padding: 32 }}>{t('प्रतियोगिता तैयार हो रही है…', 'Preparing your competition attempt…')}</div>;
  if (error || !attempt) {
    return (
      <div className="card" style={{ padding: 32 }}>
        <h1 className="font-display font-extrabold text-xl" style={{ color: 'var(--navy)' }}>{t('प्रतियोगिता शुरू नहीं हो सकी', 'Competition could not start')}</h1>
        <p style={{ color: 'var(--slate)', marginTop: 8 }}>{apiErrorText(error, 'Check the competition window and your registration, then try again.')}</p>
        <Link href="/exams" className="btn-primary" style={{ marginTop: 16, display: 'inline-flex' }}>{t('प्रतियोगिताओं पर वापस जाएँ', 'Back to competitions')}</Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="card" style={{ maxWidth: 760, margin: '24px auto', padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 52 }}>✅</div>
        <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--navy)', marginTop: 8 }}>{t('प्रयास सुरक्षित रूप से जमा हुआ', 'Attempt submitted safely')}</h1>
        <p style={{ color: 'var(--slate)', marginTop: 10 }}>{submitted.message || t('आधिकारिक परिणाम जारी होने पर आपका स्कोर और रैंक दिखाई देंगे।', 'Your score and rank will appear when official results are released.')}</p>
        {submitted.integrityStatus === 'FLAGGED' && (
          <div style={{ marginTop: 16, borderRadius: 12, background: '#FFF4E5', padding: 12, color: '#8A4B00' }}>
            {t('एक टाइमिंग इंटीग्रिटी फ्लैग समीक्षा के लिए दर्ज हुआ है। इससे अपने-आप अयोग्यता नहीं होती।', 'A timing integrity flag was recorded for review. A flag does not automatically mean disqualification.')}
          </div>
        )}
        {submitted.released && submitted.score != null && (
          <div style={{ marginTop: 20, fontSize: 28, fontWeight: 900, color: 'var(--forest)' }}>{submitted.score}/{submitted.maxMarks ?? '—'}</div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 22 }}>
          <Link href={`/exams/results/${attempt.attemptId}`} className="btn-primary">{t('परिणाम स्थिति देखें', 'View result status')}</Link>
          <Link href="/exams" className="btn-outline">{t('मेरी प्रतियोगिताएँ', 'My competitions')}</Link>
        </div>
      </div>
    );
  }

  const question = attempt.questions[activeIndex];
  if (!question) return <div className="card">{t('इस प्रतियोगिता में कोई प्रश्न उपलब्ध नहीं है।', 'No questions are available in this competition.')}</div>;
  const questionText = lang === 'hi' && question.question_hi ? question.question_hi : question.question_text;
  const optionText = (key: typeof OPTIONS[number]) => {
    const lower = key.toLowerCase() as 'a' | 'b' | 'c' | 'd';
    const hi = question[`option_${lower}_hi` as const];
    const en = question[`option_${lower}` as const];
    return lang === 'hi' && hi ? hi : en;
  };

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <div className="card" style={{ position: 'sticky', top: 76, zIndex: 10, marginBottom: 14, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div className="font-display font-extrabold" style={{ color: 'var(--navy)' }}>{lang === 'hi' && attempt.exam.titleHi ? attempt.exam.titleHi : attempt.exam.title}</div>
            <div style={{ color: 'var(--slate)', fontSize: 13, marginTop: 2 }}>{answeredCount}/{attempt.questions.length} {t('उत्तर दिए', 'answered')}</div>
          </div>
          <div style={{ minWidth: 120, borderRadius: 12, padding: '10px 14px', textAlign: 'center', background: secondsLeft <= 60 ? '#FDECEC' : '#EEF6FF', color: secondsLeft <= 60 ? '#A61B1B' : 'var(--navy)', fontWeight: 900, fontSize: 20 }}>
            ⏱ {formatClock(secondsLeft)}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 230px', gap: 16 }}>
        <section className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 14, color: 'var(--slate)', fontSize: 13 }}>
            <span>{t('प्रश्न', 'Question')} {activeIndex + 1} / {attempt.questions.length}</span>
            <span>{question.subject_code || ''} {question.difficulty ? `· ${question.difficulty}` : ''}</span>
          </div>
          <h2 className="font-display font-bold" style={{ color: 'var(--navy)', fontSize: 20, lineHeight: 1.45 }}>{questionText}</h2>
          <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
            {OPTIONS.map((key) => {
              const selected = answers[question.id] === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAnswers((current) => ({ ...current, [question.id]: key }))}
                  style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left', padding: 14,
                    borderRadius: 12, border: selected ? '2px solid var(--saffron)' : '1px solid var(--border)',
                    background: selected ? '#FFF8EF' : 'white', color: 'var(--navy)', cursor: 'pointer',
                  }}
                >
                  <strong style={{ width: 26, height: 26, borderRadius: 99, display: 'grid', placeItems: 'center', background: selected ? 'var(--saffron)' : '#EEF2F7', color: selected ? 'white' : 'var(--navy)' }}>{key}</strong>
                  <span style={{ paddingTop: 3 }}>{optionText(key)}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 22 }}>
            <button className="btn-outline" disabled={activeIndex === 0} onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}>← {t('पिछला', 'Previous')}</button>
            {activeIndex < attempt.questions.length - 1
              ? <button className="btn-primary" onClick={() => setActiveIndex((index) => Math.min(attempt.questions.length - 1, index + 1))}>{t('अगला', 'Next')} →</button>
              : <button className="btn-primary" disabled={submitting} onClick={() => void submitCurrent(false)}>{submitting ? t('जमा हो रहा है…', 'Submitting…') : t('प्रतियोगिता जमा करें', 'Submit competition')}</button>}
          </div>
        </section>

        <aside className="card" style={{ padding: 16, alignSelf: 'start' }}>
          <strong style={{ color: 'var(--navy)' }}>{t('प्रश्न नेविगेशन', 'Question navigator')}</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginTop: 12 }}>
            {attempt.questions.map((item, index) => (
              <button key={item.id} onClick={() => setActiveIndex(index)} title={`${t('प्रश्न', 'Question')} ${index + 1}`}
                style={{ height: 34, borderRadius: 8, border: index === activeIndex ? '2px solid var(--navy)' : '1px solid var(--border)', background: answers[item.id] ? 'var(--forest-pale)' : 'white', color: answers[item.id] ? 'var(--forest)' : 'var(--slate)', fontWeight: 800, cursor: 'pointer' }}>
                {index + 1}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 16, color: 'var(--slate)', fontSize: 12, lineHeight: 1.5 }}>
            {t('समय सर्वर द्वारा नियंत्रित है। सही उत्तर प्रतियोगिता के दौरान कभी नहीं दिखाए जाते।', 'Timing is enforced by the server. Correct answers are never exposed while the competition is active.')}
          </div>
          <button className="btn-outline" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} disabled={submitting} onClick={() => void submitCurrent(false)}>{t('अभी जमा करें', 'Submit now')}</button>
        </aside>
      </div>
    </div>
  );
}
