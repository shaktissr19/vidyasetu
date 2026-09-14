import api from './api';
import type { ApiEnvelope } from '@/types/api';
import type { LearningAccessRequirement, LearningVisibility } from './adminLearningService';

export type CreatorMode = 'CURRICULUM' | 'SOURCES' | 'IMPROVE_EXISTING';
export type CreatorLanguageMode = 'ENGLISH' | 'HINDI' | 'BILINGUAL';
export type CreatorSourceRole = 'GROUNDING' | 'REFERENCE_ONLY';
export type CreatorJobStatus =
  | 'DRAFT' | 'READY_TO_GENERATE' | 'GENERATING' | 'GENERATED' | 'VALIDATION_FAILED'
  | 'READY_FOR_REVIEW' | 'APPROVED' | 'REJECTED' | 'MATERIALISED' | 'FAILED' | 'CANCELLED';
export type CreatorLearningTarget = 'PUBLIC_LEARNING' | 'PRIVATE_LEARNING';
export type CreatorDiscoveryProvider =
  | 'LOCAL' | 'DIKSHA' | 'NROER' | 'CBSE' | 'NCERT_EPATHSHALA'
  | 'NIOS' | 'SWAYAM' | 'PHET' | 'OER_COMMONS';
export type CreatorDiscoveryMediaKind = 'ARTICLE' | 'VIDEO' | 'AUDIO' | 'INTERACTIVE' | 'PDF' | 'COURSE' | 'LINK';
export type CreatorConnectorMode = 'LOCAL_CATALOGUE' | 'LIVE_API' | 'REFERENCE_SEARCH';

export interface CreatorProviderStatus {
  name: string;
  model: string;
  configured: boolean;
}

export interface CreatorDiscoveryCapability {
  code: CreatorDiscoveryProvider;
  label: string;
  enabled: boolean;
  requiresReview: boolean;
  connectorMode: CreatorConnectorMode;
  homepageUrl: string;
  supportsMediaKinds: CreatorDiscoveryMediaKind[];
  requiresApiKey: boolean;
  commercialPolicy: 'ALLOWED' | 'ITEM_LEVEL_REVIEW' | 'NON_COMMERCIAL_ONLY' | 'LINK_ONLY';
  licencePolicy: string;
  statusNote?: string | null;
}

