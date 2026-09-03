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
import {
  cacheLearningAsset,
  completeContentResilient,
  saveLocalOfflineDownload,
} from '@/lib/offlineLearning';
import useAuthStore from '@/store/authStore';
import { apiErrorText } from '@/utils/errors';
import type { ContentChapter, ContentItem, ContentSubject, QuizQuestion, QuizResult } from '@/types/api';
import type { StudentSectionProps } from '@/types/studentPortal';
import styles from '../StudentPortal.module.css';

const ICONS: Record<string, string> = { MATH: '🔢', SCI: '🔬', ENG: '📖', HIN: '🅗', SST: '🌍', SAN: '🕉️' };

interface PortalChapter extends ContentChapter {
  notes_count?: string | number | null;
}

interface PortalContentItem extends ContentItem {
  progress_pct?: string | number | null;
  is_offline_ready?: boolean;
}

interface PortalQuizQuestion extends QuizQuestion {
  question_hi?: string | null;
  option_a_hi?: string | null;
  option_b_hi?: string | null;
  option_c_hi?: string | null;
  option_d_hi?: string | null;
}

interface PortalQuizResult extends QuizResult {
  correctCount?: number;
  totalQuestions?: number;
}

export default function SubjectsSection({ dashboard, student, notify, refreshDashboard }: StudentSectionProps) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [subject, setSubject] = useState<ContentSubject | null>(null);
  const [chapter, setChapter] = useState<PortalChapter | null>(null);
  const [quizItem, setQuizItem] = useState<PortalContentItem | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizResult, setQuizResult] = useState<PortalQuizResult | null>(null);

  const cls = student?.className || '8';
  const lang = student?.language || 'hi';
  const subjectId = subject?.id || '';
  const chapterId = chapter?.id || '';
  const quizItemId = quizItem?.id || '';

  const subjectsQuery = useQuery<ContentSubject[]>({
    queryKey: ['subjects', cls],
    queryFn: async () => (await getSubjects(cls)).data.data || [],
  });
  const chaptersQuery = useQuery<PortalChapter[]>({
    queryKey: ['chapters', subjectId, cls],
    queryFn: async () => (await getChapters(subjectId, cls)).data.data as PortalChapter[],
    enabled: Boolean(subject),
  });
  const itemsQuery = useQuery<PortalContentItem[]>({
    queryKey: ['content-items', chapterId, lang],
    queryFn: async () => (await getContentItems(chapterId, lang)).data.data as PortalContentItem[],
    enabled: Boolean(chapter),
  });
  const quizQuery = useQuery<PortalQuizQuestion[]>({
    queryKey: ['quiz', quizItemId],
    queryFn: async () => (await getQuiz(quizItemId)).data.data as PortalQuizQuestion[],
    enabled: Boolean(quizItem),
  });

  const progressBySubject = useMemo<Record<string, ContentSubject>>(() => Object.fromEntries(
    (dashboard?.subjectProgress || []).map(item => [item.subject_id || item.id, item])
  ), [dashboard]);

  useEffect(() => {
    setChapter(null);
  }, [subject?.id]);

  const completeMutation = useMutation({
    mutationFn: async (itemId: string) => {
      if (!user?.id) {
        await markComplete(itemId);
        return { queued: false };
      }
      return completeContentResilient(user.id, itemId);
    },
    onSuccess: async (result) => {
      notify(result.queued
        ? '📶 Lesson completion saved on this device. It will sync when you reconnect.'
        : '✅ Lesson marked complete. Learning progress updated.');
      await queryClient.invalidateQueries({ queryKey: ['content-items'] });
      if (!result.queued) await refreshDashboard();
    },
    onError: (error: unknown) => notify(`⚠️ ${apiErrorText(error)}`),
  });

  const quizMutation = useMutation({
    mutationFn: () => {
      if (!quizItem) throw new Error('No quiz selected');
      return submitQuiz(
        quizItem.id,
        (quizQuery.data || []).map(question => ({ questionId: question.id, selectedOption: quizAnswers[question.id] || null }))
      );
    },
    onSuccess: async response => {
      const result = response.data.data as PortalQuizResult;
      setQuizResult(result);
      notify(result?.passed ? `🎉 Quiz passed: ${result.score || 0}%` : `Quiz score: ${result?.score || 0}%. Try again.`);
      await queryClient.invalidateQueries({ queryKey: ['content-items'] });
      await refreshDashboard();
    },
    onError: (error: unknown) => notify(`⚠️ ${apiErrorText(error)}`),
  });

  async function openContent(item: PortalContentItem): Promise<void> {
    try {
      const payload = (await getContentUrl(item.id)).data.data;
      const itemUrl = payload?.url || payload?.file_url;
      if (!itemUrl) throw new Error('Content URL unavailable');
      const url = itemUrl.startsWith('/') ? `${window.location.origin}${itemUrl}` : itemUrl;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error: unknown) {
      notify(`⚠️ ${apiErrorText(error)}`);
    }
  }

  async function saveOffline(item: PortalContentItem): Promise<void> {
    try {
      if (!user?.id) throw new Error('Student account is not available');
      const payload = (await downloadOffline(item.id)).data.data;
      if (!payload?.url) throw new Error('Offline download URL unavailable');
      await cacheLearningAsset(payload.url);
      await saveLocalOfflineDownload(user.id, {
        contentItemId: item.id,
        fileUrl: payload.url,
        title: item.title,
        subjectName: subject?.name || null,
        chapterNumber: chapter?.chapter_number || null,
        chapterTitle: chapter?.title || null,
        type: item.type,
        fileSizeKb: item.file_size_kb || null,
      });
      notify('📥 Saved on this device for Offline Mode.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['offline-downloads'] }),
        queryClient.invalidateQueries({ queryKey: ['offline-local-downloads', user.id] }),
      ]);
    } catch (error: unknown) {
      notify(`⚠️ ${apiErrorText(error)}`);
    }
  }

  function openQuiz(item: PortalContentItem): void {
    setQuizItem(item);
    setQuizAnswers({});
    setQuizResult(null);
  }

  function closeQuiz(): void {
    setQuizItem(null);
    setQuizAnswers({});
    setQuizResult(null);
  }

  if (subjectsQuery.isLoading) return <div className={styles.loading}>Loading your subjects…</div>;
  if (subjectsQuery.isError) return <div className={styles.error}>{apiErrorText(subjectsQuery.error)}</div>;

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
            const progress = progressBySubject[sub.id];
            const pct = Number(progress?.progress_pct || 0);
            return (
              <button className={styles.subjectCard} key={sub.id} onClick={() => setSubject(sub)}>
                <div className={styles.subjectIcon}>{ICONS[sub.code] || '📘'}</div>
                <div className={styles.subjectName}>{sub.name}</div>
                <div className={styles.smallTrack}><div className={styles.smallFill} style={{ width: `${pct}%`, background: sub.color_hex || '#ff6b00' }} /></div>
                <div className={styles.subjectMeta}><span className={styles.subjectPct}>{pct}% complete</span> · {Number(sub.chapter_count || 0)} chapters<br />{Number(progress?.completed_items || 0)} / {Number(progress?.total_items || 0)} learning items completed</div>
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
            {chaptersQuery.isError && <div className={styles.error}>{apiErrorText(chaptersQuery.error)}</div>}
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
            {itemsQuery.isError && <div className={styles.error}>{apiErrorText(itemsQuery.error)}</div>}
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
                      <button className={`${styles.miniBtn} ${styles.miniPrimary}`} onClick={() => void openContent(item)}>Open</button>
                    )}
                    {!item.is_completed && item.type !== 'QUIZ' && <button className={styles.miniBtn} disabled={completeMutation.isPending} onClick={() => completeMutation.mutate(item.id)}>Mark Complete</button>}
                    {item.is_offline_ready && item.type !== 'QUIZ' && <button className={styles.miniBtn} onClick={() => void saveOffline(item)}>📥 Offline</button>}
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
            {quizQuery.isError && <div className={styles.error}>{apiErrorText(quizQuery.error)}</div>}
            {(quizQuery.data || []).map((question, index) => (
              <div className={styles.question} key={question.id}>
                <div className={styles.questionText}>{index + 1}. {lang === 'hi' && question.question_hi ? question.question_hi : question.question_text || question.question}</div>
                {(['A', 'B', 'C', 'D'] as const).map(letter => {
                  const text = letter === 'A' ? question.option_a : letter === 'B' ? question.option_b : letter === 'C' ? question.option_c : question.option_d;
                  const hi = letter === 'A' ? question.option_a_hi : letter === 'B' ? question.option_b_hi : letter === 'C' ? question.option_c_hi : question.option_d_hi;
                  return (
                    <label className={styles.option} key={letter}>
                      <input type="radio" name={question.id} checked={quizAnswers[question.id] === letter} onChange={() => setQuizAnswers(prev => ({ ...prev, [question.id]: letter }))} />
                      <span><b>{letter}.</b> {lang === 'hi' && hi ? hi : text}</span>
                    </label>
                  );
                })}
              </div>
            ))}
            {quizResult && <div className={quizResult.passed ? styles.success : styles.error}>Score: <b>{quizResult.score || 0}%</b> · {quizResult.correctCount || 0}/{quizResult.totalQuestions || 0} correct</div>}
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
