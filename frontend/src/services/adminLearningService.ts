import api from './api';
import type { ApiEnvelope } from '@/types/api';
import type { LearningCategory } from './publicService';

export interface LearningStudioBoard {
  code: string;
  name: string;
  short_name?: string | null;
  board_type: string;
  state?: string | null;
}

export interface LearningStudioSource {
  code: string;
  name: string;
  source_kind: string;
  homepage_url?: string | null;
  default_license: string;
  attribution_required: boolean;
  allow_rehosting_default: boolean;
  allow_adaptation_default: boolean;
  requires_item_license_check: boolean;
  notes?: string | null;
}

export interface LearningStudioOptions { boards: LearningStudioBoard[]; sources: LearningStudioSource[]; }

export interface LearningStudioResource {
  id: string; public_slug?: string | null; title: string; title_hi?: string | null; summary?: string | null;
  resource_type: string; category: LearningCategory; visibility: string; review_status: string; language: string;
  class_min?: number | null; class_max?: number | null; licence: string; source_url?: string | null;
  external_url?: string | null; attribution_text?: string | null; is_featured_public: boolean;
  published_at?: string | null; created_at: string; source_code: string; source_name: string; board_codes: string[];
}

export interface SaveLearningStudioResource {
  title: string; titleHi?: string | null; summary?: string | null; summaryHi?: string | null;
  bodyMarkdown?: string | null; bodyMarkdownHi?: string | null;
  resourceType: 'ARTICLE' | 'VIDEO' | 'AUDIO' | 'PDF' | 'WORKSHEET' | 'QUIZ' | 'QUESTION_PAPER' | 'INTERACTIVE' | 'EXTERNAL_LINK';
  category: LearningCategory; visibility: 'PUBLIC' | 'REGISTERED' | 'CLASS_ONLY' | 'SCHOOL_ONLY';
  reviewStatus?: 'DRAFT' | 'SUBMITTED' | 'ACADEMIC_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
  language?: string; classMin?: number | null; classMax?: number | null; sourceCode: string;
  sourceUrl?: string | null; sourceItemId?: string | null;
  licence: 'VIDYASETU_ORIGINAL' | 'CC_BY' | 'CC_BY_SA' | 'CC_BY_NC_SA' | 'CC_BY_NC_ND' | 'PUBLIC_DOMAIN' | 'EXTERNAL_LINK_ONLY' | 'OTHER';
  licenceUrl?: string | null; attributionText?: string | null; externalUrl?: string | null; fileKey?: string | null;
  thumbnailUrl?: string | null; durationSecs?: number | null; isOfflineReady?: boolean; isFeaturedPublic?: boolean;
  boardCodes?: string[]; publicSlug?: string | null;
}

export interface LearningStudioQuestion {
  id: string; public_code: string; prompt: string; prompt_hi?: string | null; question_type: string; difficulty: string; marks: number;
  negative_marks: number; explanation?: string | null; explanation_hi?: string | null;
  class_min?: number | null; class_max?: number | null; visibility: string; review_status: string;
  subject_name?: string | null; source_code: string; board_codes: string[]; option_count: number; missing_hindi_option_count: number;
}

export interface SaveLearningStudioQuestion {
  publicCode?: string; prompt: string; promptHi?: string | null;
  questionType: 'MCQ_SINGLE' | 'MCQ_MULTIPLE' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'NUMERIC';
  difficulty: 'FOUNDATION' | 'EASY' | 'MEDIUM' | 'HARD' | 'CHALLENGE';
  explanation?: string | null; explanationHi?: string | null; correctAnswer: unknown; marks?: number; negativeMarks?: number;
  classMin?: number | null; classMax?: number | null; subjectId?: string | null; sourceCode?: string;
  sourceUrl?: string | null; licence?: string; attributionText?: string | null;
  visibility?: 'PUBLIC' | 'REGISTERED' | 'CLASS_ONLY' | 'SCHOOL_ONLY';
  reviewStatus?: 'DRAFT' | 'SUBMITTED' | 'ACADEMIC_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
  boardCodes?: string[]; options?: Array<{ key: string; text: string; textHi?: string | null }>;
}

export interface LearningStudioAssessment {
  id: string; public_slug?: string | null; title: string; summary?: string | null; assessment_type: string;
  visibility: string; review_status: string; class_min?: number | null; class_max?: number | null;
  time_limit_mins?: number | null; passing_pct: number; max_attempts?: number | null; is_featured_public: boolean;
  subject_name?: string | null; question_count: number; published_question_count: number; total_marks: number; board_codes: string[];
}

export interface SaveLearningStudioAssessment {
  publicSlug?: string | null; title: string; titleHi?: string | null; summary?: string | null;
  assessmentType: 'PRACTICE' | 'CHAPTER_TEST' | 'UNIT_TEST' | 'MOCK' | 'DAILY';
  visibility: 'PUBLIC' | 'REGISTERED' | 'CLASS_ONLY' | 'SCHOOL_ONLY';
  reviewStatus?: 'DRAFT' | 'SUBMITTED' | 'ACADEMIC_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
  classMin?: number | null; classMax?: number | null; subjectId?: string | null; timeLimitMins?: number | null;
  passingPct?: number; maxAttempts?: number | null; shuffleQuestions?: boolean; isFeaturedPublic?: boolean;
  boardCodes?: string[]; questionIds: string[];
}

