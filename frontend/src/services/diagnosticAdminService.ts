import api from './api';
import type { ApiEnvelope } from '@/types/api';

export interface DiagnosticAdminConcept {
  id: string;
  code: string;
  name: string;
  name_hi?: string | null;
  subject_code: string;
  subject_name?: string | null;
  chapter_title?: string | null;
  class_number?: number | null;
}

export interface DiagnosticAdminQuestion {
  id: string;
  public_code: string;
  prompt: string;
  prompt_hi?: string | null;
  difficulty: string;
  cognitive_skill?: string | null;
  misconception_code?: string | null;
  review_status: string;
  class_min?: number | null;
  class_max?: number | null;
  concept_ids: string[];
  missing_hindi_option_count: number;
}

export interface DiagnosticAdminAssessment {
  id: string;
  title: string;
  title_hi?: string | null;
  assessment_type: string;
  review_status: string;
  question_count: number;
  published_question_count: number;
  concept_ids: string[];
}

export interface CreateDiagnosticPayload {
  title: string;
  titleHi: string;
  summary?: string;
  classNumber: number;
  conceptId: string;
  questionIds: string[];
  timeLimitMins?: number;
  passingPct?: number;
}

export interface DiagnosticPrerequisiteItem {
  conceptId: string;
  code: string;
  name: string;
  nameHi?: string | null;
  strength: 'HELPFUL' | 'REQUIRED';
  rationale?: string | null;
  gradeCode: string;
  classNumber?: number | null;
  subjectCode: string;
  subjectName?: string | null;
  chapterTitle?: string | null;
}

export interface DiagnosticPrerequisiteResponse {
  concept: {
    id: string;
    code: string;
    name: string;
    nameHi?: string | null;
    gradeCode: string;
    classNumber?: number | null;
    subjectCode: string;
    subjectName?: string | null;
    chapterTitle?: string | null;
  };
  prerequisites: DiagnosticPrerequisiteItem[];
}

export const getDiagnosticConcepts = (classNumber: number) =>
  api.get<ApiEnvelope<DiagnosticAdminConcept[]>>('/admin/learning/concepts', { params: { class: classNumber } });

export const getDiagnosticQuestions = () =>
  api.get<ApiEnvelope<DiagnosticAdminQuestion[]>>('/admin/learning/questions');

export const getDiagnosticAssessments = () =>
  api.get<ApiEnvelope<DiagnosticAdminAssessment[]>>('/admin/learning/assessments');

export const createDiagnosticAssessment = (payload: CreateDiagnosticPayload) =>
  api.post<ApiEnvelope<{ id: string; public_slug: string }>>('/admin/learning/assessments', {
    title: payload.title,
    titleHi: payload.titleHi,
    summary: payload.summary || null,
    assessmentType: 'DIAGNOSTIC',
    visibility: 'REGISTERED',
    reviewStatus: 'DRAFT',
    classMin: payload.classNumber,
    classMax: payload.classNumber,
    timeLimitMins: payload.timeLimitMins ?? 8,
    passingPct: payload.passingPct ?? 60,
    maxAttempts: null,
    shuffleQuestions: true,
    isFeaturedPublic: false,
    boardCodes: ['COMMON'],
    questionIds: payload.questionIds,
    conceptIds: [payload.conceptId],
  });

export const getConceptPrerequisites = (conceptId: string) =>
  api.get<ApiEnvelope<DiagnosticPrerequisiteResponse>>(`/admin/learning/concepts/${conceptId}/prerequisites`);

export const replaceConceptPrerequisites = (
  conceptId: string,
  prerequisites: Array<{ conceptId: string; strength: 'HELPFUL' | 'REQUIRED'; rationale?: string | null }>,
) => api.put<ApiEnvelope<DiagnosticPrerequisiteResponse>>(`/admin/learning/concepts/${conceptId}/prerequisites`, { prerequisites });
