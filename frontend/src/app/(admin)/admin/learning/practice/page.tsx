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
  type SaveLearningStudioAssessment,
  type SaveLearningStudioQuestion,
} from '@/services/adminLearningService';
import { apiErrorText } from '@/utils/errors';
import styles from '@/components/public/publicLearning.module.css';

const INITIAL_QUESTION: SaveLearningStudioQuestion = {
  prompt: '', questionType: 'MCQ_SINGLE', difficulty: 'MEDIUM', correctAnswer: { option: 'A' }, marks: 1,
  classMin: 8, classMax: 8, sourceCode: 'VIDYASETU_ORIGINAL', licence: 'VIDYASETU_ORIGINAL',
  visibility: 'REGISTERED', reviewStatus: 'DRAFT', boardCodes: ['COMMON'],
  options: [{ key: 'A', text: '' }, { key: 'B', text: '' }, { key: 'C', text: '' }, { key: 'D', text: '' }],
};

const INITIAL_ASSESSMENT: SaveLearningStudioAssessment = {
  title: '', summary: '', assessmentType: 'PRACTICE', visibility: 'REGISTERED', reviewStatus: 'DRAFT',
  classMin: 8, classMax: 8, timeLimitMins: 10, passingPct: 40, shuffleQuestions: false,
  isFeaturedPublic: false, boardCodes: ['COMMON'], questionIds: [],
};

