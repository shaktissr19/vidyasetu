'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getStudentHomework,
  getStudentHomeworkDetail,
  submitStudentHomework,
  type StudentHomeworkItem,
} from '@/services/homeworkService';
import { apiErrorText } from '@/utils/errors';
import type { StudentSectionProps } from '@/types/studentPortal';
import styles from '../StudentPortal.module.css';

const controlStyle = {
  width: '100%',
  border: '1px solid #D8E0EC',
  borderRadius: 12,
  padding: '11px 12px',
  background: '#fff',
  color: '#17233B',
  fontSize: 14,
} as const;

function statusLabel(item: StudentHomeworkItem): string {
  if (item.submission_status === 'RETURNED') return '↩️ Revision requested';
  if (item.submission_status === 'REVIEWED') return '✅ Reviewed';
  if (item.submission_status === 'LATE') return '⏰ Submitted late';
  if (item.submission_status === 'SUBMITTED') return '📤 Submitted';
  if (item.status === 'CLOSED') return '🔒 Closed';
  return new Date(item.due_at).getTime() < Date.now() ? '⚠️ Due / late' : '📝 To do';
}

function dueText(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Due date unavailable';
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function HomeworkSection({ notify }: StudentSectionProps) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'SUBMITTED' | 'REVIEWED'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');

  const listQuery = useQuery<StudentHomeworkItem[]>({
    queryKey: ['student-homework', filter],
    queryFn: async () => (await getStudentHomework(filter === 'ALL' ? undefined : filter)).data.data || [],
    staleTime: 15_000,
  });

  const detailQuery = useQuery<StudentHomeworkItem>({
    queryKey: ['student-homework-detail', selectedId],
    queryFn: async () => (await getStudentHomeworkDetail(selectedId!)).data.data,
    enabled: Boolean(selectedId),
  });

  useEffect(() => {
    const item = detailQuery.data;
    if (!item) return;
    setAnswerText(item.answer_text || '');
    setAttachmentUrl(item.submission_attachment_url || '');
  }, [detailQuery.data]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('Select a homework item first');
      return submitStudentHomework(selectedId, {
        answerText: answerText.trim() || null,
        attachmentUrl: attachmentUrl.trim() || null,
      });
    },
    onSuccess: async () => {
      notify('✅ Homework submitted successfully.');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['student-homework'] }),
        qc.invalidateQueries({ queryKey: ['student-homework-detail', selectedId] }),
        qc.invalidateQueries({ queryKey: ['student-dashboard'] }),
      ]);
    },
    onError: (error: unknown) => notify(`⚠️ ${apiErrorText(error, 'Homework submission failed')}`),
  });

  const items = listQuery.data || [];
  const selected = detailQuery.data;
  const summary = useMemo(() => ({
    pending: items.filter(item => !item.submission_id).length,
    submitted: items.filter(item => ['SUBMITTED', 'LATE'].includes(item.submission_status || '')).length,
    reviewed: items.filter(item => ['REVIEWED', 'RETURNED'].includes(item.submission_status || '')).length,
  }), [items]);

  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <h1 className={styles.title}>📝 Homework</h1>
          <div className={styles.subtitle}>School-assigned work, due dates, submissions and Teacher feedback in one place.</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
        <div className={styles.card}><b>{summary.pending}</b><div style={{ opacity: .65, fontSize: 13 }}>To do</div></div>
        <div className={styles.card}><b>{summary.submitted}</b><div style={{ opacity: .65, fontSize: 13 }}>Submitted</div></div>
        <div className={styles.card}><b>{summary.reviewed}</b><div style={{ opacity: .65, fontSize: 13 }}>Reviewed / returned</div></div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {(['ALL', 'PENDING', 'SUBMITTED', 'REVIEWED'] as const).map(value => (
          <button
            key={value}
            className={filter === value ? styles.primary : styles.secondary}
            onClick={() => { setFilter(value); setSelectedId(null); }}
          >
            {value === 'ALL' ? 'All' : value === 'PENDING' ? 'To do' : value.charAt(0) + value.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {listQuery.isError && <div className={styles.error}>{apiErrorText(listQuery.error, 'Could not load homework')}</div>}
      {listQuery.isLoading && <div className={styles.loading}>Loading homework…</div>}

      <div style={{ display: 'grid', gridTemplateColumns: selectedId ? 'minmax(260px,.85fr) minmax(320px,1.15fr)' : '1fr', gap: 16, alignItems: 'start' }}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Assigned work</div>
          {items.map(item => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              style={{
                width: '100%', textAlign: 'left', border: selectedId === item.id ? '1px solid #FF8A00' : '1px solid #E7EBF2',
                background: selectedId === item.id ? '#FFF8EE' : '#fff', borderRadius: 14, padding: 14,
                marginTop: 10, cursor: 'pointer', color: '#17233B',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                <div><b>{item.title}</b><div style={{ fontSize: 12, opacity: .65, marginTop: 4 }}>{item.subject_name || item.subject_code} · {dueText(item.due_at)}</div></div>
                <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{statusLabel(item)}</span>
              </div>
              <div style={{ fontSize: 13, opacity: .78, marginTop: 9, lineHeight: 1.5 }}>{item.description.slice(0, 150)}{item.description.length > 150 ? '…' : ''}</div>
            </button>
          ))}
          {!listQuery.isLoading && !items.length && <div className={styles.empty}>No homework matches this view.</div>}
        </div>

        {selectedId && (
          <div className={styles.card}>
            {detailQuery.isLoading && <div className={styles.loading}>Opening homework…</div>}
            {detailQuery.isError && <div className={styles.error}>{apiErrorText(detailQuery.error, 'Could not open homework')}</div>}
            {selected && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'start' }}>
                  <div><div className={styles.cardTitle}>{selected.title}</div><div style={{ fontSize: 13, opacity: .65 }}>{selected.subject_name || selected.subject_code} · due {dueText(selected.due_at)}</div></div>
                  <span style={{ fontSize: 12 }}>{statusLabel(selected)}</span>
                </div>
                <div style={{ marginTop: 18, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{selected.description}</div>
                {selected.instructions && <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: '#F5F8FD' }}><b>Instructions</b><div style={{ marginTop: 5, whiteSpace: 'pre-wrap' }}>{selected.instructions}</div></div>}
                {selected.attachment_url && <div style={{ marginTop: 12 }}><a href={selected.attachment_url} target="_blank" rel="noreferrer">📎 Open Teacher attachment</a></div>}
                {selected.max_marks !== null && selected.max_marks !== undefined && <div style={{ marginTop: 12, fontSize: 13 }}><b>Maximum marks:</b> {String(selected.max_marks)}</div>}

                {selected.feedback && <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: selected.submission_status === 'RETURNED' ? '#FFF5ED' : '#EFFAF3' }}><b>Teacher feedback</b><div style={{ marginTop: 5 }}>{selected.feedback}</div>{selected.marks_awarded !== null && selected.marks_awarded !== undefined && <div style={{ marginTop: 6 }}><b>Marks:</b> {String(selected.marks_awarded)}{selected.max_marks ? ` / ${String(selected.max_marks)}` : ''}</div>}</div>}

                {selected.status === 'PUBLISHED' ? (
                  <div style={{ marginTop: 20 }}>
                    <label style={{ fontSize: 13, fontWeight: 700 }}>Your answer</label>
                    <textarea value={answerText} onChange={e => setAnswerText(e.target.value)} rows={7} placeholder="Write your answer, explanation or work here…" style={{ ...controlStyle, marginTop: 7, resize: 'vertical' }} />
                    <label style={{ display: 'block', marginTop: 12, fontSize: 13, fontWeight: 700 }}>Attachment link (optional)</label>
                    <input value={attachmentUrl} onChange={e => setAttachmentUrl(e.target.value)} placeholder="https://…" style={{ ...controlStyle, marginTop: 7 }} />
                    <button className={styles.primary} disabled={submitMutation.isPending || (!answerText.trim() && !attachmentUrl.trim())} onClick={() => submitMutation.mutate()} style={{ marginTop: 14 }}>
                      {submitMutation.isPending ? 'Submitting…' : selected.submission_id ? 'Update submission' : 'Submit homework'}
                    </button>
                  </div>
                ) : <div style={{ marginTop: 18, opacity: .7 }}>🔒 This homework is closed for new submissions.</div>}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