export interface CreatorDiscoveryCapabilities {
  providers: CreatorDiscoveryCapability[];
  mediaKinds: Array<{ code: CreatorDiscoveryMediaKind; label: string }>;
  publisherPresets: string[];
  dikshaEndpoint: 'configured' | 'disabled';
  policy: string;
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
  discovery?: CreatorDiscoveryCapabilities;
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
  submitted_to_learning_at?: string | null;
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
  submitted_to_learning_by?: string | null;
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

export interface CreatorLearningSubmissionResult {
  jobId: string;
  target: CreatorLearningTarget;
  reviewStatus: 'SUBMITTED';
  visibility: LearningVisibility;
  accessRequirement: LearningAccessRequirement;
  resourceIds: string[];
  questionIds: string[];
  assessmentIds: string[];
  submittedAt: string;
  message: string;
}

export interface CreatorDiscoveryInput {
  provider?: CreatorDiscoveryProvider;
  providers?: CreatorDiscoveryProvider[];
  query: string;
  classNumber?: number | null;
  subject?: string | null;
  language?: string | null;
  publisher?: string | null;
  mediaKinds?: CreatorDiscoveryMediaKind[];
  maxDurationMinutes?: number | null;
  onlyCommercialSafe?: boolean;
  limit?: number;
}

export interface CreatorDiscoveryCandidate {
  id: string;
  run_id: string;
  provider: CreatorDiscoveryProvider;
  source_code: string;
  source_item_id: string;
  resource_id?: string | null;
  title: string;
  description?: string | null;
  source_url?: string | null;
  primary_category?: string | null;
  resource_type?: string | null;
  licence_candidate?: string | null;
  licence_raw?: string | null;
  attribution_text?: string | null;
  author_text?: string | null;
  publisher_text?: string | null;
  grade_levels: string[];
  subjects: string[];
  languages: string[];
  can_adapt: boolean;
  can_use_commercially: boolean;
  licence_verified: boolean;
  intake_id?: string | null;
  staged_at?: string | null;
  created_at: string;
  media_kind?: CreatorDiscoveryMediaKind | null;
  duration_seconds?: number | null;
  thumbnail_url?: string | null;
  embed_url?: string | null;
  reference_only: boolean;
  metadata?: Record<string, unknown>;
}

export interface CreatorDiscoveryRun {
  id: string;
  provider: CreatorDiscoveryProvider;
  query_text: string;
  class_number?: number | null;
  subject?: string | null;
  language?: string | null;
  filters?: Record<string, unknown>;
  status: string;
  result_count: number;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
  created_by_name?: string | null;
  candidates?: CreatorDiscoveryCandidate[];
}

export interface CreatorDiscoverySearchResult {
  runId?: string | null;
  runIds: string[];
  provider: CreatorDiscoveryProvider;
  providers: CreatorDiscoveryProvider[];
  count: number;
  candidates: CreatorDiscoveryCandidate[];
  runs: Array<{ runId: string; provider: CreatorDiscoveryProvider; count: number; status: 'COMPLETED' | 'FAILED'; error?: string }>;
  partial: boolean;
}

export interface CreatorDiscoveryStageResult {
  kind: 'GOVERNED_RESOURCE' | 'OER_INTAKE';
  resourceId?: string;
  intakeId?: string;
  status?: string;
  provider?: CreatorDiscoveryProvider;
  sourceCode?: string;
  alreadyStaged?: boolean;
  message?: string;
}

export interface CreatorSelectedExternalItemInput {
  provider: Exclude<CreatorDiscoveryProvider,'LOCAL'>;
  title: string;
  sourceUrl: string;
  licenceCandidate?: string | null;
  attributionText?: string | null;
  classHint?: string | null;
  subjectHint?: string | null;
}

export const getContentCreatorOptions = () => api.get<ApiEnvelope<CreatorOptions>>('/admin/learning/creator/options');
export const getContentCreatorJobs = () => api.get<ApiEnvelope<CreatorJobListItem[]>>('/admin/learning/creator/jobs');
export const getContentCreatorJob = (jobId: string) => api.get<ApiEnvelope<CreatorJobDetail>>(`/admin/learning/creator/jobs/${jobId}`);
export const createContentCreatorJob = (payload: CreateCreatorJobPayload) => api.post<ApiEnvelope<{ id: string; status: CreatorJobStatus }>>('/admin/learning/creator/jobs', payload);
export const generateContentCreatorJob = (jobId: string) => api.post<ApiEnvelope<{ id: string; status: CreatorJobStatus; validation_report?: CreatorValidationReport }>>(`/admin/learning/creator/jobs/${jobId}/generate`);
export const reviewContentCreatorJob = (jobId: string, decision: 'APPROVE' | 'REJECT', note?: string | null) =>
  api.post<ApiEnvelope<{ id: string; status: CreatorJobStatus; review_note?: string | null }>>(`/admin/learning/creator/jobs/${jobId}/review`, { decision, note });
export const materialiseContentCreatorJob = (jobId: string) => api.post<ApiEnvelope<CreatorMaterialiseResult>>(`/admin/learning/creator/jobs/${jobId}/materialise`);
export const submitContentCreatorJobToLearning = (jobId: string) => api.post<ApiEnvelope<CreatorLearningSubmissionResult>>(`/admin/learning/creator/jobs/${jobId}/submit-learning`);

export const discoverContentCreatorSources = (payload: CreatorDiscoveryInput) => api.post<ApiEnvelope<CreatorDiscoverySearchResult>>('/admin/learning/creator/discovery/search', payload);
export const getContentCreatorDiscoveryRuns = () => api.get<ApiEnvelope<CreatorDiscoveryRun[]>>('/admin/learning/creator/discovery/runs');
export const getContentCreatorDiscoveryRun = (runId: string) => api.get<ApiEnvelope<CreatorDiscoveryRun>>(`/admin/learning/creator/discovery/runs/${runId}`);
export const stageContentCreatorDiscoveryCandidate = (candidateId: string) => api.post<ApiEnvelope<CreatorDiscoveryStageResult>>(`/admin/learning/creator/discovery/candidates/${candidateId}/stage`);
export const stageSelectedExternalContentCreatorItem = (payload: CreatorSelectedExternalItemInput) => api.post<ApiEnvelope<CreatorDiscoveryStageResult>>('/admin/learning/creator/discovery/selected-item', payload);
export const updateContentCreatorIntakeEvidence = (intakeId: string, payload: { licenceCandidate: string; attributionText: string; reviewerNote?: string | null }) =>
  api.patch<ApiEnvelope<{ id: string; status: string }>>(`/admin/learning/creator/discovery/intake/${intakeId}/evidence`, payload);
