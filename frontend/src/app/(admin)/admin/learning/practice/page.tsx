'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import LearningQualityPanel from '@/components/admin/LearningQualityPanel';
import {
  createLearningStudioAssessment,
  createLearningStudioQuestion,
  getLearningStudioAssessments,
  getLearningStudioConcepts,
  getLearningStudioQuestions,
  updateLearningStudioAssessmentStatus,
  updateLearningStudioQuestionStatus,
  type LearningCognitiveSkill,
  type LearningReviewStatus,
  type SaveLearningStudioAssessment,
  type SaveLearningStudioQuestion,
} from '@/services/adminLearningService';
import { apiErrorText } from '@/utils/errors';

const REVIEW_TRANSITIONS: Record<LearningReviewStatus, LearningReviewStatus[]> = {
  DRAFT: ['SUBMITTED', 'ARCHIVED'],
  SUBMITTED: ['DRAFT', 'ACADEMIC_REVIEW', 'ARCHIVED'],
  ACADEMIC_REVIEW: ['SUBMITTED', 'APPROVED', 'ARCHIVED'],
  APPROVED: ['ACADEMIC_REVIEW', 'PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};
const COGNITIVE: LearningCognitiveSkill[] = ['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYSE', 'EVALUATE', 'CREATE'];
const inputStyle = { width: '100%', marginTop: 5, padding: '9px 10px', borderRadius: 8, background: 'rgba(255,255,255,.05)', color: 'white', border: '1px solid rgba(255,255,255,.12)' } as const;
const labelStyle = { display: 'block', color: 'rgba(255,255,255,.65)', fontSize: 12, fontWeight: 800 } as const;

const INITIAL_QUESTION: SaveLearningStudioQuestion = {
  prompt: '', promptHi: '', questionType: 'MCQ_SINGLE', difficulty: 'MEDIUM', cognitiveSkill: 'UNDERSTAND',
  correctAnswer: { option: 'A' }, marks: 1, negativeMarks: 0, explanation: '', explanationHi: '',
  classMin: 8, classMax: 8, sourceCode: 'VIDYASETU_ORIGINAL', licence: 'VIDYASETU_ORIGINAL',
  visibility: 'REGISTERED', reviewStatus: 'DRAFT', boardCodes: ['COMMON'], conceptIds: [], skillCode: '',
  learningOutcomeCode: '', misconceptionCode: '', misconceptionText: '', misconceptionTextHi: '',
  options: [
    { key: 'A', text: '', textHi: '' }, { key: 'B', text: '', textHi: '' },
    { key: 'C', text: '', textHi: '' }, { key: 'D', text: '', textHi: '' },
  ],
};

const INITIAL_ASSESSMENT: SaveLearningStudioAssessment = {
  title: '', titleHi: '', summary: '', assessmentType: 'PRACTICE', visibility: 'REGISTERED', reviewStatus: 'DRAFT',
  classMin: 8, classMax: 8, timeLimitMins: 10, passingPct: 40, shuffleQuestions: false,
  isFeaturedPublic: false, boardCodes: ['COMMON'], questionIds: [], conceptIds: [],
};

function statusLabel(value: string): string { return value.replaceAll('_', ' '); }

export default function LearningPracticeStudioPage() {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState<SaveLearningStudioQuestion>(INITIAL_QUESTION);
  const [assessment, setAssessment] = useState<SaveLearningStudioAssessment>(INITIAL_ASSESSMENT);
  const [selectedQuality, setSelectedQuality] = useState<{ type: 'QUESTION' | 'ASSESSMENT'; id: string } | null>(null);

  const classNumber = question.classMin || 8;
  const conceptsQuery = useQuery({
    queryKey: ['learning-studio-concepts', classNumber],
    queryFn: () => getLearningStudioConcepts({ class: classNumber }).then((r) => r.data.data || []),
  });
  const questionsQuery = useQuery({ queryKey: ['learning-studio-questions'], queryFn: () => getLearningStudioQuestions().then((r) => r.data.data || []) });
  const assessmentsQuery = useQuery({ queryKey: ['learning-studio-assessments'], queryFn: () => getLearningStudioAssessments().then((r) => r.data.data || []) });
  const selectedQuestions = useMemo(() => new Set(assessment.questionIds), [assessment.questionIds]);

  const questionMutation = useMutation({
    mutationFn: () => createLearningStudioQuestion({ ...question, reviewStatus: 'DRAFT', negativeMarks: 0 }),
    onSuccess: async () => {
      toast.success('Question saved as governed DRAFT');
      setQuestion(INITIAL_QUESTION);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['learning-studio-questions'] }), queryClient.invalidateQueries({ queryKey: ['learning-coverage'] })]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not create question')),
  });

  const assessmentMutation = useMutation({
    mutationFn: () => createLearningStudioAssessment({ ...assessment, reviewStatus: 'DRAFT' }),
    onSuccess: async () => {
      toast.success('Assessment saved as governed DRAFT');
      setAssessment(INITIAL_ASSESSMENT);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['learning-studio-assessments'] }), queryClient.invalidateQueries({ queryKey: ['learning-coverage'] })]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not create assessment')),
  });

  const questionStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LearningReviewStatus }) => updateLearningStudioQuestionStatus(id, status),
    onSuccess: async (_response, variables) => {
      toast.success(`Question moved to ${statusLabel(variables.status)}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['learning-studio-questions'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-studio-assessments'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-readiness', 'QUESTION', variables.id] }),
        queryClient.invalidateQueries({ queryKey: ['learning-coverage'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Question review transition blocked')),
  });

  const assessmentStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LearningReviewStatus }) => updateLearningStudioAssessmentStatus(id, status),
    onSuccess: async (_response, variables) => {
      toast.success(`Assessment moved to ${statusLabel(variables.status)}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['learning-studio-assessments'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-readiness', 'ASSESSMENT', variables.id] }),
        queryClient.invalidateQueries({ queryKey: ['learning-coverage'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Assessment review transition blocked')),
  });

  function setOption(index: number, field: 'text' | 'textHi', value: string): void {
    setQuestion((current) => ({ ...current, options: (current.options || []).map((option, i) => i === index ? { ...option, [field]: value } : option) }));
  }

  function toggleQuestion(id: string): void {
    setAssessment((current) => ({ ...current, questionIds: selectedQuestions.has(id) ? current.questionIds.filter((q) => q !== id) : [...current.questionIds, id] }));
  }

  return (
    <div style={{ padding: 24, color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#ff9a3c', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>LEARNING PLATFORM · ASSESSMENT INTELLIGENCE</div>
          <h1 style={{ fontSize: 34, margin: '5px 0' }}>Question Bank & Assessment Studio</h1>
          <p style={{ color: 'rgba(255,255,255,.62)', maxWidth: 950, lineHeight: 1.65 }}>Every question is concept-mapped, bilingual and tagged by cognitive demand. Misconception signals are first-class evidence for diagnostics and remediation.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}><Link href="/admin/learning" className="btn-secondary">← Learning Studio</Link><Link href="/admin/learning/coverage" className="btn-secondary">Coverage</Link></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(440px,1fr) minmax(440px,1fr)', gap: 18, marginTop: 18, alignItems: 'start' }}>
        <section style={{ padding: 17, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.035)' }}>
          <h2 style={{ marginTop: 0 }}>Author bilingual question</h2>
          <label style={labelStyle}>English prompt<textarea style={{ ...inputStyle, minHeight: 82 }} value={question.prompt} onChange={(e) => setQuestion((q) => ({ ...q, prompt: e.target.value }))} /></label>
          <label style={{ ...labelStyle, marginTop: 9 }}>हिन्दी प्रश्न<textarea style={{ ...inputStyle, minHeight: 82 }} value={question.promptHi || ''} onChange={(e) => setQuestion((q) => ({ ...q, promptHi: e.target.value }))} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9, marginTop: 9 }}>
            <label style={labelStyle}>Class<input style={inputStyle} type="number" min={1} max={12} value={question.classMin || 8} onChange={(e) => setQuestion((q) => ({ ...q, classMin: Number(e.target.value), classMax: Number(e.target.value), conceptIds: [] }))} /></label>
            <label style={labelStyle}>Difficulty<select style={inputStyle} value={question.difficulty} onChange={(e) => setQuestion((q) => ({ ...q, difficulty: e.target.value as SaveLearningStudioQuestion['difficulty'] }))}>{['FOUNDATION','EASY','MEDIUM','HARD','CHALLENGE'].map((v) => <option key={v}>{v}</option>)}</select></label>
            <label style={labelStyle}>Cognitive skill<select style={inputStyle} value={question.cognitiveSkill} onChange={(e) => setQuestion((q) => ({ ...q, cognitiveSkill: e.target.value as LearningCognitiveSkill }))}>{COGNITIVE.map((v) => <option key={v}>{v}</option>)}</select></label>
          </div>
          <label style={{ ...labelStyle, marginTop: 9 }}>Canonical concept<select style={inputStyle} value={question.conceptIds?.[0] || ''} onChange={(e) => setQuestion((q) => ({ ...q, conceptIds: e.target.value ? [e.target.value] : [] }))}><option value="">Select concept</option>{(conceptsQuery.data || []).map((concept) => <option key={concept.id} value={concept.id}>{concept.code} — {concept.name}</option>)}</select></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 9 }}>
            <label style={labelStyle}>Skill code<input style={inputStyle} value={question.skillCode || ''} onChange={(e) => setQuestion((q) => ({ ...q, skillCode: e.target.value }))} placeholder="SCI-APPLY-FORCE" /></label>
            <label style={labelStyle}>Learning outcome code<input style={inputStyle} value={question.learningOutcomeCode || ''} onChange={(e) => setQuestion((q) => ({ ...q, learningOutcomeCode: e.target.value }))} /></label>
          </div>

          <div style={{ marginTop: 11 }}>
            <div style={labelStyle}>Answer options · English / हिन्दी</div>
            {(question.options || []).map((option, index) => (
              <div key={option.key} style={{ display: 'grid', gridTemplateColumns: '34px 1fr 1fr 92px', gap: 7, marginTop: 7, alignItems: 'center' }}>
                <strong>{option.key}</strong>
                <input style={inputStyle} value={option.text} onChange={(e) => setOption(index, 'text', e.target.value)} />
                <input style={inputStyle} value={option.textHi || ''} onChange={(e) => setOption(index, 'textHi', e.target.value)} />
                <button type="button" onClick={() => setQuestion((q) => ({ ...q, correctAnswer: { option: option.key } }))} style={{ padding: 7, borderRadius: 7, border: '1px solid rgba(255,255,255,.14)', background: (question.correctAnswer as { option?: string })?.option === option.key ? 'rgba(71,209,140,.13)' : 'rgba(255,255,255,.05)', color: 'white' }}>{(question.correctAnswer as { option?: string })?.option === option.key ? '✓ Correct' : 'Set correct'}</button>
              </div>
            ))}
          </div>

          <label style={{ ...labelStyle, marginTop: 10 }}>English explanation<textarea style={{ ...inputStyle, minHeight: 78 }} value={question.explanation || ''} onChange={(e) => setQuestion((q) => ({ ...q, explanation: e.target.value }))} /></label>
          <label style={{ ...labelStyle, marginTop: 9 }}>हिन्दी व्याख्या<textarea style={{ ...inputStyle, minHeight: 78 }} value={question.explanationHi || ''} onChange={(e) => setQuestion((q) => ({ ...q, explanationHi: e.target.value }))} /></label>

          <div style={{ marginTop: 12, padding: 11, borderRadius: 9, border: '1px solid rgba(255,193,139,.2)', background: 'rgba(255,154,60,.05)' }}>
            <div style={{ color: '#ffc18b', fontSize: 12, fontWeight: 900 }}>Optional misconception diagnostic</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 7 }}>
              <label style={labelStyle}>Misconception code<input style={inputStyle} value={question.misconceptionCode || ''} onChange={(e) => setQuestion((q) => ({ ...q, misconceptionCode: e.target.value }))} placeholder="FORCE-ONLY-MOTION" /></label>
              <label style={labelStyle}>English misconception<input style={inputStyle} value={question.misconceptionText || ''} onChange={(e) => setQuestion((q) => ({ ...q, misconceptionText: e.target.value }))} /></label>
              <label style={labelStyle}>हिन्दी भ्रांति<input style={inputStyle} value={question.misconceptionTextHi || ''} onChange={(e) => setQuestion((q) => ({ ...q, misconceptionTextHi: e.target.value }))} /></label>
            </div>
          </div>

          <button className="btn-primary" style={{ marginTop: 13 }} disabled={questionMutation.isPending || !question.prompt.trim() || !question.promptHi?.trim() || !(question.conceptIds || []).length || !question.skillCode?.trim() || (question.options || []).some((o) => !o.text.trim() || !o.textHi?.trim())} onClick={() => questionMutation.mutate()}>{questionMutation.isPending ? 'Saving…' : 'Save governed DRAFT question'}</button>
        </section>

        <section style={{ padding: 17, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.035)' }}>
          <h2 style={{ marginTop: 0 }}>Assemble concept assessment</h2>
          <label style={labelStyle}>English title<input style={inputStyle} value={assessment.title} onChange={(e) => setAssessment((a) => ({ ...a, title: e.target.value }))} /></label>
          <label style={{ ...labelStyle, marginTop: 9 }}>हिन्दी शीर्षक<input style={inputStyle} value={assessment.titleHi || ''} onChange={(e) => setAssessment((a) => ({ ...a, titleHi: e.target.value }))} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 9 }}>
            <label style={labelStyle}>Type<select style={inputStyle} value={assessment.assessmentType} onChange={(e) => setAssessment((a) => ({ ...a, assessmentType: e.target.value as SaveLearningStudioAssessment['assessmentType'] }))}>{['PRACTICE','CHAPTER_TEST','UNIT_TEST','MOCK','DAILY'].map((v) => <option key={v}>{v}</option>)}</select></label>
            <label style={labelStyle}>Class<input style={inputStyle} type="number" min={1} max={12} value={assessment.classMin || 8} onChange={(e) => setAssessment((a) => ({ ...a, classMin: Number(e.target.value), classMax: Number(e.target.value), conceptIds: [] }))} /></label>
          </div>
          <label style={{ ...labelStyle, marginTop: 9 }}>Canonical concept<select style={inputStyle} value={assessment.conceptIds?.[0] || ''} onChange={(e) => setAssessment((a) => ({ ...a, conceptIds: e.target.value ? [e.target.value] : [] }))}><option value="">Select concept</option>{(conceptsQuery.data || []).map((concept) => <option key={concept.id} value={concept.id}>{concept.code} — {concept.name}</option>)}</select></label>
          <label style={{ ...labelStyle, marginTop: 9 }}>Summary<textarea style={{ ...inputStyle, minHeight: 65 }} value={assessment.summary || ''} onChange={(e) => setAssessment((a) => ({ ...a, summary: e.target.value }))} /></label>
          <div style={{ marginTop: 11, color: 'rgba(255,255,255,.6)', fontSize: 12 }}>Select questions ({assessment.questionIds.length}). Publication requires the minimum depth for the assessment type and all included questions to be published.</div>
          <div style={{ maxHeight: 385, overflowY: 'auto', marginTop: 8, border: '1px solid rgba(255,255,255,.08)', borderRadius: 9 }}>
            {(questionsQuery.data || []).filter((q) => !assessment.classMin || q.class_min === assessment.classMin).map((q) => (
              <label key={q.id} style={{ display: 'flex', gap: 9, padding: 9, borderBottom: '1px solid rgba(255,255,255,.06)', cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedQuestions.has(q.id)} onChange={() => toggleQuestion(q.id)} />
                <div><strong style={{ fontSize: 12 }}>{q.public_code}</strong><div style={{ color: 'rgba(255,255,255,.62)', fontSize: 12, marginTop: 2 }}>{q.prompt}</div><div style={{ color: 'rgba(255,255,255,.4)', fontSize: 10, marginTop: 3 }}>{q.difficulty} · {q.cognitive_skill || 'UNSET'} · {q.review_status}</div></div>
              </label>
            ))}
          </div>
          <button className="btn-primary" style={{ marginTop: 13 }} disabled={assessmentMutation.isPending || !assessment.title.trim() || !assessment.titleHi?.trim() || !assessment.questionIds.length || !(assessment.conceptIds || []).length} onClick={() => assessmentMutation.mutate()}>{assessmentMutation.isPending ? 'Saving…' : 'Save governed DRAFT assessment'}</button>
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 18 }}>
        <section style={{ padding: 16, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)' }}>
          <h2 style={{ marginTop: 0 }}>Question review queue</h2>
          {(questionsQuery.data || []).slice(0, 60).map((q) => (
            <div key={q.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><button type="button" onClick={() => setSelectedQuality({ type: 'QUESTION', id: q.id })} style={{ background: 'transparent', border: 0, color: 'white', padding: 0, textAlign: 'left' }}><strong>{q.public_code}</strong> · {q.prompt}</button><span style={{ color: q.review_status === 'PUBLISHED' ? '#47d18c' : '#ffd166', fontSize: 10, fontWeight: 900 }}>{statusLabel(q.review_status)}</span></div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>{(REVIEW_TRANSITIONS[q.review_status] || []).map((status) => <button key={status} type="button" onClick={() => questionStatusMutation.mutate({ id: q.id, status })} style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: 'rgba(255,255,255,.7)', fontSize: 10 }}>{statusLabel(status)}</button>)}<button type="button" onClick={() => setSelectedQuality({ type: 'QUESTION', id: q.id })} style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid rgba(79,195,247,.25)', background: 'rgba(79,195,247,.06)', color: '#b9e5ff', fontSize: 10 }}>Quality</button></div>
            </div>
          ))}
        </section>
        <section style={{ padding: 16, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)' }}>
          <h2 style={{ marginTop: 0 }}>Assessment review queue</h2>
          {(assessmentsQuery.data || []).slice(0, 40).map((a) => (
            <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><button type="button" onClick={() => setSelectedQuality({ type: 'ASSESSMENT', id: a.id })} style={{ background: 'transparent', border: 0, color: 'white', padding: 0, textAlign: 'left' }}><strong>{a.title}</strong><div style={{ color: 'rgba(255,255,255,.42)', fontSize: 10 }}>{a.assessment_type} · {a.question_count} questions · {a.published_question_count} published</div></button><span style={{ color: a.review_status === 'PUBLISHED' ? '#47d18c' : '#ffd166', fontSize: 10, fontWeight: 900 }}>{statusLabel(a.review_status)}</span></div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>{(REVIEW_TRANSITIONS[a.review_status] || []).map((status) => <button key={status} type="button" onClick={() => assessmentStatusMutation.mutate({ id: a.id, status })} style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: 'rgba(255,255,255,.7)', fontSize: 10 }}>{statusLabel(status)}</button>)}<button type="button" onClick={() => setSelectedQuality({ type: 'ASSESSMENT', id: a.id })} style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid rgba(79,195,247,.25)', background: 'rgba(79,195,247,.06)', color: '#b9e5ff', fontSize: 10 }}>Quality</button></div>
            </div>
          ))}
        </section>
      </div>

      {selectedQuality && <div style={{ marginTop: 18 }}><LearningQualityPanel entityType={selectedQuality.type} entityId={selectedQuality.id} /></div>}
    </div>
  );
}
