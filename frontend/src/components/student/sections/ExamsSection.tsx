'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listMyExams, registerExam, startAttempt, submitAttempt } from '@/services/competitionService';
import { apiErrorText } from '@/utils/errors';
import type { CompetitionExam, ExamAttempt, ExamAttemptQuestion, ExamAttemptResult } from '@/types/api';
import type { StudentSectionProps } from '@/types/studentPortal';
import styles from '../StudentPortal.module.css';

type PortalExam = CompetitionExam & {
  subject_codes?: string[] | null;
  max_marks?: string | number | null;
  marks_per_question?: string | number | null;
  correct_count?: number | null;
  rank_school?: string | number | null;
  rank_overall?: string | number | null;
  attempt_id?: string | null;
};

type PortalQuestionSource = ExamAttemptQuestion & {
  option_a?: string | null;
  option_b?: string | null;
  option_c?: string | null;
  option_d?: string | null;
};

interface PortalQuestion {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

interface PortalAttempt {
  attemptId: string;
  endsAt: string;
  exam: {
    id: string;
    title: string;
    totalQuestions: number;
    durationMins: number;
    instructions?: string | null;
  };
  questions: PortalQuestion[];
}

type PortalAttemptExam = CompetitionExam & {
  totalQuestions?: number;
  durationMins?: number;
  instructions?: string | null;
};

function niceDate(value: string | number | Date | null | undefined): string {
  if (!value) return 'TBA';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function statusClass(status: string): string {
  if (status === 'LIVE') return `${styles.status} ${styles.statusLive}`;
  if (status === 'COMPLETED') return `${styles.status} ${styles.statusCompleted}`;
  return `${styles.status} ${styles.statusRegistration}`;
}

function normalizeAttempt(payload: ExamAttempt): PortalAttempt {
  const exam = payload.exam as PortalAttemptExam;
  const questions = payload.questions.map(question => {
    const row = question as PortalQuestionSource;
    return {
      id: row.id,
      question_text: row.question_text || row.question || '',
      option_a: row.option_a || row.options?.[0] || '',
      option_b: row.option_b || row.options?.[1] || '',
      option_c: row.option_c || row.options?.[2] || '',
      option_d: row.option_d || row.options?.[3] || '',
    };
  });
  return {
    attemptId: payload.attemptId || payload.id || '',
    endsAt: payload.endsAt,
    exam: {
      id: exam.id,
      title: exam.title,
      totalQuestions: exam.totalQuestions ?? exam.total_questions ?? questions.length,
      durationMins: exam.durationMins ?? exam.duration_mins ?? 0,
      instructions: exam.instructions,
    },
    questions,
  };
}

export default function ExamsSection({ notify, refreshDashboard }: StudentSectionProps) {
  const qc = useQueryClient();
  const [attempt, setAttempt] = useState<PortalAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ExamAttemptResult | null>(null);
  const [now, setNow] = useState(Date.now());

  const examsQuery = useQuery<PortalExam[]>({
    queryKey: ['my-exams'],
    queryFn: async () => (await listMyExams()).data.data as PortalExam[],
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!attempt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [attempt]);

  const registerMutation = useMutation({
    mutationFn: (examId: string) => registerExam(examId),
    onSuccess: async () => {
      notify('✅ Competition registration confirmed.');
      await qc.invalidateQueries({ queryKey: ['my-exams'] });
      await refreshDashboard();
    },
    onError: (error: unknown) => notify(`⚠️ ${apiErrorText(error, 'Competition request failed')}`),
  });

  const startMutation = useMutation({
    mutationFn: (examId: string) => startAttempt(examId),
    onSuccess: response => {
      setAttempt(normalizeAttempt(response.data.data));
      setAnswers({});
      setResult(null);
      setNow(Date.now());
    },
    onError: (error: unknown) => notify(`⚠️ ${apiErrorText(error, 'Competition request failed')}`),
  });

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!attempt) throw new Error('No active competition attempt');
      return submitAttempt(
        attempt.attemptId,
        attempt.questions.map(question => ({ questionId: question.id, selectedOption: answers[question.id] || null }))
      );
    },
    onSuccess: async response => {
      const payload = response.data.data;
      setResult(payload);
      notify(`🎯 Competition submitted · Score ${payload.score ?? 0}/${payload.maxMarks ?? 0}`);
      await qc.invalidateQueries({ queryKey: ['my-exams'] });
      await refreshDashboard();
    },
    onError: (error: unknown) => notify(`⚠️ ${apiErrorText(error, 'Competition request failed')}`),
  });

  const remaining = useMemo(() => {
    if (!attempt?.endsAt) return null;
    const seconds = Math.max(0, Math.floor((new Date(attempt.endsAt).getTime() - now) / 1000));
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }, [attempt?.endsAt, now]);

  useEffect(() => {
    if (attempt && remaining === '0:00' && !result && !submitMutation.isPending) submitMutation.mutate();
  }, [remaining]); // eslint-disable-line react-hooks/exhaustive-deps

  const exams = examsQuery.data || [];

  return (
    <>
      <div className={styles.sectionHeader}>
        <div><h1 className={styles.title}>🏆 Competitions & Challenges</h1><div className={styles.subtitle}>Register for academic competitions, take live challenges and see scored attempts from the real competition engine.</div></div>
      </div>

      {examsQuery.isLoading && <div className={styles.loading}>Loading competitions…</div>}
      {examsQuery.isError && <div className={styles.error}>{apiErrorText(examsQuery.error, 'Competition request failed')}</div>}
      {exams.map(exam => {
        const maxMarks = Number(exam.max_marks || Number(exam.total_questions || 0) * Number(exam.marks_per_question || 0));
        return (
          <div className={styles.examCard} key={exam.id}>
            <div className={styles.examTop}>
              <div>
                <div className={styles.examTitle}>{exam.title}</div>
                <div className={styles.examMeta}>
                  <span>{(exam.subject_codes || []).join(', ') || 'All Subjects'}</span>
                  <span>⏱ {exam.duration_mins || 0} min</span>
                  <span>📝 {exam.total_questions || 0} questions</span>
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
              {exam.status === 'LIVE' && exam.attempt_status !== 'SCORED' && <button className={styles.primary} disabled={startMutation.isPending} onClick={() => startMutation.mutate(exam.id)}>{exam.attempt_status === 'IN_PROGRESS' ? 'Continue Challenge →' : 'Start Challenge →'}</button>}
              {exam.status === 'COMPLETED' && !exam.attempt_id && <span className={styles.muted}>No attempt recorded</span>}
            </div>
          </div>
        );
      })}
      {!examsQuery.isLoading && !exams.length && <div className={styles.empty}>No competitions are currently available for your class.</div>}

      {attempt && (
        <div className={styles.modalBackdrop}>
          <div className={`${styles.modal} ${styles.modalWide}`}>
            <div className={styles.modalHeader}>
              <div><div className={styles.modalTitle}>🏆 {attempt.exam.title}</div><div className={styles.muted}>{attempt.exam.totalQuestions} questions · {attempt.exam.durationMins} minutes</div></div>
              <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 800, color: remaining && remaining.startsWith('0:') ? '#c62828' : '#ff6b00' }}>⏱ {remaining || '—'}</div>{result && <button className={styles.close} style={{ marginTop: 8 }} onClick={() => setAttempt(null)}>✕</button>}</div>
            </div>

            {attempt.exam.instructions && <div className={styles.card} style={{ boxShadow: 'none' }}>{attempt.exam.instructions}</div>}
            {attempt.questions.map((question, index) => (
              <div className={styles.question} key={question.id}>
                <div className={styles.questionText}>{index + 1}. {question.question_text}</div>
                {(['A', 'B', 'C', 'D'] as const).map(letter => {
                  const option = letter === 'A' ? question.option_a : letter === 'B' ? question.option_b : letter === 'C' ? question.option_c : question.option_d;
                  return (
                    <label className={styles.option} key={letter}>
                      <input type="radio" disabled={Boolean(result)} name={`exam-${question.id}`} checked={answers[question.id] === letter} onChange={() => setAnswers(value => ({ ...value, [question.id]: letter }))} />
                      <span><b>{letter}.</b> {option}</span>
                    </label>
                  );
                })}
              </div>
            ))}

            {result && <div className={styles.success}>Submitted successfully · <b>{result.score ?? 0}/{result.maxMarks ?? 0}</b> · {result.correctCount || 0} correct · {result.wrongCount || 0} wrong · {result.skippedCount || 0} skipped{result.rankOverall ? ` · Rank #${result.rankOverall}` : ''}</div>}
            <div className={styles.buttonRow}>
              {result ? <button className={styles.primary} onClick={() => setAttempt(null)}>Done</button> : <button className={styles.primary} disabled={submitMutation.isPending} onClick={() => submitMutation.mutate()}>{submitMutation.isPending ? 'Submitting…' : 'Submit Competition'}</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
