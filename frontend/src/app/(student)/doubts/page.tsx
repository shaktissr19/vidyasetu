'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listDoubts, createDoubt, getDoubt, answerDoubt, upvoteAnswer, aiAnswerDoubt, type CreateDoubtPayload } from '@/services/doubtService';
import { SectionHeader, CardSkeleton } from '@/components/ui/index';
import { timeAgo } from '@/utils/formatters';
import type { Doubt } from '@/types/api';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

type View = 'list' | 'create' | 'detail';
interface AnswerVariables { doubtId: string; body: string; }

export default function DoubtsPage() {
  const { t } = useLanguageStore();
  const qc = useQueryClient();

  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<Doubt | null>(null);
  const [form, setForm] = useState({ title: '', body: '', subjectId: '' });
  const [answerText, setAnswer] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['doubts'],
    queryFn: () => listDoubts({ limit: 30 }).then(r => r.data.data),
  });
  const doubts = data || [];

  const selectedId = selected?.id || '';
  const { data: detail } = useQuery({
    queryKey: ['doubt-detail', selectedId],
    queryFn: () => getDoubt(selectedId).then(r => r.data.data),
    enabled: Boolean(selectedId) && view === 'detail',
  });

  const createMut = useMutation({
    mutationFn: (payload: CreateDoubtPayload) => createDoubt(payload),
    onSuccess: async () => {
      toast.success('✅ Doubt posted!');
      await qc.invalidateQueries({ queryKey: ['doubts'] });
      setView('list');
      setForm({ title: '', body: '', subjectId: '' });
    },
    onError: () => toast.error('Failed to post doubt'),
  });

  const answerMut = useMutation({
    mutationFn: ({ doubtId, body }: AnswerVariables) => answerDoubt(doubtId, { body }),
    onSuccess: async () => {
      toast.success('Answer posted!');
      await qc.invalidateQueries({ queryKey: ['doubt-detail', selectedId] });
      setAnswer('');
    },
  });

  const aiMut = useMutation({
    mutationFn: (doubtId: string) => aiAnswerDoubt(doubtId),
    onSuccess: async () => {
      toast.success('🤖 VidyaBot answered!');
      await qc.invalidateQueries({ queryKey: ['doubt-detail', selectedId] });
    },
    onError: () => toast.error('AI answer unavailable right now'),
  });

  const STATUS_COLORS: Record<string, string> = {
    OPEN: 'badge-orange', ANSWERED: 'badge-blue', RESOLVED: 'badge-green', CLOSED: 'badge-blue'
  };

  if (view === 'detail' && selected) {
    const d = detail || selected;
    return (
      <div className="animate-fade-up">
        <button onClick={() => { setView('list'); setSelected(null); }} className="btn-ghost mb-4">← {t('वापस', 'Back to doubts')}</button>

        <div className="card mb-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h2 className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>{d.title}</h2>
            <span className={`badge ${STATUS_COLORS[d.status] || 'badge-blue'} flex-shrink-0`}>{d.status}</span>
          </div>
          <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--slate)' }}>{d.body}</p>
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--slate)' }}>
            <span>👤 {d.student_name || d.author_name || 'Student'}</span>
            {d.subject_name && <span>📚 {d.subject_name}</span>}
            <span>👁 {d.view_count || 0} views</span>
            <span>{timeAgo(d.created_at)}</span>
          </div>
          {d.status === 'OPEN' && (
            <button className="btn-primary mt-3 text-sm" disabled={aiMut.isPending} onClick={() => aiMut.mutate(d.id)}>
              🤖 {aiMut.isPending ? 'VidyaBot thinking...' : 'Get AI Answer'}
            </button>
          )}
        </div>

        <h3 className="font-display font-bold text-base mb-3" style={{ color: 'var(--navy)' }}>💬 {t('जवाब', 'Answers')} ({(d.answers || []).length})</h3>
        <div className="space-y-3 mb-4">
          {(d.answers || []).map(ans => (
            <div key={ans.id} className={`card ${ans.id === d.best_answer_id ? 'ring-2 ring-green-400' : ''}`}
              style={{ borderLeft: ans.is_ai_answer || ans.is_ai ? '4px solid var(--saffron)' : '4px solid var(--border)' }}>
              {ans.id === d.best_answer_id && <div className="badge badge-green mb-2">✅ Best Answer</div>}
              {(ans.is_ai_answer || ans.is_ai) && (
                <div className="flex items-center gap-2 mb-2"><span className="text-xl">🤖</span><span className="badge badge-orange">VidyaBot AI Answer</span></div>
              )}
              <p className="text-sm leading-relaxed" style={{ color: 'var(--navy)' }}>{ans.body}</p>
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--slate)' }}>
                  <span>👤 {ans.answerer_name || ans.author_name || 'User'}</span>
                  <span>{timeAgo(ans.created_at)}</span>
                </div>
                <button className="text-xs font-semibold px-3 py-1 rounded-lg"
                  style={{ background: ans.upvoted_by_me ? 'var(--saffron-pale)' : '#F0F4F8', color: ans.upvoted_by_me ? 'var(--saffron)' : 'var(--slate)' }}
                  onClick={() => { void upvoteAnswer(d.id, ans.id).then(() => qc.invalidateQueries({ queryKey: ['doubt-detail', d.id] })); }}>
                  👍 {ans.upvote_count ?? ans.upvotes ?? 0}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h4 className="font-display font-bold text-sm mb-3" style={{ color: 'var(--navy)' }}>✍️ {t('जवाब दें', 'Post an Answer')}</h4>
          <textarea value={answerText} onChange={e => setAnswer(e.target.value)} placeholder={t('अपना जवाब लिखें...', 'Write your answer here...')}
            className="input w-full" rows={4} style={{ resize: 'vertical' }} />
          <button className="btn-primary mt-3" disabled={!answerText.trim() || answerMut.isPending}
            onClick={() => answerMut.mutate({ doubtId: d.id, body: answerText })}>
            {answerMut.isPending ? 'Posting...' : t('जवाब पोस्ट करें', 'Post Answer')}
          </button>
        </div>
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div className="animate-fade-up max-w-xl">
        <button onClick={() => setView('list')} className="btn-ghost mb-4">← {t('वापस', 'Back')}</button>
        <div className="card">
          <h2 className="font-display font-bold text-xl mb-5" style={{ color: 'var(--navy)' }}>💬 {t('नई शंका पोस्ट करें', 'Post a New Doubt')}</h2>
          <div className="mb-4">
            <label className="text-xs font-bold mb-1.5 block" style={{ color: 'var(--slate)' }}>{t('शंका / प्रश्न', 'Your Question')} *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder={t('जैसे: प्रकाश परावर्तन का नियम क्या है?', 'e.g., What is the law of light reflection?')} className="input" maxLength={300} />
          </div>
          <div className="mb-4">
            <label className="text-xs font-bold mb-1.5 block" style={{ color: 'var(--slate)' }}>{t('विवरण', 'Details')}</label>
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder={t('और जानकारी दें...', 'Add more details, context, or what you tried...')} className="input" rows={5} style={{ resize: 'vertical' }} />
          </div>
          <button className="btn-primary w-full justify-center py-3" disabled={!form.title.trim() || createMut.isPending}
            onClick={() => createMut.mutate({ title: form.title, body: form.body || form.title, subjectId: form.subjectId || undefined })}>
            {createMut.isPending ? 'Posting...' : `📤 ${t('शंका पोस्ट करें', 'Post Doubt')}`}
          </button>
          <p className="text-xs text-center mt-3" style={{ color: 'var(--slate)' }}>{t('VidyaBot तुरंत जवाब देगा 🤖', 'VidyaBot will auto-answer your doubt 🤖')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <SectionHeader title={`💬 ${t('डाउट फोरम', 'Doubt Forum')}`} sub={`${doubts.length} ${t('सवाल', 'questions')}`}>
        <button className="btn-primary" onClick={() => setView('create')}>+ {t('शंका पोस्ट करें', 'Post a Doubt')}</button>
      </SectionHeader>

      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : doubts.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-5xl mb-4">💬</div>
          <p className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>{t('कोई शंका नहीं', 'No doubts yet')}</p>
          <p className="text-sm mt-1 mb-4" style={{ color: 'var(--slate)' }}>{t('पहली शंका पूछें!', 'Ask the first question!')}</p>
          <button className="btn-primary" onClick={() => setView('create')}>+ {t('शंका पोस्ट करें', 'Post a Doubt')}</button>
        </div>
      ) : (
        <div className="space-y-3 stagger">
          {doubts.map((d, i) => (
            <div key={d.id} className="card cursor-pointer hover:shadow-md transition-all animate-fade-up"
              onClick={() => { setSelected(d); setView('detail'); }} style={{ animationDelay: `${i * 0.04}s`, opacity: 0 }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base leading-snug" style={{ color: 'var(--navy)' }}>{d.title}</p>
                  {d.body && d.body !== d.title && <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--slate)' }}>{d.body}</p>}
                </div>
                <span className={`badge ${STATUS_COLORS[d.status] || 'badge-blue'} flex-shrink-0`}>{d.status}</span>
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: 'var(--slate)' }}>
                {d.subject_name && <span className="badge badge-orange">{d.subject_name}</span>}
                <span>👤 {d.student_name || d.author_name || 'Student'}</span>
                <span>💬 {d.answer_count || 0} {t('जवाब', 'answers')}</span>
                <span>👁 {d.view_count || 0}</span>
                <span className="ml-auto">{timeAgo(d.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
