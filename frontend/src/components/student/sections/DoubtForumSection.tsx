'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listDoubts,
  createDoubt,
  getDoubt,
  answerDoubt,
  toggleAnswerUpvote,
  resolveDoubt,
  requestAIAnswer,
} from '@/services/doubtService';
import { apiErrorText } from '@/utils/errors';
import type { Doubt, DoubtAnswer } from '@/types/api';
import type { StudentSectionProps } from '@/types/studentPortal';
import styles from '../StudentPortal.module.css';

interface PortalAnswer extends DoubtAnswer {
  is_accepted?: boolean;
  answerer_role?: string | null;
}

interface PortalDoubt extends Doubt {
  subject_code?: string | null;
  is_mine?: boolean;
  class_name?: string | null;
  section?: string | null;
  upvote_count?: string | number | null;
  ai_answered?: boolean;
  answers?: PortalAnswer[];
}

interface UpvoteVariables {
  doubtId: string;
  answerId: string;
}

export default function DoubtForumSection({ dashboard, notify, refreshDashboard }: StudentSectionProps) {
  const qc = useQueryClient();
  const [subjectCode, setSubjectCode] = useState('');
  const [mine, setMine] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newDoubt, setNewDoubt] = useState({ title: '', body: '', subjectCode: '' });
  const [answerText, setAnswerText] = useState('');
  const activeSelectedId = selectedId || '';

  const listQuery = useQuery<PortalDoubt[]>({
    queryKey: ['doubts', subjectCode, mine],
    queryFn: async () => (await listDoubts({ subjectCode: subjectCode || undefined, mine: mine ? 'true' : undefined, limit: 50 })).data.data as PortalDoubt[],
  });
  const detailQuery = useQuery<PortalDoubt>({
    queryKey: ['doubt', selectedId],
    queryFn: async () => (await getDoubt(activeSelectedId)).data.data as PortalDoubt,
    enabled: Boolean(selectedId),
  });

  async function refreshDoubts(): Promise<void> {
    await qc.invalidateQueries({ queryKey: ['doubts'] });
    if (selectedId) await qc.invalidateQueries({ queryKey: ['doubt', selectedId] });
  }

  const createMutation = useMutation({
    mutationFn: () => createDoubt(newDoubt),
    onSuccess: async response => {
      const created = response.data.data;
      setShowCreate(false);
      setNewDoubt({ title: '', body: '', subjectCode: '' });
      notify('💬 Your doubt has been posted.');
      await refreshDoubts();
      if (created?.id) setSelectedId(created.id);
    },
    onError: (error: unknown) => notify(`⚠️ ${apiErrorText(error)}`),
  });

  const answerMutation = useMutation({
    mutationFn: () => answerDoubt(activeSelectedId, { body: answerText }),
    onSuccess: async () => {
      setAnswerText('');
      notify('✅ Answer posted.');
      await refreshDoubts();
      await refreshDashboard();
    },
    onError: (error: unknown) => notify(`⚠️ ${apiErrorText(error)}`),
  });

  const upvoteMutation = useMutation({
    mutationFn: ({ doubtId, answerId }: UpvoteVariables) => toggleAnswerUpvote(doubtId, answerId),
    onSuccess: async () => {
      await refreshDoubts();
      await refreshDashboard();
    },
    onError: (error: unknown) => notify(`⚠️ ${apiErrorText(error)}`),
  });

  const aiMutation = useMutation({
    mutationFn: () => requestAIAnswer(activeSelectedId),
    onSuccess: async () => {
      notify('🤖 VidyaBot added an explanation to your doubt.');
      await refreshDoubts();
    },
    onError: (error: unknown) => notify(`⚠️ ${apiErrorText(error)}`),
  });

  const resolveMutation = useMutation({
    mutationFn: (bestAnswerId: string) => resolveDoubt(activeSelectedId, bestAnswerId),
    onSuccess: async () => {
      notify('✅ Doubt resolved.');
      await refreshDoubts();
    },
    onError: (error: unknown) => notify(`⚠️ ${apiErrorText(error)}`),
  });

  const subjects = dashboard?.subjectProgress || [];
  const detail = detailQuery.data;
  const doubts = listQuery.data || [];

  return (
    <>
      <div className={styles.sectionHeader}>
        <div><h1 className={styles.title}>💬 Doubt Forum</h1><div className={styles.subtitle}>Ask classmates and school teachers, or request a VidyaBot explanation.</div></div>
        <button className={styles.primary} onClick={() => setShowCreate(true)}>+ Post Doubt</button>
      </div>

      <div className={styles.doubtToolbar}>
        <select className={styles.select} value={subjectCode} onChange={e => setSubjectCode(e.target.value)}>
          <option value="">All subjects</option>
          {subjects.map(subject => <option value={subject.code} key={subject.code}>{subject.name}</option>)}
        </select>
        <button className={mine ? styles.primary : styles.secondary} onClick={() => setMine(value => !value)}>{mine ? 'Showing My Doubts' : 'My Doubts'}</button>
      </div>

      {listQuery.isLoading && <div className={styles.loading}>Loading forum…</div>}
      {listQuery.isError && <div className={styles.error}>{apiErrorText(listQuery.error)}</div>}
      {doubts.map(doubt => (
        <div className={styles.doubt} key={doubt.id} onClick={() => setSelectedId(doubt.id)}>
          <div className={styles.doubtTitle}>{doubt.title}</div>
          <div className={styles.doubtMeta}>
            <span className={styles.tag}>{doubt.subject_name || doubt.subject_code || 'General'}</span>
            <span>{doubt.is_mine ? 'You' : doubt.student_name || doubt.author_name || 'Student'} · Class {doubt.class_name || '—'}{doubt.section ? `-${doubt.section}` : ''}</span>
            <span>💬 {Number(doubt.answer_count || 0)} answers</span>
            <span>👍 {Number(doubt.upvote_count || 0)}</span>
            {doubt.ai_answered && <span>🤖 AI answered</span>}
            <span className={doubt.status === 'RESOLVED' ? styles.statusResolved : styles.statusOpen}>{doubt.status === 'RESOLVED' ? '✅ Resolved' : '⏳ Open'}</span>
          </div>
        </div>
      ))}
      {!listQuery.isLoading && !doubts.length && <div className={styles.empty}>No doubts match this filter. Ask the first question.</div>}

      {showCreate && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}><div><div className={styles.modalTitle}>Post a Doubt</div><div className={styles.muted}>Be specific so classmates and teachers can help quickly.</div></div><button className={styles.close} onClick={() => setShowCreate(false)}>✕</button></div>
            <div className={styles.formGroup}><label className={styles.label}>Subject</label><select className={styles.select} value={newDoubt.subjectCode} onChange={e => setNewDoubt(value => ({ ...value, subjectCode: e.target.value }))}><option value="">Select subject</option>{subjects.map(subject => <option value={subject.code} key={subject.code}>{subject.name}</option>)}</select></div>
            <div className={styles.formGroup}><label className={styles.label}>Question title</label><input className={styles.input} value={newDoubt.title} onChange={e => setNewDoubt(value => ({ ...value, title: e.target.value }))} placeholder="e.g. How do I verify a linear equation answer?" /></div>
            <div className={styles.formGroup}><label className={styles.label}>Details</label><textarea className={styles.textarea} value={newDoubt.body} onChange={e => setNewDoubt(value => ({ ...value, body: e.target.value }))} placeholder="Explain what you tried and where you are stuck…" /></div>
            <div className={styles.buttonRow}><button className={styles.secondary} onClick={() => setShowCreate(false)}>Cancel</button><button className={styles.primary} disabled={createMutation.isPending || newDoubt.title.trim().length < 5 || newDoubt.body.trim().length < 10} onClick={() => createMutation.mutate()}>{createMutation.isPending ? 'Posting…' : 'Post Doubt'}</button></div>
          </div>
        </div>
      )}

      {selectedId && (
        <div className={styles.modalBackdrop}>
          <div className={`${styles.modal} ${styles.modalWide}`}>
            <div className={styles.modalHeader}><div><div className={styles.modalTitle}>{detail?.title || 'Doubt'}</div><div className={styles.muted}>{detail?.subject_name || detail?.subject_code} · {detail?.student_name || detail?.author_name}</div></div><button className={styles.close} onClick={() => setSelectedId(null)}>✕</button></div>
            {detailQuery.isLoading && <div className={styles.loading}>Loading discussion…</div>}
            {detailQuery.isError && <div className={styles.error}>{apiErrorText(detailQuery.error)}</div>}
            {detail && (
              <>
                <div className={styles.card} style={{ boxShadow: 'none' }}><div>{detail.body}</div><div className={styles.doubtMeta}><span className={styles.tag}>{detail.subject_name || detail.subject_code || 'General'}</span><span>{detail.status}</span><span>{detail.created_at ? new Date(detail.created_at).toLocaleString('en-IN') : '—'}</span></div></div>
                <div className={styles.cardTitle}>Answers ({detail.answers?.length || 0})</div>
                {(detail.answers || []).map(answer => (
                  <div className={`${styles.answer} ${answer.is_accepted ? styles.accepted : ''}`} key={answer.id}>
                    <div className={styles.answerMeta}><span>{answer.is_ai_answer || answer.is_ai ? '🤖 VidyaBot' : `${answer.answerer_name || answer.author_name || 'User'}${answer.answerer_role ? ` · ${answer.answerer_role}` : ''}`}{answer.is_accepted ? ' · ✅ Accepted' : ''}</span><span>{answer.created_at ? new Date(answer.created_at).toLocaleString('en-IN') : '—'}</span></div>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{answer.body}</div>
                    <div className={styles.quickRow}>
                      <button className={styles.miniBtn} onClick={() => upvoteMutation.mutate({ doubtId: detail.id, answerId: answer.id })}>👍 {answer.upvote_count ?? answer.upvotes ?? 0}{answer.upvoted_by_me ? ' · Upvoted' : ''}</button>
                      {detail.is_mine && detail.status !== 'RESOLVED' && !answer.is_ai_answer && !answer.is_ai && <button className={`${styles.miniBtn} ${styles.miniPrimary}`} onClick={() => resolveMutation.mutate(answer.id)}>Accept & Resolve</button>}
                    </div>
                  </div>
                ))}
                {!detail.answers?.length && <div className={styles.empty}>No answers yet.</div>}
                {detail.is_mine && detail.status !== 'RESOLVED' && <button className={styles.secondary} disabled={aiMutation.isPending} onClick={() => aiMutation.mutate()}>{aiMutation.isPending ? 'VidyaBot is thinking…' : '🤖 Ask VidyaBot to Answer'}</button>}
                <div className={styles.formGroup} style={{ marginTop: 18 }}><label className={styles.label}>Add an answer</label><textarea className={styles.textarea} value={answerText} onChange={e => setAnswerText(e.target.value)} placeholder="Share a helpful explanation…" /></div>
                <div className={styles.buttonRow}><button className={styles.primary} disabled={answerMutation.isPending || answerText.trim().length < 5} onClick={() => answerMutation.mutate()}>{answerMutation.isPending ? 'Posting…' : 'Post Answer'}</button></div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
