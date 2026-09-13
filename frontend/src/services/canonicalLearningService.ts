import api from './api';
import type { ApiEnvelope } from '@/types/api';

export type LearningAccessTier = 'REGISTERED' | 'SUBSCRIBER' | 'SCHOOL_LICENSED';
export type LearningAccessRequirement = 'PUBLIC' | 'REGISTERED' | 'SUBSCRIBER';

export interface StudentLearningAccess {
  tier: LearningAccessTier;
  individualSubscriber: boolean;
  schoolLicensed: boolean;
  subscriberAccess: boolean;
}

export interface CanonicalLearningLearner {
  studentId: string;
  gradeCode: string;
  gradeLabel: string;
  className: number | string;
  schoolName?: string | null;
  boardCode: string;
  boardName: string;
}

export interface CanonicalLearningSubject {
  id: string;
  code: string;
  name: string;
  name_hi?: string | null;
  resource_count: number;
  accessible_resource_count: number;
  completed_resource_count: number;
  progress_pct: number;
}

export interface CanonicalLearningCatalogue {
  learner: CanonicalLearningLearner;
  access: StudentLearningAccess;
  subjects: CanonicalLearningSubject[];
}

export interface CanonicalLearningResourceSummary {
  id: string;
  public_slug?: string | null;
  title: string;
  title_hi?: string | null;
  summary?: string | null;
  summary_hi?: string | null;
  resource_type: string;
  category: string;
  visibility: string;
  access_requirement: LearningAccessRequirement;
  thumbnail_url?: string | null;
  duration_secs?: number | null;
  is_offline_ready: boolean;
  is_featured_public: boolean;
  source_code: string;
  source_name: string;
  progress_pct: number;
  is_completed: boolean;
  bookmarked: boolean;
  concept_names: string[];
  is_accessible: boolean;
  lock_reason?: string | null;
}

export interface CanonicalSubjectResources {
  subject: Pick<CanonicalLearningSubject, 'id' | 'code' | 'name' | 'name_hi'>;
  access: StudentLearningAccess;
  resources: CanonicalLearningResourceSummary[];
}

export interface CanonicalLearningResource extends CanonicalLearningResourceSummary {
  body_markdown?: string | null;
  body_markdown_hi?: string | null;
  language: string;
  class_min?: number | null;
  class_max?: number | null;
  external_url?: string | null;
  source_url?: string | null;
  file_key?: string | null;
  licence: string;
  licence_url?: string | null;
  attribution_text?: string | null;
  published_at?: string | null;
  subject_id?: string | null;
  subject_code?: string | null;
  subject_name?: string | null;
  concepts: Array<{
    id: string;
    code: string;
    name: string;
    nameHi?: string | null;
    journeyStage?: string | null;
  }>;
  access: StudentLearningAccess;
}

export const getCanonicalLearningCatalogue = () =>
  api.get<ApiEnvelope<CanonicalLearningCatalogue>>('/student/learning/catalogue');

export const getCanonicalSubjectResources = (subjectId: string) =>
  api.get<ApiEnvelope<CanonicalSubjectResources>>(`/student/learning/catalogue/subjects/${encodeURIComponent(subjectId)}`);

export const getCanonicalLearningResource = (resourceId: string) =>
  api.get<ApiEnvelope<CanonicalLearningResource>>(`/student/learning/resources/${encodeURIComponent(resourceId)}`);
