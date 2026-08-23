import api from './api';
import type { ApiEnvelope } from '@/types/api';

export interface PublicOverview {
  students: number;
  schools: number;
  teachers: number;
  parents: number;
  groups: number;
  competitions: number;
  generatedAt: string;
}

export interface PublicCompetition {
  id: string;
  title: string;
  title_hi?: string | null;
  description?: string | null;
  type: 'OLYMPIAD' | 'MOCK' | 'PRACTICE';
  status: 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED' | 'LIVE' | 'SCORING' | 'COMPLETED';
  class_names?: string[] | null;
  subject_codes?: string[] | null;
  total_questions?: number | null;
  duration_mins?: number | null;
  registration_start?: string | null;
  registration_end?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  results_at?: string | null;
  prize_pool?: number | string | null;
  banner_url?: string | null;
}

export interface PublicSchool {
  id: string;
  name: string;
  nameHi?: string | null;
  board?: string | null;
  city?: string | null;
  district?: string | null;
  state: string;
  academicYear: string;
  website?: string | null;
  isUdiseLinked: boolean;
  students: number;
  teachers: number;
  classes: number;
}

export type LearningCategory =
  | 'ACADEMIC'
  | 'MOTIVATION'
  | 'STUDY_SKILLS'
  | 'WORK_ETHIC'
  | 'SOCIAL_RESPONSIBILITY'
  | 'LIFE_SKILLS'
  | 'WELLBEING'
  | 'CAREER_AWARENESS'
  | 'DIGITAL_CITIZENSHIP';

export interface PublicLearningBoard {
  code: string;
  name: string;
  short_name?: string | null;
  board_type: 'COMMON' | 'NATIONAL' | 'STATE' | 'OTHER';
  state?: string | null;
}

export interface PublicLearningOverview {
  totalResources: number;
  originalResources: number;
  openResources: number;
  featuredResources: number;
  boards: PublicLearningBoard[];
  categories: Array<{ category: LearningCategory; count: number }>;
  classes: Array<{ className: number; resourceCount: number }>;
}

export interface PublicLearningResource {
  id: string;
  public_slug: string;
  title: string;
  title_hi?: string | null;
  summary?: string | null;
  summary_hi?: string | null;
  body_markdown?: string | null;
  body_markdown_hi?: string | null;
  resource_type: 'ARTICLE' | 'VIDEO' | 'AUDIO' | 'PDF' | 'WORKSHEET' | 'QUIZ' | 'QUESTION_PAPER' | 'INTERACTIVE' | 'EXTERNAL_LINK';
  category: LearningCategory;
  language: string;
  class_min?: number | null;
  class_max?: number | null;
  thumbnail_url?: string | null;
  duration_secs?: number | null;
  is_featured_public?: boolean;
  published_at?: string | null;
  external_url?: string | null;
  source_url?: string | null;
  source_code: string;
  source_name: string;
  source_kind: string;
  source_homepage?: string | null;
  licence: string;
  licence_url?: string | null;
  attribution_text?: string | null;
  board_codes?: string[];
  subject_name?: string | null;
  subject_code?: string | null;
  is_offline_ready?: boolean;
}

export interface PublicLearningSource {
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

export interface PublicLearningAssessment {
  id: string;
  public_slug: string;
  title: string;
  title_hi?: string | null;
  summary?: string | null;
  assessment_type: 'PRACTICE' | 'CHAPTER_TEST' | 'UNIT_TEST' | 'MOCK' | 'DAILY';
  class_min?: number | null;
  class_max?: number | null;
  time_limit_mins?: number | null;
  passing_pct: number;
  is_featured_public?: boolean;
  subject_name?: string | null;
  subject_code?: string | null;
  question_count: number;
  total_marks: number;
  board_codes: string[];
}

export interface PublicLearningQuestion {
  id: string;
  public_code: string;
  prompt: string;
  prompt_hi?: string | null;
  question_type: string;
  difficulty: string;
  marks: number;
  options: Array<{ key: string; text: string; textHi?: string | null }>;
}

export interface PublicLearningAssessmentDetail extends PublicLearningAssessment {
  questions: PublicLearningQuestion[];
  anonymousMode: boolean;
  message: string;
}

export const getPublicOverview = () => api.get<ApiEnvelope<PublicOverview>>('/public/overview');
export const getPublicCompetitions = () => api.get<ApiEnvelope<PublicCompetition[]>>('/competition');
export const getPublicSchools = () => api.get<ApiEnvelope<PublicSchool[]>>('/public/schools');
export const getPublicLearningOverview = () => api.get<ApiEnvelope<PublicLearningOverview>>('/public/learning/overview');
export const getPublicLearningResources = (params?: { class?: number; category?: LearningCategory | string; board?: string; featured?: boolean; limit?: number }) =>
  api.get<ApiEnvelope<PublicLearningResource[]>>('/public/learning/resources', { params });
export const getPublicLearningResource = (slug: string) => api.get<ApiEnvelope<PublicLearningResource>>(`/public/learning/resources/${encodeURIComponent(slug)}`);
export const getPublicLearningSources = () => api.get<ApiEnvelope<PublicLearningSource[]>>('/public/learning/sources');
export const getPublicLearningAssessments = (params?: { class?: number; board?: string; type?: string; limit?: number }) =>
  api.get<ApiEnvelope<PublicLearningAssessment[]>>('/public/learning/assessments', { params });
export const getPublicLearningAssessment = (slug: string) =>
  api.get<ApiEnvelope<PublicLearningAssessmentDetail>>(`/public/learning/assessments/${encodeURIComponent(slug)}`);