export interface LearningStudioIntake {
  id: string; source_item_id?: string | null; title: string; source_url: string; licence_candidate?: string | null;
  attribution_text?: string | null; class_hint?: string | null; board_hint?: string | null; subject_hint?: string | null;
  status: string; reviewer_note?: string | null; created_at: string; reviewed_at?: string | null; source_code: string; source_name: string;
}

export interface SaveLearningStudioIntake {
  sourceCode: string; sourceItemId?: string | null; title: string; sourceUrl: string; licenceCandidate?: string | null;
  attributionText?: string | null; classHint?: string | null; boardHint?: string | null; subjectHint?: string | null;
}

export interface LearningImportGrade {
  id: string;
  code: string;
  name: string;
  short_name: string;
  stage: string;
  class_number?: number | null;
  sort_order: number;
}

export interface LearningImportOptions {
  grades: LearningImportGrade[];
  boards: LearningStudioBoard[];
  sources: Array<Pick<LearningStudioSource, 'code' | 'name' | 'source_kind' | 'default_license' | 'requires_item_license_check'>>;
}

export interface LearningImportRow {
  id: string;
  row_number: number;
  record_type: 'RESOURCE' | 'QUESTION';
  normalized_payload: Record<string, unknown>;
  validation_status: 'VALID' | 'INVALID';
  errors: string[];
  warnings: string[];
  imported_resource_id?: string | null;
  imported_question_id?: string | null;
}

export interface LearningImportBatch {
  id: string;
  source_filename: string;
  import_format: 'CSV' | 'JSON';
  status: 'STAGED' | 'VALIDATED' | 'IMPORTING' | 'COMPLETED' | 'FAILED';
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  imported_rows: number;
  summary?: Record<string, unknown>;
  created_at: string;
  validated_at?: string | null;
  completed_at?: string | null;
  created_by_name?: string | null;
  rows?: LearningImportRow[];
}

export const getLearningStudioOptions = () => api.get<ApiEnvelope<LearningStudioOptions>>('/admin/learning/options');
export const getLearningStudioResources = () => api.get<ApiEnvelope<LearningStudioResource[]>>('/admin/learning/resources');
export const createLearningStudioResource = (payload: SaveLearningStudioResource) => api.post<ApiEnvelope<{ id: string }>>('/admin/learning/resources', payload);
export const updateLearningStudioStatus = (resourceId: string, status: string, note?: string) => api.patch<ApiEnvelope<LearningStudioResource>>(`/admin/learning/resources/${resourceId}/status`, { status, note });

export const getLearningStudioQuestions = () => api.get<ApiEnvelope<LearningStudioQuestion[]>>('/admin/learning/questions');
export const createLearningStudioQuestion = (payload: SaveLearningStudioQuestion) => api.post<ApiEnvelope<{ id: string; public_code: string }>>('/admin/learning/questions', payload);
export const updateLearningStudioQuestionStatus = (questionId: string, status: string) => api.patch<ApiEnvelope<LearningStudioQuestion>>(`/admin/learning/questions/${questionId}/status`, { status });
export const getLearningStudioAssessments = () => api.get<ApiEnvelope<LearningStudioAssessment[]>>('/admin/learning/assessments');
export const createLearningStudioAssessment = (payload: SaveLearningStudioAssessment) => api.post<ApiEnvelope<{ id: string; public_slug: string }>>('/admin/learning/assessments', payload);
export const updateLearningStudioAssessmentStatus = (assessmentId: string, status: string) => api.patch<ApiEnvelope<LearningStudioAssessment>>(`/admin/learning/assessments/${assessmentId}/status`, { status });
export const getLearningStudioIntake = () => api.get<ApiEnvelope<LearningStudioIntake[]>>('/admin/learning/intake');
export const createLearningStudioIntake = (payload: SaveLearningStudioIntake) => api.post<ApiEnvelope<{ id: string; title: string; status: string }>>('/admin/learning/intake', payload);
export const updateLearningStudioIntakeStatus = (intakeId: string, status: string, note?: string) => api.patch<ApiEnvelope<LearningStudioIntake>>(`/admin/learning/intake/${intakeId}/status`, { status, note });

export const getLearningImportOptions = () => api.get<ApiEnvelope<LearningImportOptions>>('/admin/learning/imports/options');
export const getLearningImportBatches = () => api.get<ApiEnvelope<LearningImportBatch[]>>('/admin/learning/imports');
export const getLearningImportBatch = (batchId: string) => api.get<ApiEnvelope<LearningImportBatch>>(`/admin/learning/imports/${batchId}`);
export const stageLearningImport = (file: File) => {
  const data = new FormData();
  data.append('file', file);
  return api.post<ApiEnvelope<LearningImportBatch>>('/admin/learning/imports/stage', data, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const commitLearningImport = (batchId: string) => api.post<ApiEnvelope<LearningImportBatch>>(`/admin/learning/imports/${batchId}/commit`);
export const learningImportTemplateUrl = (format: 'csv' | 'json', sample: 'BLANK' | 'EARLY_YEARS' | 'CLASS_5' | 'CLASS_8' = 'BLANK') =>
  `/api/v1/admin/learning/imports/template?format=${encodeURIComponent(format)}&sample=${encodeURIComponent(sample)}`;