export default function LearningPracticeStudioPage() {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState<SaveLearningStudioQuestion>(INITIAL_QUESTION);
  const [assessment, setAssessment] = useState<SaveLearningStudioAssessment>(INITIAL_ASSESSMENT);

  const optionsQuery = useQuery({ queryKey: ['learning-studio-options'], queryFn: () => getLearningStudioOptions().then((r) => r.data.data) });
  const questionsQuery = useQuery({ queryKey: ['learning-studio-questions'], queryFn: () => getLearningStudioQuestions().then((r) => r.data.data || []) });
  const assessmentsQuery = useQuery({ queryKey: ['learning-studio-assessments'], queryFn: () => getLearningStudioAssessments().then((r) => r.data.data || []) });

  const selectedQuestions = useMemo(() => new Set(assessment.questionIds), [assessment.questionIds]);

  const questionMutation = useMutation({
    mutationFn: () => createLearningStudioQuestion(question),
    onSuccess: async () => { toast.success('Question added to VidyaSetu Question Bank'); setQuestion(INITIAL_QUESTION); await queryClient.invalidateQueries({ queryKey: ['learning-studio-questions'] }); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not create question')),
  });

  const assessmentMutation = useMutation({
    mutationFn: () => createLearningStudioAssessment(assessment),
    onSuccess: async () => { toast.success('Assessment created'); setAssessment(INITIAL_ASSESSMENT); await queryClient.invalidateQueries({ queryKey: ['learning-studio-assessments'] }); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not create assessment')),
  });

  function toggleQuestion(id: string): void {
    setAssessment((current) => ({ ...current, questionIds: selectedQuestions.has(id) ? current.questionIds.filter((q) => q !== id) : [...current.questionIds, id] }));
  }

  function setOption(index: number, text: string): void {
    setQuestion((current) => ({ ...current, options: (current.options || []).map((option, i) => i === index ? { ...option, text } : option) }));
  }

  return (
    <div className={styles.studio}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ color: '#ff9a3c', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>LEARNING PLATFORM · PHASE 2</div>
        <h1 style={{ color: 'white', fontSize: 34, margin: '6px 0' }}>🧠 Question Bank & Practice Studio</h1>
        <p style={{ color: 'rgba(255,255,255,.58)', maxWidth: 900, lineHeight: 1.7 }}>Create original questions with explanations, map them by class/board, assemble practice sets and publish public previews or Student-only assessments.</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><Link className={styles.tinyButton} href="/admin/learning">← Learning Studio</Link><Link className={styles.tinyButton} href="/admin/learning/intake">NROER / OER Intake →</Link></div>
      </div>

      <div className={styles.adminGrid}>
        <section className={styles.adminPanel}>
          <h2>Create original question</h2>
          <label className={styles.field}>Question prompt<textarea className={styles.textarea} value={question.prompt} onChange={(e) => setQuestion((q) => ({ ...q, prompt: e.target.value }))} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className={styles.field}>Class<input className={styles.input} type="number" min={1} max={12} value={question.classMin || 8} onChange={(e) => setQuestion((q) => ({ ...q, classMin: Number(e.target.value), classMax: Number(e.target.value) }))} /></label>
            <label className={styles.field}>Difficulty<select className={styles.select} value={question.difficulty} onChange={(e) => setQuestion((q) => ({ ...q, difficulty: e.target.value as SaveLearningStudioQuestion['difficulty'] }))}>{['FOUNDATION','EASY','MEDIUM','HARD','CHALLENGE'].map((v) => <option key={v}>{v}</option>)}</select></label>
          </div>
          <div className={styles.field}>Options
            {(question.options || []).map((option, index) => <div key={option.key} style={{ display: 'grid', gridTemplateColumns: '42px 1fr 90px', gap: 8, marginBottom: 8, alignItems: 'center' }}><strong>{option.key}</strong><input className={styles.input} value={option.text} onChange={(e) => setOption(index, e.target.value)} placeholder={`Option ${option.key}`} /><button type="button" className={styles.tinyButton} onClick={() => setQuestion((q) => ({ ...q, correctAnswer: { option: option.key } }))}>{(question.correctAnswer as { option?: string })?.option === option.key ? '✓ Correct' : 'Set correct'}</button></div>)}
          </div>
          <label className={styles.field}>Explanation<textarea className={styles.textarea} style={{ minHeight: 90 }} value={question.explanation || ''} onChange={(e) => setQuestion((q) => ({ ...q, explanation: e.target.value }))} placeholder="Explain why the correct answer is correct." /></label>
          <label className={styles.field}>Visibility<select className={styles.select} value={question.visibility} onChange={(e) => setQuestion((q) => ({ ...q, visibility: e.target.value as SaveLearningStudioQuestion['visibility'] }))}>{['PUBLIC','REGISTERED','CLASS_ONLY'].map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className={styles.field}>Review state<select className={styles.select} value={question.reviewStatus} onChange={(e) => setQuestion((q) => ({ ...q, reviewStatus: e.target.value as SaveLearningStudioQuestion['reviewStatus'] }))}>{['DRAFT','SUBMITTED','ACADEMIC_REVIEW','APPROVED','PUBLISHED'].map((v) => <option key={v}>{v}</option>)}</select></label>
          <div className={styles.field}>Boards<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{(optionsQuery.data?.boards || []).slice(0, 18).map((board) => { const active = (question.boardCodes || []).includes(board.code); return <button key={board.code} type="button" className={styles.tinyButton} style={active ? { borderColor: '#ff8d32', color: '#ffb27a' } : undefined} onClick={() => setQuestion((q) => ({ ...q, boardCodes: active ? (q.boardCodes || []).filter((b) => b !== board.code) : [...(q.boardCodes || []), board.code] }))}>{board.short_name || board.code}</button>; })}</div></div>
          <button className="btn-primary" disabled={questionMutation.isPending || !question.prompt.trim() || (question.options || []).some((o) => !o.text.trim())} onClick={() => questionMutation.mutate()}>{questionMutation.isPending ? 'Saving…' : 'Add question'}</button>
        </section>

        <section className={styles.adminPanel}>
          <h2>Assemble assessment</h2>
          <label className={styles.field}>Title<input className={styles.input} value={assessment.title} onChange={(e) => setAssessment((a) => ({ ...a, title: e.target.value }))} /></label>
          <label className={styles.field}>Summary<textarea className={styles.textarea} style={{ minHeight: 70 }} value={assessment.summary || ''} onChange={(e) => setAssessment((a) => ({ ...a, summary: e.target.value }))} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className={styles.field}>Type<select className={styles.select} value={assessment.assessmentType} onChange={(e) => setAssessment((a) => ({ ...a, assessmentType: e.target.value as SaveLearningStudioAssessment['assessmentType'] }))}>{['PRACTICE','CHAPTER_TEST','UNIT_TEST','MOCK','DAILY'].map((v) => <option key={v}>{v}</option>)}</select></label>
            <label className={styles.field}>Class<input className={styles.input} type="number" min={1} max={12} value={assessment.classMin || 8} onChange={(e) => setAssessment((a) => ({ ...a, classMin: Number(e.target.value), classMax: Number(e.target.value) }))} /></label>
            <label className={styles.field}>Visibility<select className={styles.select} value={assessment.visibility} onChange={(e) => setAssessment((a) => ({ ...a, visibility: e.target.value as SaveLearningStudioAssessment['visibility'] }))}>{['PUBLIC','REGISTERED','CLASS_ONLY'].map((v) => <option key={v}>{v}</option>)}</select></label>
            <label className={styles.field}>Review state<select className={styles.select} value={assessment.reviewStatus} onChange={(e) => setAssessment((a) => ({ ...a, reviewStatus: e.target.value as SaveLearningStudioAssessment['reviewStatus'] }))}>{['DRAFT','SUBMITTED','ACADEMIC_REVIEW','APPROVED','PUBLISHED'].map((v) => <option key={v}>{v}</option>)}</select></label>
          </div>
          <div className={styles.field}>Select questions ({assessment.questionIds.length})<div className={styles.adminList}>{(questionsQuery.data || []).map((q) => <label className={styles.adminItem} key={q.id} style={{ cursor: 'pointer' }}><div style={{ display: 'flex', gap: 10 }}><input type="checkbox" checked={selectedQuestions.has(q.id)} onChange={() => toggleQuestion(q.id)} /><div><strong>{q.public_code}</strong><p>{q.prompt}</p><div className={styles.pillRow}><span className={styles.pill}>{q.difficulty}</span><span className={styles.pill}>{q.review_status}</span>{q.board_codes.map((b) => <span className={styles.pill} key={b}>{b}</span>)}</div></div></div></label>)}</div></div>
          <button className="btn-primary" disabled={assessmentMutation.isPending || !assessment.title.trim() || !assessment.questionIds.length} onClick={() => assessmentMutation.mutate()}>{assessmentMutation.isPending ? 'Creating…' : 'Create assessment'}</button>
        </section>
      </div>

      <section className={styles.adminPanel} style={{ marginTop: 18 }}>
        <h2>Assessment catalogue</h2>
        <div className={styles.adminList}>{(assessmentsQuery.data || []).map((item) => <article className={styles.adminItem} key={item.id}><div className={styles.adminItemTop}><div><strong>{item.title}</strong><p>{item.assessment_type.replaceAll('_', ' ')} · {item.question_count} questions · {item.total_marks} marks · {item.visibility}</p></div><span className={styles.badge}>{item.review_status.replaceAll('_', ' ')}</span></div><div className={styles.pillRow}>{item.board_codes.map((b) => <span className={styles.pill} key={b}>{b}</span>)}</div></article>)}</div>
      </section>
    </div>
  );
}
