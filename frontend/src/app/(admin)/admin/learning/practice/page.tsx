'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  createLearningStudioAssessment,
  createLearningStudioQuestion,
  getLearningStudioAssessments,
  getLearningStudioOptions,
  getLearningStudioQuestions,
  updateLearningStudioAssessmentStatus,
  updateLearningStudioQuestionStatus,
  type SaveLearningStudioAssessment,
  type SaveLearningStudioQuestion,
} from '@/services/adminLearningService';
import { apiErrorText } from '@/utils/errors';
import styles from '@/components/public/publicLearning.module.css';

const INITIAL_QUESTION: SaveLearningStudioQuestion = {
  prompt: '', promptHi: '', questionType: 'MCQ_SINGLE', difficulty: 'MEDIUM', correctAnswer: { option: 'A' }, marks: 1,
  explanation: '', explanationHi: '', negativeMarks: 0,
  classMin: 8, classMax: 8, sourceCode: 'VIDYASETU_ORIGINAL', licence: 'VIDYASETU_ORIGINAL',
  visibility: 'REGISTERED', reviewStatus: 'DRAFT', boardCodes: ['COMMON'],
  options: [
    { key: 'A', text: '', textHi: '' },
    { key: 'B', text: '', textHi: '' },
    { key: 'C', text: '', textHi: '' },
    { key: 'D', text: '', textHi: '' },
  ],
};

const INITIAL_ASSESSMENT: SaveLearningStudioAssessment = {
  title: '', titleHi: '', summary: '', assessmentType: 'PRACTICE', visibility: 'REGISTERED', reviewStatus: 'DRAFT',
  classMin: 8, classMax: 8, timeLimitMins: 10, passingPct: 40, shuffleQuestions: false,
  isFeaturedPublic: false, boardCodes: ['COMMON'], questionIds: [],
};

type ReviewStatus = 'DRAFT' | 'SUBMITTED' | 'ACADEMIC_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';

const REVIEW_ACTIONS: Record<ReviewStatus, Array<{ status: ReviewStatus; label: string }>> = {
  DRAFT: [{ status: 'SUBMITTED', label: 'Submit for review' }, { status: 'ARCHIVED', label: 'Archive' }],
  SUBMITTED: [{ status: 'ACADEMIC_REVIEW', label: 'Start academic review' }, { status: 'DRAFT', label: 'Return to draft' }, { status: 'ARCHIVED', label: 'Archive' }],
  ACADEMIC_REVIEW: [{ status: 'APPROVED', label: 'Approve' }, { status: 'SUBMITTED', label: 'Return to submitted' }, { status: 'ARCHIVED', label: 'Archive' }],
  APPROVED: [{ status: 'PUBLISHED', label: 'Publish' }, { status: 'ACADEMIC_REVIEW', label: 'Return to review' }, { status: 'ARCHIVED', label: 'Archive' }],
  PUBLISHED: [{ status: 'ARCHIVED', label: 'Archive' }],
  ARCHIVED: [{ status: 'DRAFT', label: 'Restore to draft' }],
};

function actionsFor(status: string) {
  return REVIEW_ACTIONS[status as ReviewStatus] || [];
}

