'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import LearningQualityPanel from '@/components/admin/LearningQualityPanel';
import {
  getContentFactoryOptions,
  getFactoryAssessments,
  getFactoryQuestions,
  type FactoryQuestion,
} from '@/services/contentFactoryService';
import {
  updateLearningStudioAssessmentStatus,
  updateLearningStudioQuestionStatus,
  type LearningReviewStatus,
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

interface FactoryAssessment {
  id: string;
  public_slug?: string | null;
  title: string;
  title_hi?: string | null;
  summary?: string | null;
  summary_hi?: string | null;
  assessment_type: string;
  visibility: string;
  review_status: string;
  time_limit_mins?: number | null;
  passing_pct: number;
  max_attempts?: number | null;
  is_featured_public: boolean;
  grade_codes: string[];
  board_codes: string[];
  question_count: number;
}

type ReviewEntity =
  | { type: 'QUESTION'; id: string }
  | { type: 'ASSESSMENT'; id: string };

type EntityTab = 'QUESTION' | 'ASSESSMENT';

const panelStyle = {
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 14,
  background: 'rgba(255,255,255,.035)',
} as const;

function statusLabel(value: string): string {
  return value.replaceAll('_', ' ');
}

function statusTone(value: string): string {
  if (value === 'PUBLISHED') return '#47d18c';
  if (value === 'APPROVED') return '#69c8ff';
  if (value === 'SUBMITTED' || value === 'ACADEMIC_REVIEW') return '#ffd166';
  if (value === 'ARCHIVED') return '#9aa4b2';
  return '#ff9f80';
}

function asReviewStatus(value: string): LearningReviewStatus {
  return value as LearningReviewStatus;
}

export default function LearningPracticeStudioPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<EntityTab>('QUESTION');
  const [gradeCode, setGradeCode] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | LearningReviewStatus>('ALL');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ReviewEntity | null>(null);

  const optionsQuery = useQuery({
    queryKey: ['content-factory-options'],
    queryFn: () => getContentFactoryOptions().then((r) => r.data.data),
  });
  const questionsQuery = useQuery({
    queryKey: ['content-factory-questions', gradeCode || 'ALL'],
    queryFn: () => getFactoryQuestions(gradeCode || undefined).then((r) => r.data.data || []),
  });
  const assessmentsQuery = useQuery({
    queryKey: ['content-factory-assessments', gradeCode || 'ALL'],
    queryFn: () => getFactoryAssessments(gradeCode || undefined).then((r) => (r.data.data || []) as FactoryAssessment[]),
  });

  const selectedGrade = useMemo(
    () => optionsQuery.data?.grades.find((grade) => grade.code === gradeCode) || null,
    [optionsQuery.data, gradeCode],
  );

  const filteredQuestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (questionsQuery.data || []).filter((item) => {
      if (statusFilter !== 'ALL' && item.review_status !== statusFilter) return false;
      if (!q) return true;
      return [item.public_code, item.prompt, item.prompt_hi, item.question_type, item.difficulty, ...(item.grade_codes || [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [questionsQuery.data, search, statusFilter]);

  const filteredAssessments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (assessmentsQuery.data || []).filter((item) => {
      if (statusFilter !== 'ALL' && item.review_status !== statusFilter) return false;
      if (!q) return true;
      return [item.public_slug, item.title, item.title_hi, item.assessment_type, ...(item.grade_codes || [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [assessmentsQuery.data, search, statusFilter]);

  const selectedQuestion = selected?.type === 'QUESTION'
    ? (questionsQuery.data || []).find((item) => item.id === selected.id) || null
    : null;
  const selectedAssessment = selected?.type === 'ASSESSMENT'
    ? (assessmentsQuery.data || []).find((item) => item.id === selected.id) || null
    : null;

  const questionStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LearningReviewStatus }) => updateLearningStudioQuestionStatus(id, status),
    onSuccess: async (_response, variables) => {
      toast.success(`Question moved to ${statusLabel(variables.status)}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['content-factory-questions'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-studio-questions'] }),
        queryClient.invalidateQueries({ queryKey: ['content-factory-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-readiness', 'QUESTION', variables.id] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Question review transition blocked')),
  });

  const assessmentStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LearningReviewStatus }) => updateLearningStudioAssessmentStatus(id, status),
    onSuccess: async (_response, variables) => {
      toast.success(`Assessment moved to ${statusLabel(variables.status)}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['content-factory-assessments'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-studio-assessments'] }),
        queryClient.invalidateQueries({ queryKey: ['content-factory-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-readiness', 'ASSESSMENT', variables.id] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Assessment review transition blocked')),
  });

  const questionPublished = (questionsQuery.data || []).filter((item) => item.review_status === 'PUBLISHED').length;
  const assessmentPublished = (assessmentsQuery.data || []).filter((item) => item.review_status === 'PUBLISHED').length;

  function chooseGrade(code: string): void {
    setGradeCode(code);
    setSelected(null);
  }

  function chooseTab(value: EntityTab): void {
    setTab(value);
    setSelected(null);
  }

  return (
    <div style={{ padding: 24, color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#ff9a3c', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>CONTENT PLATFORM 3.0 · GOVERNED PRACTICE</div>
          <h1 style={{ fontSize: 34, margin: '5px 0' }}>Question Bank & Assessment Review</h1>
          <p style={{ color: 'rgba(255,255,255,.62)', maxWidth: 930, lineHeight: 1.65 }}>
            Review the same canonical bilingual Questions and Assessments authored in Content Factory. Pre-Nursery through Class 12 use one Grade registry; language never creates a second academic identity.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/admin/learning/factory" className="btn-primary">Author in Content Factory</Link>
          <Link href="/admin/learning" className="btn-secondary">Learning Review</Link>
          <Link href="/admin/learning/coverage" className="btn-secondary">Coverage</Link>
        </div>
      </div>

      <div style={{ margin: '15px 0', padding: 12, borderRadius: 11, border: '1px solid rgba(71,209,140,.28)', background: 'rgba(71,209,140,.06)', color: '#c8f7dc', fontSize: 12 }}>
        Authoring is centralized in Content Factory. This page is the governed review queue: DRAFT → SUBMITTED → ACADEMIC REVIEW → APPROVED → PUBLISHED.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(140px,1fr))', gap: 10, marginBottom: 15 }}>
        <div style={{ ...panelStyle, padding: 13 }}><div style={{ fontSize: 24, fontWeight: 900 }}>{questionsQuery.data?.length || 0}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,.48)' }}>Questions in scope</div></div>
        <div style={{ ...panelStyle, padding: 13 }}><div style={{ fontSize: 24, fontWeight: 900 }}>{questionPublished}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,.48)' }}>Published questions</div></div>
        <div style={{ ...panelStyle, padding: 13 }}><div style={{ fontSize: 24, fontWeight: 900 }}>{assessmentsQuery.data?.length || 0}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,.48)' }}>Assessments in scope</div></div>
        <div style={{ ...panelStyle, padding: 13 }}><div style={{ fontSize: 24, fontWeight: 900 }}>{assessmentPublished}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,.48)' }}>Published assessments</div></div>
      </div>

      <section style={{ ...panelStyle, padding: 14, marginBottom: 15 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px,1fr) minmax(220px,1fr) 190px', gap: 10, alignItems: 'end' }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,.65)' }}>
            Canonical Grade
            <select value={gradeCode} onChange={(e) => chooseGrade(e.target.value)} style={{ width: '100%', marginTop: 5, padding: '9px 10px', borderRadius: 8, background: '#111a32', color: 'white', border: '1px solid rgba(255,255,255,.12)' }}>
              <option value="">All 16 grades</option>
              {(optionsQuery.data?.grades || []).map((grade) => <option key={grade.code} value={grade.code}>{grade.short_name} · {grade.name_hi || grade.name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,.65)' }}>
            Search
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title, prompt, code, grade…" style={{ width: '100%', marginTop: 5, padding: '9px 10px', borderRadius: 8, background: 'rgba(255,255,255,.05)', color: 'white', border: '1px solid rgba(255,255,255,.12)' }} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,.65)' }}>
            Review status
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'ALL' | LearningReviewStatus)} style={{ width: '100%', marginTop: 5, padding: '9px 10px', borderRadius: 8, background: '#111a32', color: 'white', border: '1px solid rgba(255,255,255,.12)' }}>
              <option value="ALL">All statuses</option>
              {Object.keys(REVIEW_TRANSITIONS).map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
            </select>
          </label>
        </div>
        {selectedGrade && <div style={{ marginTop: 9, color: 'rgba(255,255,255,.5)', fontSize: 12 }}>Scope: <b style={{ color: 'white' }}>{selectedGrade.name}</b> · {selectedGrade.name_hi} · {selectedGrade.stage}</div>}
      </section>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => chooseTab('QUESTION')} className={tab === 'QUESTION' ? 'btn-primary' : 'btn-secondary'}>Question Bank</button>
        <button type="button" onClick={() => chooseTab('ASSESSMENT')} className={tab === 'ASSESSMENT' ? 'btn-primary' : 'btn-secondary'}>Assessments</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(390px,.9fr) minmax(480px,1.1fr)', gap: 18, alignItems: 'start' }}>
        <section style={{ ...panelStyle, overflow: 'hidden' }}>
          <div style={{ padding: 12, background: 'rgba(255,255,255,.045)', fontWeight: 900 }}>{tab === 'QUESTION' ? `${filteredQuestions.length} question(s)` : `${filteredAssessments.length} assessment(s)`}</div>
          <div style={{ maxHeight: 720, overflowY: 'auto' }}>
            {tab === 'QUESTION' && filteredQuestions.map((item: FactoryQuestion) => {
              const active = selected?.type === 'QUESTION' && selected.id === item.id;
              return <button key={item.id} type="button" onClick={() => setSelected({ type: 'QUESTION', id: item.id })} style={{ width: '100%', padding: 13, textAlign: 'left', color: 'white', background: active ? 'rgba(79,195,247,.1)' : 'transparent', border: 0, borderBottom: '1px solid rgba(255,255,255,.07)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong>{item.prompt}</strong><span style={{ color: statusTone(item.review_status), fontSize: 11, fontWeight: 900 }}>{statusLabel(item.review_status)}</span></div>
                {item.prompt_hi && <div style={{ marginTop: 4, color: 'rgba(255,255,255,.62)' }}>{item.prompt_hi}</div>}
                <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,.43)' }}>{item.public_code} · {item.question_type} · {item.difficulty} · {(item.grade_codes || []).join(', ') || 'No canonical grade'}</div>
              </button>;
            })}
            {tab === 'ASSESSMENT' && filteredAssessments.map((item) => {
              const active = selected?.type === 'ASSESSMENT' && selected.id === item.id;
              return <button key={item.id} type="button" onClick={() => setSelected({ type: 'ASSESSMENT', id: item.id })} style={{ width: '100%', padding: 13, textAlign: 'left', color: 'white', background: active ? 'rgba(79,195,247,.1)' : 'transparent', border: 0, borderBottom: '1px solid rgba(255,255,255,.07)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong>{item.title}</strong><span style={{ color: statusTone(item.review_status), fontSize: 11, fontWeight: 900 }}>{statusLabel(item.review_status)}</span></div>
                {item.title_hi && <div style={{ marginTop: 4, color: 'rgba(255,255,255,.62)' }}>{item.title_hi}</div>}
                <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,.43)' }}>{item.assessment_type} · {item.question_count} question(s) · {(item.grade_codes || []).join(', ') || 'No canonical grade'}</div>
              </button>;
            })}
            {((tab === 'QUESTION' && !questionsQuery.isLoading && filteredQuestions.length === 0) || (tab === 'ASSESSMENT' && !assessmentsQuery.isLoading && filteredAssessments.length === 0)) && <div style={{ padding: 16, color: 'rgba(255,255,255,.5)' }}>No governed items match this Grade/status/search scope.</div>}
          </div>
        </section>

        <section>
          {!selectedQuestion && !selectedAssessment && <div style={{ ...panelStyle, padding: 18, color: 'rgba(255,255,255,.55)' }}>Select a {tab === 'QUESTION' ? 'Question' : 'Assessment'} to inspect readiness evidence and move it through the review lifecycle.</div>}

          {selectedQuestion && <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ ...panelStyle, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><h2 style={{ margin: 0 }}>{selectedQuestion.prompt}</h2>{selectedQuestion.prompt_hi && <div style={{ marginTop: 5, color: 'rgba(255,255,255,.62)' }}>{selectedQuestion.prompt_hi}</div>}</div><strong style={{ color: statusTone(selectedQuestion.review_status) }}>{statusLabel(selectedQuestion.review_status)}</strong></div>
              <div style={{ marginTop: 12, color: 'rgba(255,255,255,.5)', fontSize: 12, lineHeight: 1.7 }}>Canonical Grades: <b style={{ color: 'white' }}>{selectedQuestion.grade_codes.join(', ')}</b><br />Boards: <b style={{ color: 'white' }}>{selectedQuestion.board_codes.join(', ') || '—'}</b> · Options: <b style={{ color: 'white' }}>{selectedQuestion.option_count}</b></div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 13 }}>{(REVIEW_TRANSITIONS[asReviewStatus(selectedQuestion.review_status)] || []).map((status) => <button key={status} type="button" disabled={questionStatusMutation.isPending} className={status === 'PUBLISHED' ? 'btn-primary' : 'btn-secondary'} onClick={() => questionStatusMutation.mutate({ id: selectedQuestion.id, status })}>{statusLabel(status)}</button>)}</div>
            </div>
            <LearningQualityPanel entityType="QUESTION" entityId={selectedQuestion.id} />
          </div>}

          {selectedAssessment && <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ ...panelStyle, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><h2 style={{ margin: 0 }}>{selectedAssessment.title}</h2>{selectedAssessment.title_hi && <div style={{ marginTop: 5, color: 'rgba(255,255,255,.62)' }}>{selectedAssessment.title_hi}</div>}</div><strong style={{ color: statusTone(selectedAssessment.review_status) }}>{statusLabel(selectedAssessment.review_status)}</strong></div>
              {selectedAssessment.summary && <p style={{ color: 'rgba(255,255,255,.62)', lineHeight: 1.6 }}>{selectedAssessment.summary}</p>}
              {selectedAssessment.summary_hi && <p style={{ color: 'rgba(255,255,255,.62)', lineHeight: 1.6 }}>{selectedAssessment.summary_hi}</p>}
              <div style={{ marginTop: 10, color: 'rgba(255,255,255,.5)', fontSize: 12, lineHeight: 1.7 }}>Canonical Grades: <b style={{ color: 'white' }}>{selectedAssessment.grade_codes.join(', ')}</b><br />Questions: <b style={{ color: 'white' }}>{selectedAssessment.question_count}</b> · Passing: <b style={{ color: 'white' }}>{selectedAssessment.passing_pct}%</b> · Time: <b style={{ color: 'white' }}>{selectedAssessment.time_limit_mins || '—'} min</b></div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 13 }}>{(REVIEW_TRANSITIONS[asReviewStatus(selectedAssessment.review_status)] || []).map((status) => <button key={status} type="button" disabled={assessmentStatusMutation.isPending} className={status === 'PUBLISHED' ? 'btn-primary' : 'btn-secondary'} onClick={() => assessmentStatusMutation.mutate({ id: selectedAssessment.id, status })}>{statusLabel(status)}</button>)}</div>
            </div>
            <LearningQualityPanel entityType="ASSESSMENT" entityId={selectedAssessment.id} />
          </div>}
        </section>
      </div>
    </div>
  );
}