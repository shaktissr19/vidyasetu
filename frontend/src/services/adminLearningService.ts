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

export interface LearningStudioOptions {
  boards: LearningStudioBoard[];
  sources: LearningStudioSource[];
}

export interface LearningStudioResource {
  id: string;
  public_slug?: string | null;
  title: string;
  title_hi?: string | null;
  summary?: string | null;
  resource_type: string;
  category: LearningCategory;
  visibility: string;
  review_status: string;
  language: string;
  class_min?: number | null;
  class_max?: number | null;
  licence: string;
  source_url?: string | null;
  external_url?: string | null;
  attribution_text?: string | null;
  is_featured_public: boolean;
  published_at?: string | null;
  created_at: string;
  source_code: string;
  source_name: string;
  board_codes: string[];
}

export interface SaveLearningStudioResource {
  title: string;
  titleHi?: string | null;
  summary?: string | null;
  summaryHi?: string | null;
  bodyMarkdown?: string | null;
  bodyMarkdownHi?: string | null;
  resourceType: 'ARTICLE' | 'VIDEO' | 'AUDIO' | 'PDF' | 'WORKSHEET' | 'QUIZ' | 'QUESTION_PAPER' | 'INTERACTIVE' | 'EXTERNAL_LINK';
  category: LearningCategory;
  visibility: 'PUBLIC' | 'REGISTERED' | 'CLASS_ONLY' | 'SCHOOL_ONLY';
  reviewStatus?: 'DRAFT' | 'SUBMITTED' | 'ACADEMIC_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
  language?: string;
  classMin?: number | null;
  classMax?: number | null;
  sourceCode: string;
  sourceUrl?: string | null;
  sourceItemId?: string | null;
  licence: 'VIDYASETU_ORIGINAL' | 'CC_BY' | 'CC_BY_SA' | 'CC_BY_NC_SA' | 'CC_BY_NC_ND' | 'PUBLIC_DOMAIN' | 'EXTERNAL_LINK_ONLY' | 'OTHER';
  licenceUrl?: string | null;
  attributionText?: string | null;
  externalUrl?: string | null;
  fileKey?: string | null;
  thumbnailUrl?: string | null;
  durationSecs?: number | null;
  isOfflineReady?: boolean;
  isFeaturedPublic?: boolean;
  boardCodes?: string[];
  publicSlug?: string | null;
}

export const getLearningStudioOptions = () =>
  api.get<ApiEnvelope<LearningStudioOptions>>('/admin/learning/options');

export const getLearningStudioResources = () =>
  api.get<ApiEnvelope<LearningStudioResource[]>>('/admin/learning/resources');

export const createLearningStudioResource = (payload: SaveLearningStudioResource) =>
  api.post<ApiEnvelope<{ id: string }>>('/admin/learning/resources', payload);

export const updateLearningStudioStatus = (resourceId: string, status: string, note?: string) =>
  api.patch<ApiEnvelope<LearningStudioResource>>(`/admin/learning/resources/${resourceId}/status`, { status, note });
