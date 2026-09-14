import api from './api';
import type { ApiEnvelope } from '@/types/api';

export interface FactoryBoardOption {
  id: string;
  code: string;
  name: string;
  short_name?: string | null;
  board_type: string;
  state?: string | null;
  sort_order: number;
}

export interface FactorySubjectOption {
  id: string;
  code?: string | null;
  name: string;
}

export interface FactoryCurriculumSubjectOption {
  id: string;
  curriculum_version_id: string;
  board_id: string;
  board_code: string;
  board_name: string;
  subject_id?: string | null;
  class_name: string;
  display_name: string;
  display_name_hi?: string | null;
  subject_code?: string | null;
  sort_order: number;
}

export interface FactoryCurriculumUnitOption {
  id: string;
  curriculum_subject_id: string;
  unit_number?: string | null;
  title: string;
  title_hi?: string | null;
  description?: string | null;
  sort_order: number;
}

export interface FactoryCurriculumTopicOption {
  id: string;
  curriculum_unit_id: string;
  topic_number?: string | null;
  title: string;
  title_hi?: string | null;
  learning_outcome?: string | null;
  competency_tags: string[];
  sort_order: number;
}

export interface FactoryConceptOption {
  id: string;
  code: string;
  name: string;
  name_hi?: string | null;
  chapter_title?: string | null;
  subject_code: string;
  subject_id?: string | null;
  subject_name?: string | null;
  grade_code: string;
  class_number?: number | null;
}

export interface FactoryReadiness {
  classNumber: number;
  conceptCount: number;
  subjectCount: number;
  curriculumReady: boolean;
}

export interface ContentFactoryOptions {
  boards: FactoryBoardOption[];
  subjects: FactorySubjectOption[];
  curriculumSubjects: FactoryCurriculumSubjectOption[];
  units: FactoryCurriculumUnitOption[];
  topics: FactoryCurriculumTopicOption[];
  concepts: FactoryConceptOption[];
  readinessByClass: FactoryReadiness[];
  workflow: Record<string,string>;
}

export interface ContentFactoryQueueCounts {
  sourceReviewPending: number;
  approvedSourcesReady: number;
  contentLibraryPending: number;
  sourceImportedPendingReview: number;
}

export interface FactorySourceReviewItem {
  id: string;
  source_item_id?: string | null;
  title: string;
  source_url: string;
  licence_candidate?: string | null;
  attribution_text?: string | null;
  class_hint?: string | null;
  board_hint?: string | null;
  subject_hint?: string | null;
  status: 'DISCOVERED' | 'LICENCE_REVIEW' | 'CONTENT_REVIEW' | 'APPROVED' | 'REJECTED' | 'IMPORTED';
  reviewer_note?: string | null;
  created_at: string;
  reviewed_at?: string | null;
  licence_verified_at?: string | null;
  licence_verified_by?: string | null;
  imported_resource_id?: string | null;
  imported_at?: string | null;
  imported_by?: string | null;
  source_code: string;
  source_name: string;
  attribution_required: boolean;
  requires_item_license_check: boolean;
  evidence_ready: boolean;
  media_kind?: 'ARTICLE' | 'VIDEO' | 'AUDIO' | 'INTERACTIVE' | 'PDF' | 'COURSE' | 'LINK' | null;
  duration_seconds?: number | null;
  thumbnail_url?: string | null;
  embed_url?: string | null;
}

export interface StageExternalWebSourcePayload {
  title: string;
  sourceUrl: string;
  licenceCandidate?: 'VIDYASETU_ORIGINAL' | 'CC_BY' | 'CC_BY_SA' | 'CC_BY_NC' | 'CC_BY_NC_SA' | 'CC_BY_NC_ND' | 'PUBLIC_DOMAIN' | 'EXTERNAL_LINK_ONLY' | 'OTHER' | null;
  attributionText?: string | null;
  classNumber?: number | null;
  subject?: string | null;
  boardCode?: string | null;
}

export interface StagedExternalWebSource {
  kind: 'OER_INTAKE';
  intakeId: string;
  status: string;
  sourceCode: 'EXTERNAL_WEB';
  sourceUrl: string;
  hostname: string;
  licenceCandidate: string;
  message: string;
}

export interface AddApprovedSourceToLibraryPayload {
  classNumber: number;
  boardCode: string;
  subjectId?: string | null;
  subjectName?: string | null;
  chapter?: string | null;
  topic?: string | null;
  language?: 'en' | 'hi' | 'en-hi';
  visibility: 'PUBLIC' | 'REGISTERED' | 'CLASS_ONLY';
  accessRequirement: 'PUBLIC' | 'REGISTERED' | 'SUBSCRIBER';
}

export interface AddedLearningResource {
  id: string;
  title: string;
  review_status: 'DRAFT';
  visibility: string;
  access_requirement: string;
  class_min: number;
  class_max: number;
  subject_id: string;
  subject_label: string;
  topic_label?: string | null;
  chapter_label?: string | null;
  alreadyImported: boolean;
  intakeId: string;
  sourceCode?: string;
  resourceType?: string;
  message?: string;
}

export const getContentFactoryOptions = () =>
  api.get<ApiEnvelope<ContentFactoryOptions>>('/admin/learning/factory/options');

export const getContentFactoryQueueCounts = () =>
  api.get<ApiEnvelope<ContentFactoryQueueCounts>>('/admin/learning/factory/queue-counts');

export const getContentFactorySourceReview = () =>
  api.get<ApiEnvelope<FactorySourceReviewItem[]>>('/admin/learning/factory/source-review');

export const stageExternalWebSource = (payload: StageExternalWebSourcePayload) =>
  api.post<ApiEnvelope<StagedExternalWebSource>>('/admin/learning/factory/external-web-source',payload);

export const addApprovedSourceToLibrary = (intakeId: string,payload: AddApprovedSourceToLibraryPayload) =>
  api.post<ApiEnvelope<AddedLearningResource>>(`/admin/learning/factory/intake/${intakeId}/add-to-library`,payload);
