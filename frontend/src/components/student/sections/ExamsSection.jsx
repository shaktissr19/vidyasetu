'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listMyExams, registerExam, startAttempt, submitAttempt } from '@/services/competitionService';
import styles from '../StudentPortal.module.css';

const data = r => r?.data?.data;
const err = e => e?.response?.data?.error?.message || e?.message || 'Exam request failed';

function niceDate(value) {
  if (!value) return 'TBA';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function statusClass(status) {
  if (status === 'LIVE') return `${styles.status} ${styles.statusLive}`;
  if (status === 'COMPLETED') return `${styles.status} ${styles.statusCompleted}`;
  return `${styles.status} ${styles.statusRegistration}`;
}

export default function ExamsSection({ notify, refreshDashboard }) {
  const qc = useQueryClient();
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [now, setNow] = useState(Date.now());

  const examsQuery = useQuery({
    queryKey: ['my-exams'],
    queryFn: async () => data(await listMyExams()) || [],
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!attempt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [attempt]);

  const registerMutation = useMutation({
    mutationFn: examId => registerExam(examId),
    onSuccess: async () => {
      notify('✅ Exam registration confirmed.');
      await qc.invalidateQueries({ queryKey: ['my-exams'] });
      await refreshDashboard();
    },
    onError: e => notify(`⚠️ ${err(e)}`),
  });

  const startMutation = useMutation({
    mutationFn: examId => startAttempt(examId),
    onSuccess: response => {
      setAttempt(data(response));
      setAnswers({});
      setResult(null);
      setNow(Date.now());
    },
    onError: e => notify(`⚠️ ${err(e)}`),
  });

  const submitMutation = useMutation({
    mutationFn: () => submitAttempt(
      attempt.attemptId,
      attempt.questions.map(q => ({ questionId: q.id, selectedOption: answers[q.id] || null }))
    ),
    onSuccess: async response => {
      const payload = data(response);
      setResult(payload);
      notify(`🎯 Exam submitted · Score ${payload.score}/${payload.maxMarks}`);
      await qc.invalidateQueries({ queryKey: ['my-exams'] });
      await refreshDashboard();
    },
    onError: e => notify(`⚠️ ${err(e)}`),
  });

  const remaining = useMemo(() => {
    if (!attempt?.endsAt) return null;
    const seconds = Math.max(0, Math.floor((new Date(attempt.endsAt).getTime() - now) / 1000));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }, [attempt?.endsAt, now]);

  useEffect(() => {
    if (attempt && remaining === '0:00' && !result && !submitMutation.isPending) submitMutation.mutate();
  }, [remaining]); // eslint-disable-line react-hooks/exhaustive-deps

  const exams = examsQuery.data || [];

  return (
    <>
      <div className={styles.sectionHeader}>
        <div><h1 className={styles.title}>📝 Exams & Tests</h1><div className={styles.subtitle}>Register, take live tests and see scored attempts from the real exam engine.</div></div>
      </div>

      {examsQuery.isLoading && <div className={styles.loading}>Loading exams…</div>}
      {examsQuery.isError && <div className={styles.error}>{err(examsQuery.error)}</div>}
      {exams.map(exam => {
        const maxMarks = Number(exam.max_marks || Number(exam.total_questions || 0) * Number(exam.marks_per_question || 0));
        return (
          <div className={styles.examCard} key={exam.id}>
            <div className={styles.examTop}>
              <div>
                <div className={styles.examTitle}>{exam.title}</div>
                <div className={styles.examMeta}>
                  <span>{(exam.subject_codes || []).join(', ') || 'All Subjects'}</span>
                  <span>⏱ {exam.duration_mins} min</span>
                  <span>📝 {exam.total_questions} questions</span>
                  <span>📅 {niceDate(exam.start_time)}</span>
                  {Number(exam.prize_pool || 0) > 0 && <span>🏆 ₹{Number(exam.prize_pool).toLocaleString('en-IN')}</span>}
                </div>
              </div>
              <span className={statusClass(exam.status)}>{exam.status.replaceAll('_', ' ')}</span>
            </div>

            {exam.attempt_status === 'SCORED' && (
              <div className={styles.success} style={{ marginTop: 14, marginBottom: 0 }}>
                Score <b>{Number(exam.total_marks || 0)}/{maxMarks}</b> · Correct {exam.correct_count || 0} · School rank {exam.rank_school ? `#${exam.rank_school}` : '—'} · Overall rank {exam.rank_overall ? `#${exam.rank_overall}` : '—'}
              </div>
            )}

            <div className={styles.examActions}>
              {exam.status === 'REGISTRATION_OPEN' && !exam.registration_id && <button className={styles.primary} disabled={registerMutation.isPending} onClick={() => registerMutation.mutate(exam.id)}>Register</button>}
              {exam.status === 'REGISTRATION_OPEN' && exam.registration_id && <span className={styles.statusResolved}>✅ Registered</span>}
              {exam.status === 'LIVE' && exam.attempt_status !== 'SCORED' && <button className={styles.primary} disabled={startMutation.isPending} onClick={() => startMutation.mutate(exam.id)}>{exam.attempt_status === 'IN_PROGRESS' ? 'Continue Exam →' : 'Start Exam →'}</button>}
              {exam.status === 'COMPLETED' && !exam.attempt_id && <span className={styles.muted}>No attempt recorded</span>}
            </div>
          </div>
        );
      })}
      {!examsQuery.isLoading && !exams.length && <div className={styles.empty}>No exams are currently available for your class.</div>}

      {attempt && (
        <div className={styles.modalBackdrop}>
          <div className={`${styles.modal} ${styles.modalWide}`}>
            <div className={styles.modalHeader}>
              <div><div className={styles.modalTitle}>📝 {attempt.exam.title}</div><div className={styles.muted}>{attempt.exam.totalQuestions} questions · {attempt.exam.durationMins} minutes</div></div>
              <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 800, color: remaining && remaining.startsWith('0:') ? '#c62828' : '#ff6b00' }}>⏱ {remaining || '—'}</div>{result && <button className={styles.close} style={{ marginTop: 8 }} onClick={() => setAttempt(null)}>✕</button>}</div>
            </div>

            {attempt.exam.instructions && <div className={styles.card} style={{ boxShadow: 'none' }}>{attempt.exam.instructions}</div>}
            {attempt.questions.map((q, index) => (
              <div className={styles.question} key={q.id}>
                <div className={styles.questionText}>{index + 1}. {q.question_text}</div>
                {['A', 'B', 'C', 'D'].map(letter => (
                  <label className={styles.option} key={letter}>
                    <input type="radio" disabled={!!result} name={`exam-${q.id}`} checked={answers[q.id] === letter} onChange={() => setAnswers(v => ({ ...v, [q.id]: letter }))} />
                    <span><b>{letter}.</b> {q[`option_${letter.toLowerCase()}`]}</span>
                  </label>
                ))}
              </div>
            ))}

            {result && <div className={styles.success}>Submitted successfully · <b>{result.score}/{result.maxMarks}</b> · {result.correctCount} correct · {result.wrongCount} wrong · {result.skippedCount} skipped{result.rankOverall ? ` · Rank #${result.rankOverall}` : ''}</div>}
            <div className={styles.buttonRow}>
              {result ? <button className={styles.primary} onClick={() => setAttempt(null)}>Done</button> : <button className={styles.primary} disabled={submitMutation.isPending} onClick={() => submitMutation.mutate()}>{submitMutation.isPending ? 'Submitting…' : 'Submit Exam'}</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
