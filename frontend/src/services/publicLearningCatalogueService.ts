import api from './api';
import type { ApiEnvelope } from '@/types/api';
import type { PublicLearningResource } from './publicService';

export interface PublicLearningCatalogueFilters {
  class?: number;
  grade?: string;
  category?: string;
  board?: string;
  subject?: string;
  concept?: string;
  type?: string;
  lang?: 'en' | 'hi';
  stage?: string;
  q?: string;
  featured?: boolean;
  limit?: number;
}

export interface PublicLearningCatalogueResource extends PublicLearningResource {
  concept_codes?: string[];
  concept_names?: string[];
  journey_stages?: string[];
}

export interface PublicLearningFilterOptions {
  subjects: Array<{ code: string; name: string }>;
  concepts: Array<{ code: string; name: string; nameHi?: string | null; subjectCode?: string | null; chapterTitle?: string | null }>;
  resourceTypes: string[];
  journeyStages: string[];
  languages: Array<{ code: 'en' | 'hi'; name: string }>;
}

export const getPublicLearningCatalogue = (params?: PublicLearningCatalogueFilters, signal?: AbortSignal) =>
  api.get<ApiEnvelope<PublicLearningCatalogueResource[]>>('/public/learning/resources', { params, signal });

export const getPublicLearningFilterOptions = (signal?: AbortSignal) =>
  api.get<ApiEnvelope<PublicLearningFilterOptions>>('/public/learning/filter-options', { signal });
