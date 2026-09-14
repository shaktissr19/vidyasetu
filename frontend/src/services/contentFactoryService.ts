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

export const getContentFactoryOptions = () =>
  api.get<ApiEnvelope<ContentFactoryOptions>>('/admin/learning/factory/options');

export const stageExternalWebSource = (payload: StageExternalWebSourcePayload) =>
  api.post<ApiEnvelope<StagedExternalWebSource>>('/admin/learning/factory/external-web-source',payload);