export default function LearningPracticeStudioPage() {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState<SaveLearningStudioQuestion>(INITIAL_QUESTION);
  const [assessment, setAssessment] = useState<SaveLearningStudioAssessment>(INITIAL_ASSESSMENT);

  const optionsQuery = useQuery({ queryKey: ['learning-studio-options'], queryFn: () => getLearningStudioOptions().then((r) => r.data.data) });
  const questionsQuery = useQuery({ queryKey: ['learning-studio-questions'], queryFn: () => getLearningStudioQuestions().then((r) => r.data.data || []) });
  const assessmentsQuery = useQuery({ queryKey: ['learning-studio-assessments'], queryFn: () => getLearningStudioAssessments().then((r) => r.data.data || []) });

  const selectedQuestions = useMemo(() => new Set(assessment.questionIds), [assessment.questionIds]);

  const questionMutation = useMutation({
    mutationFn: () => createLearningStudioQuestion({ ...question, reviewStatus: 'DRAFT' }),
    onSuccess: async () => {
      toast.success('Question saved as DRAFT');
      setQuestion(INITIAL_QUESTION);
      await queryClient.invalidateQueries({ queryKey: ['learning-studio-questions'] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not create question')),
  });

  const assessmentMutation = useMutation({
    mutationFn: () => createLearningStudioAssessment({ ...assessment, reviewStatus: 'DRAFT' }),
    onSuccess: async () => {
      toast.success('Assessment saved as DRAFT');
      setAssessment(INITIAL_ASSESSMENT);
      await queryClient.invalidateQueries({ queryKey: ['learning-studio-assessments'] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not create assessment')),
  });

  const questionStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReviewStatus }) => updateLearningStudioQuestionStatus(id, status),
    onSuccess: async (_response, variables) => {
      toast.success(`Question moved to ${variables.status.replaceAll('_', ' ')}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['learning-studio-questions'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-studio-assessments'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not update question review state')),
  });

  const assessmentStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReviewStatus }) => updateLearningStudioAssessmentStatus(id, status),
    onSuccess: async (_response, variables) => {
      toast.success(`Assessment moved to ${variables.status.replaceAll('_', ' ')}`);
      await queryClient.invalidateQueries({ queryKey: ['learning-studio-assessments'] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not update assessment review state')),
  });

  function toggleQuestion(id: string): void {
    setAssessment((current) => ({ ...current, questionIds: selectedQuestions.has(id) ? current.questionIds.filter((q) => q !== id) : [...current.questionIds, id] }));
  }

  function setOption(index: number, field: 'text' | 'textHi', value: string): void {
    setQuestion((current) => ({
      ...current,
      options: (current.options || []).map((option, i) => i === index ? { ...option, [field]: value } : option),
    }));
  }

  return (
    <div className={styles.studio}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ color: '#ff9a3c', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>LEARNING PLATFORM · ACADEMIC GOVERNANCE</div>
        <h1 style={{ color: 'white', fontSize: 34, margin: '6px 0' }}>Question Bank & Practice Studio</h1>
        <p style={{ color: 'rgba(255,255,255,.66)', maxWidth: 980, lineHeight: 1.7 }}>
          Author bilingual learning questions and assessments. Every new item starts as DRAFT and must follow the governed academic-review path before publication.
        </p>
        <div style={{ marginTop: 12, padding: '10px 12px', border: '1px solid rgba(255,154,60,.35)', borderRadius: 10, color: '#ffd0a8', background: 'rgba(255,154,60,.08)', maxWidth: 980 }}>
          DRAFT → SUBMITTED → ACADEMIC REVIEW → APPROVED → PUBLISHED. Question approval requires Hindi prompt, Hindi explanation, Hindi objective options and zero negative marking.
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Link className={styles.tinyButton} href="/admin/learning">← Learning Studio</Link>
          <Link className={styles.tinyButton} href="/admin/learning/review/force">Academic review cockpit →</Link>
          <Link className={styles.tinyButton} href="/admin/learning/intake">NROER / OER Intake →</Link>
        </div>
      </div>

      <div className={styles.adminGrid}>
        <section className={styles.adminPanel}>
          <h2>Create bilingual question</h2>
          <label className={styles.field}>Question prompt · English<textarea className={styles.textarea} value={question.prompt} onChange={(e) => setQuestion((q) => ({ ...q, prompt: e.target.value }))} /></label>
          <label className={styles.field}>Question prompt · हिन्दी<textarea className={styles.textarea} value={question.promptHi || ''} onChange={(e) => setQuestion((q) => ({ ...q, promptHi: e.target.value }))} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className={styles.field}>Class<input className={styles.input} type="number" min={1} max={12} value={question.classMin || 8} onChange={(e) => setQuestion((q) => ({ ...q, classMin: Number(e.target.value), classMax: Number(e.target.value) }))} /></label>
            <label className={styles.field}>Difficulty<select className={styles.select} value={question.difficulty} onChange={(e) => setQuestion((q) => ({ ...q, difficulty: e.target.value as SaveLearningStudioQuestion['difficulty'] }))}>{['FOUNDATION','EASY','MEDIUM','HARD','CHALLENGE'].map((v) => <option key={v}>{v}</option>)}</select></label>
          </div>
          <div className={styles.field}>Answer options · English / हिन्दी
            {(question.options || []).map((option, index) => (
              <div key={option.key} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1fr 92px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <strong>{option.key}</strong>
                <input className={styles.input} value={option.text} onChange={(e) => setOption(index, 'text', e.target.value)} placeholder={`English ${option.key}`} />
                <input className={styles.input} value={option.textHi || ''} onChange={(e) => setOption(index, 'textHi', e.target.value)} placeholder={`हिन्दी ${option.key}`} />
                <button type="button" className={styles.tinyButton} onClick={() => setQuestion((q) => ({ ...q, correctAnswer: { option: option.key } }))}>{(question.correctAnswer as { option?: string })?.option === option.key ? '✓ Correct' : 'Set correct'}</button>
              </div>
            ))}
          </div>
          <label className={styles.field}>Explanation · English<textarea className={styles.textarea} style={{ minHeight: 90 }} value={question.explanation || ''} onChange={(e) => setQuestion((q) => ({ ...q, explanation: e.target.value }))} placeholder="Explain why the answer is correct." /></label>
          <label className={styles.field}>Explanation · हिन्दी<textarea className={styles.textarea} style={{ minHeight: 90 }} value={question.explanationHi || ''} onChange={(e) => setQuestion((q) => ({ ...q, explanationHi: e.target.value }))} /></label>
          <label className={styles.field}>Visibility<select className={styles.select} value={question.visibility} onChange={(e) => setQuestion((q) => ({ ...q, visibility: e.target.value as SaveLearningStudioQuestion['visibility'] }))}>{['PUBLIC','REGISTERED','CLASS_ONLY'].map((v) => <option key={v}>{v}</option>)}</select></label>
          <div className={styles.field}>Review state<input className={styles.input} value="DRAFT — mandatory initial state" disabled /></div>
          <div className={styles.field}>Boards<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{(optionsQuery.data?.boards || []).slice(0, 18).map((board) => { const active = (question.boardCodes || []).includes(board.code); return <button key={board.code} type="button" className={styles.tinyButton} style={active ? { borderColor: '#ff8d32', color: '#ffb27a' } : undefined} onClick={() => setQuestion((q) => ({ ...q, boardCodes: active ? (q.boardCodes || []).filter((b) => b !== board.code) : [...(q.boardCodes || []), board.code] }))}>{board.short_name || board.code}</button>; })}</div></div>
          <button className="btn-primary" disabled={questionMutation.isPending || !question.prompt.trim() || (question.options || []).some((o) => !o.text.trim())} onClick={() => questionMutation.mutate()}>{questionMutation.isPending ? 'Saving…' : 'Save question as DRAFT'}</button>
        </section>

        <section className={styles.adminPanel}>
          <h2>Assemble assessment</h2>
          <label className={styles.field}>Title · English<input className={styles.input} value={assessment.title} onChange={(e) => setAssessment((a) => ({ ...a, title: e.target.value }))} /></label>
          <label className={styles.field}>Title · हिन्दी<input className={styles.input} value={assessment.titleHi || ''} onChange={(e) => setAssessment((a) => ({ ...a, titleHi: e.target.value }))} /></label>
          <label className={styles.field}>Summary<textarea className={styles.textarea} style={{ minHeight: 70 }} value={assessment.summary || ''} onChange={(e) => setAssessment((a) => ({ ...a, summary: e.target.value }))} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className={styles.field}>Type<select className={styles.select} value={assessment.assessmentType} onChange={(e) => setAssessment((a) => ({ ...a, assessmentType: e.target.value as SaveLearningStudioAssessment['assessmentType'] }))}>{['PRACTICE','CHAPTER_TEST','UNIT_TEST','MOCK','DAILY'].map((v) => <option key={v}>{v}</option>)}</select></label>
            <label className={styles.field}>Class<input className={styles.input} type="number" min={1} max={12} value={assessment.classMin || 8} onChange={(e) => setAssessment((a) => ({ ...a, classMin: Number(e.target.value), classMax: Number(e.target.value) }))} /></label>
            <label className={styles.field}>Visibility<select className={styles.select} value={assessment.visibility} onChange={(e) => setAssessment((a) => ({ ...a, visibility: e.target.value as SaveLearningStudioAssessment['visibility'] }))}>{['PUBLIC','REGISTERED','CLASS_ONLY'].map((v) => <option key={v}>{v}</option>)}</select></label>
            <div className={styles.field}>Review state<input className={styles.input} value="DRAFT — mandatory" disabled /></div>
          </div>
          <div className={styles.field}>Select questions ({assessment.questionIds.length})
            <div className={styles.adminList}>{(questionsQuery.data || []).map((q) => (
              <label className={styles.adminItem} key={q.id} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input type="checkbox" checked={selectedQuestions.has(q.id)} onChange={() => toggleQuestion(q.id)} />
                  <div>
                    <strong>{q.public_code}</strong><p>{q.prompt}</p>
                    <div className={styles.pillRow}><span className={styles.pill}>{q.difficulty}</span><span className={styles.pill}>{q.review_status}</span>{q.board_codes.map((b) => <span className={styles.pill} key={b}>{b}</span>)}</div>
                  </div>
                </div>
              </label>
            ))}</div>
          </div>
          <button className="btn-primary" disabled={assessmentMutation.isPending || !assessment.title.trim() || !assessment.questionIds.length} onClick={() => assessmentMutation.mutate()}>{assessmentMutation.isPending ? 'Creating…' : 'Save assessment as DRAFT'}</button>
        </section>
      </div>

      <section className={styles.adminPanel} style={{ marginTop: 18 }}>
        <h2>Question review queue</h2>
        <p style={{ color: 'rgba(255,255,255,.58)', marginTop: -4 }}>Academic approval is blocked server-side until bilingual question requirements are complete.</p>
        <div className={styles.adminList}>{(questionsQuery.data || []).map((item) => {
          const bilingualReady = Boolean(item.prompt_hi?.trim()) && Boolean(item.explanation_hi?.trim()) && Number(item.missing_hindi_option_count || 0) === 0 && Number(item.negative_marks || 0) === 0;
          return (
            <article className={styles.adminItem} key={item.id}>
              <div className={styles.adminItemTop}>
                <div><strong>{item.public_code}</strong><p>{item.prompt}</p></div>
                <span className={styles.badge}>{item.review_status.replaceAll('_', ' ')}</span>
              </div>
              <div className={styles.pillRow}>
                <span className={styles.pill}>{item.difficulty}</span>
                <span className={styles.pill}>{item.visibility}</span>
                <span className={styles.pill}>{bilingualReady ? 'BILINGUAL READY' : 'BILINGUAL QA REQUIRED'}</span>
                <span className={styles.pill}>NEGATIVE {Number(item.negative_marks || 0)}</span>
                {item.board_codes.map((b) => <span className={styles.pill} key={b}>{b}</span>)}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {actionsFor(item.review_status).map((action) => (
                  <button key={action.status} type="button" className={styles.tinyButton} disabled={questionStatusMutation.isPending} onClick={() => questionStatusMutation.mutate({ id: item.id, status: action.status })}>{action.label}</button>
                ))}
              </div>
            </article>
          );
        })}</div>
      </section>

      <section className={styles.adminPanel} style={{ marginTop: 18 }}>
        <h2>Assessment catalogue & review</h2>
        <p style={{ color: 'rgba(255,255,255,.58)', marginTop: -4 }}>Approval requires approved questions; publication requires every included question to be PUBLISHED.</p>
        <div className={styles.adminList}>{(assessmentsQuery.data || []).map((item) => (
          <article className={styles.adminItem} key={item.id}>
            <div className={styles.adminItemTop}>
              <div><strong>{item.title}</strong><p>{item.assessment_type.replaceAll('_', ' ')} · {item.question_count} questions · {item.total_marks} marks · {item.visibility}</p></div>
              <span className={styles.badge}>{item.review_status.replaceAll('_', ' ')}</span>
            </div>
            <div className={styles.pillRow}>
              <span className={styles.pill}>{item.published_question_count}/{item.question_count} QUESTIONS PUBLISHED</span>
              {item.board_codes.map((b) => <span className={styles.pill} key={b}>{b}</span>)}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {actionsFor(item.review_status).map((action) => (
                <button key={action.status} type="button" className={styles.tinyButton} disabled={assessmentStatusMutation.isPending} onClick={() => assessmentStatusMutation.mutate({ id: item.id, status: action.status })}>{action.label}</button>
              ))}
            </div>
          </article>
        ))}</div>
      </section>
    </div>
  );
}
