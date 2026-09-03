'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  chat,
  escalateTutorDoubt,
  getTutorHistory,
  type GroundedTutorResponse,
} from '@/services/aiService';
import { getStudentLearningHome } from '@/services/studentService';
import { apiErrorText } from '@/utils/errors';
import type { StudentSectionProps } from '@/types/studentPortal';
import styles from '../StudentPortal.module.css';

interface TutorMessage {
  role: 'user' | 'assistant';
  content: string;
  question?: string;
  tutor?: GroundedTutorResponse;
  escalatedDoubtId?: string;
}

const STATE_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not started',
  LEARNING: 'Learning',
  PRACTISING: 'Practising',
  NEEDS_REVIEW: 'Needs review',
  MASTERED: 'Mastered',
};

export default function AITutorSection({ student, notify, goSection }: StudentSectionProps) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState('');
  const [escalating, setEscalating] = useState('');
  const [messages, setMessages] = useState<TutorMessage[]>([
    {
      role: 'assistant',
      content: `Namaste ${student?.name?.split(' ')[0] || 'Student'}! 🙏 I am VidyaBot. Ask me a learning question in Hindi or English. When VidyaSetu has a reviewed lesson for your concept, I will ground the explanation in that material and connect it to your learning progress.`,
    },
  ]);

  const learningQuery = useQuery({
    queryKey: ['student-learning-home'],
    queryFn: async () => (await getStudentLearningHome()).data.data,
    staleTime: 30_000,
  });
  const historyQuery = useQuery({
    queryKey: ['ai-tutor-history'],
    queryFn: async () => (await getTutorHistory()).data.data,
    staleTime: 20_000,
  });

  const conceptOptions = useMemo(() => {
    const options = new Map<string, { code: string; name: string; subject: string; state: string }>();
    for (const concept of learningQuery.data?.conceptMastery || []) {
      options.set(concept.code, {
        code: concept.code,
        name: concept.name,
        subject: concept.subjectName || concept.subjectCode,
        state: concept.state,
      });
    }
    for (const action of learningQuery.data?.adaptivePlan?.actions || []) {
      if (!options.has(action.conceptCode)) {
        options.set(action.conceptCode, {
          code: action.conceptCode,
          name: action.conceptName,
          subject: action.subjectName || action.subjectCode,
          state: action.state,
        });
      }
    }
    return [...options.values()].slice(0, 30);
  }, [learningQuery.data]);

  async function send(text: string = input): Promise<void> {
    const message = String(text || '').trim();
    if (!message || sending) return;
    const nextMessages: TutorMessage[] = [...messages, { role: 'user', content: message }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    try {
      const history = nextMessages
        .slice(-10)
        .map((item) => ({ role: item.role, content: item.content }));
      const response = await chat(message, history.slice(0, -1), selectedConcept || null);
      const tutor = response.data.data;
      setMessages((current) => [...current, {
        role: 'assistant',
        content: tutor.response || 'I could not generate an answer. Please try again.',
        question: message,
        tutor,
      }]);
      await queryClient.invalidateQueries({ queryKey: ['ai-tutor-history'] });
    } catch (error: unknown) {
      notify(`⚠️ ${apiErrorText(error, 'AI Tutor is unavailable right now')}`);
      setMessages((current) => [...current, {
        role: 'assistant',
        content: 'I had trouble connecting. Please try your question again or use the Doubt Forum for human help.',
        question: message,
      }]);
    } finally {
      setSending(false);
    }
  }

  async function escalate(messageIndex: number, message: TutorMessage): Promise<void> {
    if (!message.question || !message.tutor || escalating) return;
    setEscalating(String(messageIndex));
    try {
      const response = await escalateTutorDoubt(
        message.question,
        message.content,
        message.tutor.concept?.code || selectedConcept || null,
      );
      const doubtId = response.data.data.id;
      setMessages((current) => current.map((item, index) => (
        index === messageIndex ? { ...item, escalatedDoubtId: doubtId } : item
      )));
      await queryClient.invalidateQueries({ queryKey: ['doubts'] });
      await queryClient.invalidateQueries({ queryKey: ['ai-tutor-history'] });
      notify('💬 Your question was sent to the Doubt Forum with its learning context.');
      goSection('doubts');
    } catch (error: unknown) {
      notify(`⚠️ ${apiErrorText(error, 'Could not send this doubt for human help')}`);
    } finally {
      setEscalating('');
    }
  }

  function openNextAction(tutor: GroundedTutorResponse): void {
    const action = tutor.nextAction;
    if (!action) return;
    if (action.target.kind === 'RESOURCE' && action.target.publicSlug) {
      window.open(`/learn/resource/${action.target.publicSlug}`, '_blank', 'noopener,noreferrer');
      return;
    }
    notify(`🎯 ${action.title} is ready in your Learning workspace.`);
    goSection('subjects');
  }

  const quick = [
    'Force ko real-life example ke saath samjhao',
    'Pressure area ke saath kaise change hota hai?',
    'Solve 2x + 6 = 14 and explain each step',
    'Photosynthesis step by step explain karo',
  ];

  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <h1 className={styles.title}>🤖 AI Tutor — VidyaBot</h1>
          <div className={styles.subtitle}>Concept-aware tutoring · reviewed VidyaSetu grounding when available · Hindi + English</div>
        </div>
      </div>

      <div className={styles.card} style={{ marginBottom: 16 }}>
        <div className={styles.cardTitle}>Learning context</div>
        <p style={{ color: 'var(--muted)', marginTop: 4 }}>
          Choose a concept when you know what you are studying, or leave Auto-detect selected. VidyaBot never labels an answer as grounded unless it found a published VidyaSetu resource for that concept.
        </p>
        <select className={styles.select} value={selectedConcept} onChange={(event) => setSelectedConcept(event.target.value)}>
          <option value="">Auto-detect from my question</option>
          {conceptOptions.map((concept) => (
            <option value={concept.code} key={concept.code}>
              {concept.subject} · {concept.name} · {STATE_LABELS[concept.state] || concept.state}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.chat}>
        <div className={styles.chatHeader}>
          <div className={styles.botAvatar}>🤖</div>
          <div>
            <b>VidyaBot</b>
            <div style={{ opacity: .62, fontSize: 12 }}>● Online · VidyaSetu learning assistant</div>
          </div>
        </div>
        <div className={styles.chatMessages}>
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={message.role === 'user' ? styles.msgUser : styles.msgAI}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
              {message.role === 'assistant' && message.tutor && (
                <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                  <div className={styles.quickRow}>
                    <span className={message.tutor.grounded ? styles.statusResolved : styles.tag}>
                      {message.tutor.grounded ? '✓ Grounded in reviewed VidyaSetu content' : 'General explanation'}
                    </span>
                    {message.tutor.concept && (
                      <span className={styles.tag}>
                        {message.tutor.concept.name} · {STATE_LABELS[message.tutor.learnerState || ''] || message.tutor.learnerState}
                      </span>
                    )}
                  </div>

                  {message.tutor.sources.length > 0 && (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <strong style={{ fontSize: 13 }}>Reviewed sources used</strong>
                      {message.tutor.sources.map((source) => (
                        source.publicSlug ? (
                          <Link key={source.id} href={`/learn/resource/${source.publicSlug}`} target="_blank" className={styles.secondary} style={{ width: 'fit-content' }}>
                            📘 {source.title} ↗
                          </Link>
                        ) : <span key={source.id} className={styles.contentMeta}>📘 {source.title}</span>
                      ))}
                    </div>
                  )}

                  {message.tutor.nextAction && (
                    <div style={{ padding: 10, borderRadius: 10, background: 'rgba(28,112,255,.07)' }}>
                      <strong>Next learning step: {message.tutor.nextAction.title}</strong>
                      <div className={styles.contentMeta} style={{ marginTop: 3 }}>{message.tutor.nextAction.reason}</div>
                      <button className={`${styles.miniBtn} ${styles.miniPrimary}`} style={{ marginTop: 7 }} onClick={() => openNextAction(message.tutor as GroundedTutorResponse)}>
                        Open next step
                      </button>
                    </div>
                  )}

                  {message.question && !message.escalatedDoubtId && (
                    <button
                      className={styles.secondary}
                      disabled={escalating === String(index)}
                      onClick={() => void escalate(index, message)}
                      style={{ width: 'fit-content' }}
                    >
                      {escalating === String(index) ? 'Sending…' : 'Still confused? Ask teacher / forum'}
                    </button>
                  )}
                  {message.escalatedDoubtId && <span className={styles.statusResolved}>✓ Sent for human help</span>}
                </div>
              )}
            </div>
          ))}
          {sending && <div className={styles.msgAI}>Checking your learning context and thinking…</div>}
        </div>
        <div className={styles.chatInput}>
          <input
            className={styles.input}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void send(); }}
            placeholder="Ask your doubt in Hindi or English…"
          />
          <button className={styles.primary} disabled={sending} onClick={() => void send()}>{sending ? '…' : 'Send ↗'}</button>
        </div>
      </div>

      <div className={styles.quickRow} style={{ marginTop: 12 }}>
        {quick.map((question) => <button className={styles.secondary} key={question} onClick={() => void send(question)}>{question}</button>)}
      </div>

      <div className={styles.card} style={{ marginTop: 18 }}>
        <div className={styles.cardTitle}>🔒 Privacy-first tutor history</div>
        <p style={{ color: 'var(--muted)', marginTop: 4 }}>
          Normal chat text is not copied into VidyaSetu history or application logs. This history stores only help metadata such as concept, grounding and time. Your academic question and the prior AI explanation are saved only when you explicitly send them to the Doubt Forum.
        </p>
        {historyQuery.isLoading ? <div className={styles.loading}>Loading recent help activity…</div> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {(historyQuery.data || []).slice(0, 8).map((event) => (
              <div className={styles.contentItem} key={event.id}>
                <div className={styles.contentTop}>
                  <span className={styles.contentType}>{event.eventType.replaceAll('_', ' ')}</span>
                  <span className={event.grounded ? styles.done : styles.contentType}>{event.grounded ? 'Grounded' : 'General'}</span>
                </div>
                <div className={styles.contentTitle}>{event.conceptName || 'General learning help'}</div>
                <div className={styles.contentMeta}>
                  {event.masteryState ? `${STATE_LABELS[event.masteryState] || event.masteryState} · ` : ''}{event.sourceCount} reviewed source{event.sourceCount === 1 ? '' : 's'} · {new Date(event.createdAt).toLocaleString('en-IN')}
                </div>
              </div>
            ))}
            {!historyQuery.isLoading && !(historyQuery.data || []).length && <div className={styles.empty}>Your privacy-safe tutor activity will appear here after you ask a question.</div>}
          </div>
        )}
      </div>
    </>
  );
}
