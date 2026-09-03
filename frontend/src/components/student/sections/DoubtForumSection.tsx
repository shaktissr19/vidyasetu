'use client';

import Link from 'next/link';
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

interface AIContextSource {
  id?: string;
  publicSlug?: string | null;
  title?: string;
  sourceName?: string;
}
interface AIContextSnapshot {
  priorTutorResponse?: string;
  grounded?: boolean;
  conceptCode?: string | null;
  sources?: AIContextSource[];
}
interface PortalAnswer extends DoubtAnswer {
  is_accepted?: boolean;
  answerer_role?: string | null;
  is_ai_answer?: boolean;
  upvote_count?: number | string;
  upvoted_by_me?: boolean;
  created_at?: string | null;
  ai_grounded?: boolean;
  ai_concept_code?: string | null;
  ai_concept_name?: string | null;
  ai_sources?: AIContextSource[];
  ai_provider?: string | null;
}

interface PortalDoubt extends Doubt {
  subject_code?: string | null;
  is_mine?: boolean;
  class_name?: string | null;
  section?: string | null;
  student_name?: string | null;
  upvote_count?: string | number | null;
  answer_count?: string | number | null;
  ai_answered?: boolean;
  origin?: 'FORUM' | 'AI_TUTOR' | string;
  learning_concept_id?: string | null;
  concept_code?: string | null;
  concept_name?: string | null;
  concept_name_hi?: string | null;
  ai_context_snapshot?: AIContextSnapshot | null;
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
    onSuccess: async response => {
      const grounded = response.data.data.grounded;
      notify(grounded
        ? '🤖 VidyaBot added an explanation grounded in reviewed VidyaSetu content.'
        : '🤖 VidyaBot added a general explanation. No reviewed mapped source was available.');
      await refreshDoubts();
      await qc.invalidateQueries({ queryKey: ['ai-tutor-history'] });
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
        <div>
          <h1 className={styles.title}>💬 Doubt Forum</h1>
          <div className={styles.subtitle}>Human help from your learning community, with concept-aware VidyaBot support when you request it.</div>
        </div>
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
            {doubt.concept_name && <span className={styles.tag}>🎯 {doubt.concept_name}</span>}
            {doubt.origin === 'AI_TUTOR' && <span>🤖 Escalated from AI Tutor</span>}
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
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalTitle}>{detail?.title || 'Doubt'}</div>
                <div className={styles.muted}>{detail?.subject_name || detail?.subject_code || 'General'} · {detail?.student_name || detail?.author_name || 'Student'}</div>
              </div>
              <button className={styles.close} onClick={() => setSelectedId(null)}>✕</button>
            </div>
            {detailQuery.isLoading && <div className={styles.loading}>Loading discussion…</div>}
            {detailQuery.isError && <div className={styles.error}>{apiErrorText(detailQuery.error)}</div>}
            {detail && (
              <>
                <div className={styles.card} style={{ boxShadow: 'none' }}>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{detail.body}</div>
                  <div className={styles.doubtMeta}>
                    <span className={styles.tag}>{detail.subject_name || detail.subject_code || 'General'}</span>
                    {detail.concept_name && <span className={styles.tag}>🎯 {detail.concept_name}</span>}
                    {detail.origin === 'AI_TUTOR' && <span>🤖 Escalated from VidyaBot</span>}
                    <span>{detail.status}</span>
                    <span>{detail.created_at ? new Date(detail.created_at).toLocaleString('en-IN') : '—'}</span>
                  </div>
                </div>

                {detail.origin === 'AI_TUTOR' && detail.ai_context_snapshot?.priorTutorResponse && (
                  <div className={styles.card} style={{ boxShadow: 'none', background: 'rgba(28,112,255,.05)' }}>
                    <div className={styles.cardTitle}>Context before human escalation</div>
                    <p className={styles.contentMeta} style={{ marginTop: 2 }}>
                      The learner explicitly sent this academic Tutor context with the doubt so a human helper can see what was already explained.
                    </p>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{detail.ai_context_snapshot.priorTutorResponse}</div>
                    <div className={styles.quickRow} style={{ marginTop: 10 }}>
                      <span className={detail.ai_context_snapshot.grounded ? styles.statusResolved : styles.tag}>
                        {detail.ai_context_snapshot.grounded ? '✓ Prior answer was grounded' : 'Prior answer was general'}
                      </span>
                      {(detail.ai_context_snapshot.sources || []).map((source, index) => (
                        source.publicSlug ? (
                          <Link key={source.id || `${source.publicSlug}-${index}`} href={`/learn/resource/${source.publicSlug}`} target="_blank" className={styles.miniBtn}>
                            📘 {source.title || 'Reviewed source'} ↗
                          </Link>
                        ) : null
                      ))}
                    </div>
                  </div>
                )}

                <div className={styles.cardTitle}>Answers ({detail.answers?.length || 0})</div>
                {(detail.answers || []).map(answer => (
                  <div className={`${styles.answer} ${answer.is_accepted ? styles.accepted : ''}`} key={answer.id}>
                    <div className={styles.answerMeta}>
                      <span>{answer.is_ai_answer || answer.is_ai ? '🤖 VidyaBot' : `${answer.answerer_name || answer.author_name || 'User'}${answer.answerer_role ? ` · ${answer.answerer_role}` : ''}`}{answer.is_accepted ? ' · ✅ Accepted' : ''}</span>
                      <span>{answer.created_at ? new Date(answer.created_at).toLocaleString('en-IN') : '—'}</span>
                    </div>
                    {(answer.is_ai_answer || answer.is_ai) && (
                      <div className={styles.quickRow} style={{ marginBottom: 8 }}>
                        <span className={answer.ai_grounded ? styles.statusResolved : styles.tag}>
                          {answer.ai_grounded ? '✓ Grounded in reviewed VidyaSetu content' : 'General AI explanation'}
                        </span>
                        {answer.ai_concept_name && <span className={styles.tag}>🎯 {answer.ai_concept_name}</span>}
                      </div>
                    )}
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{answer.body}</div>
                    {(answer.is_ai_answer || answer.is_ai) && (answer.ai_sources || []).length > 0 && (
                      <div className={styles.quickRow} style={{ marginTop: 10 }}>
                        {(answer.ai_sources || []).map((source, index) => (
                          source.publicSlug ? (
                            <Link key={source.id || `${source.publicSlug}-${index}`} href={`/learn/resource/${source.publicSlug}`} target="_blank" className={styles.miniBtn}>
                              📘 {source.title || 'Reviewed source'} ↗
                            </Link>
                          ) : <span className={styles.contentMeta} key={source.id || index}>📘 {source.title || 'Reviewed source'}</span>
                        ))}
                      </div>
                    )}
                    <div className={styles.quickRow}>
                      <button className={styles.miniBtn} onClick={() => upvoteMutation.mutate({ doubtId: detail.id, answerId: answer.id })}>👍 {answer.upvote_count ?? answer.upvotes ?? 0}{answer.upvoted_by_me ? ' · Upvoted' : ''}</button>
                      {detail.is_mine && detail.status !== 'RESOLVED' && !answer.is_ai_answer && !answer.is_ai && <button className={`${styles.miniBtn} ${styles.miniPrimary}`} onClick={() => resolveMutation.mutate(answer.id)}>Accept & Resolve</button>}
                    </div>
                  </div>
                ))}
                {!detail.answers?.length && <div className={styles.empty}>No answers yet.</div>}
                {detail.is_mine && detail.status !== 'RESOLVED' && <button className={styles.secondary} disabled={aiMutation.isPending} onClick={() => aiMutation.mutate()}>{aiMutation.isPending ? 'VidyaBot is checking reviewed context…' : '🤖 Ask VidyaBot to Answer'}</button>}
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
