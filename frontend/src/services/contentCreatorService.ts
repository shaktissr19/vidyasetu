import api from './api';
import type { ApiEnvelope } from '@/types/api';
import type { LearningAccessRequirement, LearningVisibility } from './adminLearningService';

export type CreatorMode = 'CURRICULUM' | 'SOURCES' | 'IMPROVE_EXISTING';
export type CreatorLanguageMode = 'ENGLISH' | 'HINDI' | 'BILINGUAL';
export type CreatorSourceRole = 'GROUNDING' | 'REFERENCE_ONLY';
export type CreatorJobStatus =
  | 'DRAFT' | 'READY_TO_GENERATE' | 'GENERATING' | 'GENERATED' | 'VALIDATION_FAILED'
  | 'READY_FOR_REVIEW' | 'APPROVED' | 'REJECTED' | 'MATERIALISED' | 'FAILED' | 'CANCELLED';

export interface CreatorProviderStatus {
  name: string;
  model: string;
  configured: boolean;
}

export interface CreatorConceptOption {
  id: string;
  code: string;
  name: string;
  name_hi?: string | null;
  chapter_title?: string | null;
  subject_code: string;
  subject_name?: string | null;
  grade_code: string;
  class_number?: number | null;
}

export interface CreatorResourceOption {
  id: string;
  title: string;
  title_hi?: string | null;
  review_status: string;
  licence: string;
  source_code: string;
}

export interface CreatorIntakeOption {
  id: string;
  title: string;
  source_url: string;
  licence_candidate?: string | null;
  attribution_text?: string | null;
  source_code: string;
}

export interface CreatorSourceRegistryOption {
  code: string;
  name: string;
  source_kind: string;
  homepage_url?: string | null;
  default_license: string;
  attribution_required: boolean;
  allow_adaptation_default: boolean;
  requires_item_license_check: boolean;
}

export interface CreatorOptions {
  concepts: CreatorConceptOption[];
  resources: CreatorResourceOption[];
  intake: CreatorIntakeOption[];
  sources: CreatorSourceRegistryOption[];
  provider: CreatorProviderStatus;
}

export interface CreatorPackRequest {
  lesson: boolean;
  revision: boolean;
  activities: boolean;
  questions: boolean;
  assessment: boolean;
  questionCount: number;
}

export interface CreatorSourceInput {
  sourceRole?: CreatorSourceRole;
  sourceCode?: string;
  title?: string;
  sourceUrl?: string | null;
  resourceId?: string | null;
  intakeId?: string | null;
  licence?: string | null;
  licenceUrl?: string | null;
  attributionText?: string | null;
  excerpt?: string | null;
}

export interface CreateCreatorJobPayload {
  mode: CreatorMode;
  title: string;
  instructions?: string | null;
  conceptId?: string | null;
  existingResourceId?: string | null;
  classNumber?: number | null;
  subjectId?: string | null;
  boardCodes?: string[];
  languageMode: CreatorLanguageMode;
  visibility: LearningVisibility;
  accessRequirement: LearningAccessRequirement;
  requestedPack: CreatorPackRequest;
  sources?: CreatorSourceInput[];
}

export interface CreatorValidationCheck {
  code: string;
  passed: boolean;
  message: string;
}

export interface CreatorValidationReport {
  score: number;
  passed: boolean;
  checks: CreatorValidationCheck[];
  blockers: string[];
}

export interface CreatorGeneratedQuestion {
  prompt: string;
  promptHi?: string | null;
  questionType: string;
  difficulty: string;
  options?: Array<{ key: string; text: string; textHi?: string | null }>;
  correctAnswer: unknown;
  explanation?: string | null;
  explanationHi?: string | null;
}

export interface CreatorGeneratedPack {
  title: string;
  titleHi?: string | null;
  summary: string;
  summaryHi?: string | null;
  lessonMarkdown: string;
  lessonMarkdownHi?: string | null;
  learningObjectives: string[];
  keyPoints: string[];
  examples: string[];
  activities: string[];
  revisionNotes: string[];
  questions: CreatorGeneratedQuestion[];
  assessmentTitle?: string | null;
  citations: Array<{ sourceId: string; usedFor: string }>;
}

export interface CreatorJobListItem {
  id: string;
  mode: CreatorMode;
  title: string;
  status: CreatorJobStatus;
  language_mode: CreatorLanguageMode;
  visibility: LearningVisibility;
  access_requirement: LearningAccessRequirement;
  provider?: string | null;
  provider_model?: string | null;
  source_count: number;
  concept_name?: string | null;
  existing_resource_title?: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
  generated_at?: string | null;
  reviewed_at?: string | null;
  materialised_at?: string | null;
}

export interface CreatorJobDetail extends CreatorJobListItem {
  instructions?: string | null;
  concept_id?: string | null;
  existing_resource_id?: string | null;
  class_number?: number | null;
  subject_id?: string | null;
  board_codes: string[];
  requested_pack: CreatorPackRequest;
  generated_pack?: CreatorGeneratedPack | null;
  validation_report?: CreatorValidationReport | null;
  error_message?: string | null;
  review_note?: string | null;
  sources: Array<{
    id: string;
    source_role: CreatorSourceRole;
    source_code: string;
    title: string;
    source_url?: string | null;
    resource_id?: string | null;
    intake_id?: string | null;
    licence: string;
    licence_url?: string | null;
    attribution_text?: string | null;
    allow_adaptation: boolean;
    allow_commercial: boolean;
    verified_for_use: boolean;
    created_at: string;
  }>;
  outputs: Array<{
    id: string;
    output_type: 'RESOURCE' | 'QUESTION' | 'ASSESSMENT';
    output_key: string;
    resource_id?: string | null;
    question_id?: string | null;
    assessment_id?: string | null;
    created_at: string;
  }>;
}

export interface CreatorMaterialiseResult {
  resourceId: string;
  questionIds: string[];
  assessmentId?: string | null;
  status: 'MATERIALISED';
}

export const getContentCreatorOptions = () => api.get<ApiEnvelope<CreatorOptions>>('/admin/learning/creator/options');
export const getContentCreatorJobs = () => api.get<ApiEnvelope<CreatorJobListItem[]>>('/admin/learning/creator/jobs');
export const getContentCreatorJob = (jobId: string) => api.get<ApiEnvelope<CreatorJobDetail>>(`/admin/learning/creator/jobs/${jobId}`);
export const createContentCreatorJob = (payload: CreateCreatorJobPayload) => api.post<ApiEnvelope<{ id: string; status: CreatorJobStatus }>>('/admin/learning/creator/jobs', payload);
export const generateContentCreatorJob = (jobId: string) => api.post<ApiEnvelope<{ id: string; status: CreatorJobStatus; validation_report?: CreatorValidationReport }>>(`/admin/learning/creator/jobs/${jobId}/generate`);
export const reviewContentCreatorJob = (jobId: string, decision: 'APPROVE' | 'REJECT', note?: string | null) =>
  api.post<ApiEnvelope<{ id: string; status: CreatorJobStatus; review_note?: string | null }>>(`/admin/learning/creator/jobs/${jobId}/review`, { decision, note });
export const materialiseContentCreatorJob = (jobId: string) => api.post<ApiEnvelope<CreatorMaterialiseResult>>(`/admin/learning/creator/jobs/${jobId}/materialise`);
