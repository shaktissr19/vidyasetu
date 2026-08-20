'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getSubjects,
  getChapters,
  getContentItems,
  getContentUrl,
  markComplete,
  getQuiz,
  submitQuiz,
  downloadOffline,
} from '@/services/contentService';
import styles from '../StudentPortal.module.css';

const ICONS = { MATH: '🔢', SCI: '🔬', ENG: '📖', HIN: '🅗', SST: '🌍', SAN: '🕉️' };
const data = (r) => r?.data?.data;
const errorText = (e) => e?.response?.data?.error?.message || e?.message || 'Something went wrong';

export default function SubjectsSection({ dashboard, student, notify, refreshDashboard }) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [quizItem, setQuizItem] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizResult, setQuizResult] = useState(null);

  const cls = student?.className || '8';
  const lang = student?.language || 'hi';

  const subjectsQuery = useQuery({
    queryKey: ['subjects', cls],
    queryFn: async () => data(await getSubjects(cls)) || [],
  });
  const chaptersQuery = useQuery({
    queryKey: ['chapters', subject?.id, cls],
    queryFn: async () => data(await getChapters(subject.id, cls)) || [],
    enabled: !!subject,
  });
  const itemsQuery = useQuery({
    queryKey: ['content-items', chapter?.id, lang],
    queryFn: async () => data(await getContentItems(chapter.id, lang)) || [],
    enabled: !!chapter,
  });
  const quizQuery = useQuery({
    queryKey: ['quiz', quizItem?.id],
    queryFn: async () => data(await getQuiz(quizItem.id)) || [],
    enabled: !!quizItem,
  });

  const progressBySubject = useMemo(() => Object.fromEntries(
    (dashboard?.subjectProgress || []).map(s => [s.subject_id, s])
  ), [dashboard]);

  useEffect(() => {
    setChapter(null);
  }, [subject?.id]);

  const completeMutation = useMutation({
    mutationFn: (itemId) => markComplete(itemId),
    onSuccess: async () => {
      notify('✅ Lesson marked complete. Learning progress updated.');
      await queryClient.invalidateQueries({ queryKey: ['content-items'] });
      await refreshDashboard();
    },
    onError: e => notify(`⚠️ ${errorText(e)}`),
  });

  const quizMutation = useMutation({
    mutationFn: () => submitQuiz(
      quizItem.id,
      (quizQuery.data || []).map(q => ({ questionId: q.id, selectedOption: quizAnswers[q.id] || null }))
    ),
    onSuccess: async response => {
      const result = data(response);
      setQuizResult(result);
      notify(result?.passed ? `🎉 Quiz passed: ${result.score}%` : `Quiz score: ${result?.score || 0}%. Try again.`);
      await queryClient.invalidateQueries({ queryKey: ['content-items'] });
      await refreshDashboard();
    },
    onError: e => notify(`⚠️ ${errorText(e)}`),
  });

  async function openContent(item) {
    try {
      const response = await getContentUrl(item.id);
      const payload = data(response);
      if (!payload?.url) throw new Error('Content URL unavailable');
      const url = payload.url.startsWith('/') ? `${window.location.origin}${payload.url}` : payload.url;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      notify(`⚠️ ${errorText(e)}`);
    }
  }

  async function saveOffline(item) {
    try {
      const response = await downloadOffline(item.id);
      const payload = data(response);
      if (payload?.url && 'caches' in window) {
        const absolute = payload.url.startsWith('/') ? `${window.location.origin}${payload.url}` : payload.url;
        const cache = await caches.open('vidyasetu-learning-v1');
        const fetched = await fetch(absolute, { credentials: 'include' });
        if (fetched.ok) await cache.put(absolute, fetched.clone());
      }
      notify('📥 Saved to your Offline Mode list.');
      queryClient.invalidateQueries({ queryKey: ['offline-downloads'] });
    } catch (e) {
      notify(`⚠️ ${errorText(e)}`);
    }
  }

  function openQuiz(item) {
    setQuizItem(item);
    setQuizAnswers({});
    setQuizResult(null);
  }

  function closeQuiz() {
    setQuizItem(null);
    setQuizAnswers({});
    setQuizResult(null);
  }

  if (subjectsQuery.isLoading) return <div className={styles.loading}>Loading your subjects…</div>;
  if (subjectsQuery.isError) return <div className={styles.error}>{errorText(subjectsQuery.error)}</div>;

  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <h1 className={styles.title}>📚 My Subjects</h1>
          <div className={styles.subtitle}>Class {student?.classLabel} · real chapter, content and quiz progress</div>
        </div>
      </div>

      {!subject && (
        <div className={styles.subjectGrid}>
          {(subjectsQuery.data || []).map(sub => {
            const p = progressBySubject[sub.id] || {};
            const pct = Number(p.progress_pct || 0);
            return (
              <button className={styles.subjectCard} key={sub.id} onClick={() => setSubject(sub)}>
                <div className={styles.subjectIcon}>{ICONS[sub.code] || '📘'}</div>
                <div className={styles.subjectName}>{sub.name}</div>
                <div className={styles.smallTrack}><div className={styles.smallFill} style={{ width: `${pct}%`, background: sub.color_hex || '#ff6b00' }} /></div>
                <div className={styles.subjectMeta}><span className={styles.subjectPct}>{pct}% complete</span> · {Number(sub.chapter_count || 0)} chapters<br />{Number(p.completed_items || 0)} / {Number(p.total_items || 0)} learning items completed</div>
              </button>
            );
          })}
        </div>
      )}

      {subject && !chapter && (
        <>
          <button className={styles.backLink} onClick={() => setSubject(null)}>← All subjects</button>
          <div className={styles.card}>
            <div className={styles.cardTitle}>{ICONS[subject.code] || '📘'} {subject.name} · Class {cls}</div>
            {chaptersQuery.isLoading && <div className={styles.loading}>Loading chapters…</div>}
            {chaptersQuery.isError && <div className={styles.error}>{errorText(chaptersQuery.error)}</div>}
            <div className={styles.chapterList}>
              {(chaptersQuery.data || []).map(ch => (
                <button className={styles.chapter} key={ch.id} onClick={() => setChapter(ch)}>
                  <div>
                    <div className={styles.chapterNum}>Chapter {ch.chapter_number}</div>
                    <div className={styles.chapterTitle}>{lang === 'hi' && ch.title_hi ? ch.title_hi : ch.title}</div>
                    <div className={styles.chapterCounts}>{Number(ch.video_count || 0)} videos · {Number(ch.pdf_count || 0)} PDFs · {Number(ch.notes_count || 0)} notes · {Number(ch.quiz_count || 0)} quizzes</div>
                  </div>
                  <span>›</span>
                </button>
              ))}
              {!chaptersQuery.isLoading && !(chaptersQuery.data || []).length && <div className={styles.empty}>No chapters have been published for this subject yet.</div>}
            </div>
          </div>
        </>
      )}

      {subject && chapter && (
        <>
          <button className={styles.backLink} onClick={() => setChapter(null)}>← {subject.name} chapters</button>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Chapter {chapter.chapter_number}: {lang === 'hi' && chapter.title_hi ? chapter.title_hi : chapter.title}</div>
            {itemsQuery.isLoading && <div className={styles.loading}>Loading learning content…</div>}
            {itemsQuery.isError && <div className={styles.error}>{errorText(itemsQuery.error)}</div>}
            <div className={styles.contentGrid}>
              {(itemsQuery.data || []).map(item => (
                <div className={styles.contentItem} key={item.id}>
                  <div className={styles.contentTop}>
                    <span className={styles.contentType}>{item.type}</span>
                    {item.is_completed && <span className={styles.done}>✓ Completed</span>}
                  </div>
                  <div className={styles.contentTitle}>{lang === 'hi' && item.title_hi ? item.title_hi : item.title}</div>
                  <div className={styles.contentMeta}>Progress {Number(item.progress_pct || 0)}%{item.quiz_score != null ? ` · Best quiz ${item.quiz_score}%` : ''}</div>
                  <div className={styles.contentActions}>
                    {item.type === 'QUIZ' ? (
                      <button className={`${styles.miniBtn} ${styles.miniPrimary}`} onClick={() => openQuiz(item)}>Take Quiz</button>
                    ) : (
                      <button className={`${styles.miniBtn} ${styles.miniPrimary}`} onClick={() => openContent(item)}>Open</button>
                    )}
                    {!item.is_completed && item.type !== 'QUIZ' && <button className={styles.miniBtn} disabled={completeMutation.isPending} onClick={() => completeMutation.mutate(item.id)}>Mark Complete</button>}
                    {item.is_offline_ready && item.type !== 'QUIZ' && <button className={styles.miniBtn} onClick={() => saveOffline(item)}>📥 Offline</button>}
                  </div>
                </div>
              ))}
              {!itemsQuery.isLoading && !(itemsQuery.data || []).length && <div className={styles.empty}>No published learning items in this chapter yet.</div>}
            </div>
          </div>
        </>
      )}

      {quizItem && (
        <div className={styles.modalBackdrop}>
          <div className={`${styles.modal} ${styles.modalWide}`}>
            <div className={styles.modalHeader}>
              <div><div className={styles.modalTitle}>📝 {quizItem.title}</div><div className={styles.muted}>Answer every question, then submit.</div></div>
              <button className={styles.close} onClick={closeQuiz}>✕</button>
            </div>
            {quizQuery.isLoading && <div className={styles.loading}>Loading quiz…</div>}
            {quizQuery.isError && <div className={styles.error}>{errorText(quizQuery.error)}</div>}
            {(quizQuery.data || []).map((q, index) => (
              <div className={styles.question} key={q.id}>
                <div className={styles.questionText}>{index + 1}. {lang === 'hi' && q.question_hi ? q.question_hi : q.question_text}</div>
                {['A', 'B', 'C', 'D'].map(letter => {
                  const text = q[`option_${letter.toLowerCase()}`];
                  const hi = q[`option_${letter.toLowerCase()}_hi`];
                  return (
                    <label className={styles.option} key={letter}>
                      <input type="radio" name={q.id} checked={quizAnswers[q.id] === letter} onChange={() => setQuizAnswers(prev => ({ ...prev, [q.id]: letter }))} />
                      <span><b>{letter}.</b> {lang === 'hi' && hi ? hi : text}</span>
                    </label>
                  );
                })}
              </div>
            ))}
            {quizResult && <div className={quizResult.passed ? styles.success : styles.error}>Score: <b>{quizResult.score}%</b> · {quizResult.correctCount}/{quizResult.totalQuestions} correct</div>}
            <div className={styles.buttonRow}>
              <button className={styles.secondary} onClick={closeQuiz}>Close</button>
              <button className={styles.primary} disabled={quizMutation.isPending || !(quizQuery.data || []).length} onClick={() => quizMutation.mutate()}>{quizMutation.isPending ? 'Submitting…' : 'Submit Quiz'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
