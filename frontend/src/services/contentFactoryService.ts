import api from './api';
import type { ApiEnvelope } from '@/types/api';
import type { LearningJourneyStage } from './adminLearningService';

export interface ContentFactoryGrade {
  id: string;
  code: string;
  name: string;
  name_hi?: string | null;
  short_name: string;
  stage: string;
  class_number?: number | null;
  sort_order: number;
  target_count?: number;
  core_target_count?: number;
  target_ready_count?: number;
  concept_count?: number;
  bilingual_concept_count?: number;
  published_resource_count?: number;
  published_question_count?: number;
  published_assessment_count?: number;
}

export interface ContentFactorySummary {
  contentLanguages: Array<{ code: 'en' | 'hi'; name: string; nameHi: string }>;
  gradeCount: number;
  totals: { targets: number; concepts: number; bilingualConcepts: number; resources: number; questions: number; assessments: number };
  grades: ContentFactoryGrade[];
  policy: { bilingualPublicationRequired: boolean; canonicalGradeMappingRequired: boolean; academicTruthSource: string; contentTargetPurpose: string };
}

export interface ContentTarget {
  id: string;
  grade_id: string;
  grade_code: string;
  grade_name: string;
  grade_name_hi?: string | null;
  stage: string;
  subject_code: string;
  subject_name: string;
  subject_name_hi: string;
  area_type: string;
  priority: string;
  academic_year: string;
  board_code?: string | null;
  target_status: 'PLANNED' | 'REGISTRY_READY' | 'AUTHORING' | 'REVIEW_READY' | 'LEARNER_READY' | 'DEFERRED';
  expected_concepts?: number | null;
  source_reference?: string | null;
  notes?: string | null;
  registeredConcepts: number;
  learnerReadyConcepts: number;
  averageCompletenessScore: number;
  gap?: number | null;
}

export interface FactoryConcept {
  id: string;
  code: string;
  name: string;
  name_hi?: string | null;
  subject_code: string;
  chapter_code?: string | null;
  chapter_title?: string | null;
  learning_outcome?: string | null;
  learning_outcome_hi?: string | null;
  registry_status: string;
  sequence: number;
  readiness: { score: number; learnerReady: boolean; blockers: string[] };
}

export interface ContentFactoryGradeDetail {
  grade: ContentFactoryGrade;
  targets: ContentTarget[];
  concepts: FactoryConcept[];
  summary: { targetAreas: number; registeredConcepts: number; learnerReadyConcepts: number; bilingualConcepts: number; averageCompletenessScore: number };
}

export interface FactoryOptions {
  grades: ContentFactoryGrade[];
  boards: Array<{ code: string; name: string; short_name?: string | null; board_type: string; state?: string | null }>;
  sources: Array<{ code: string; name: string; source_kind: string; default_license: string; requires_item_license_check: boolean; allow_rehosting_default: boolean }>;
  contentLanguages: Array<'en' | 'hi'>;
}

export interface CreateFactoryResource {
  title: string;
  titleHi: string;
  summary: string;
  summaryHi: string;
  bodyMarkdown?: string | null;
  bodyMarkdownHi?: string | null;
  resourceType: 'ARTICLE' | 'VIDEO' | 'AUDIO' | 'PDF' | 'WORKSHEET' | 'QUIZ' | 'QUESTION_PAPER' | 'INTERACTIVE' | 'EXTERNAL_LINK' | 'STORY' | 'ACTIVITY' | 'FLASHCARD' | 'GAME' | 'SIMULATION' | 'PRACTICAL';
  category: 'ACADEMIC' | 'MOTIVATION' | 'STUDY_SKILLS' | 'WORK_ETHIC' | 'SOCIAL_RESPONSIBILITY' | 'LIFE_SKILLS' | 'WELLBEING' | 'CAREER_AWARENESS' | 'DIGITAL_CITIZENSHIP';
  visibility: 'PUBLIC' | 'REGISTERED' | 'CLASS_ONLY' | 'SCHOOL_ONLY';
  gradeCodes: string[];
  sourceCode: string;
  licence: string;
  boardCodes?: string[];
  sourceUrl?: string | null;
  attributionText?: string | null;
  externalUrl?: string | null;
  fileKey?: string | null;
  thumbnailUrl?: string | null;
  isOfflineReady?: boolean;
  publicSlug?: string | null;
  mediaReadiness?: 'NOT_STARTED' | 'SCRIPT_READY' | 'MEDIA_READY' | 'QA_APPROVED';
  transcript?: string | null;
  transcriptHi?: string | null;
  thumbnailAlt?: string | null;
  thumbnailAltHi?: string | null;
  conceptMappings?: Array<{ conceptId: string; journeyStage: LearningJourneyStage; isPrimary?: boolean; sortOrder?: number }>;
}

export interface CreateFactoryQuestion {
  publicCode?: string;
  prompt: string;
  promptHi: string;
  questionType: 'MCQ_SINGLE' | 'MCQ_MULTIPLE' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'NUMERIC';
  difficulty: 'FOUNDATION' | 'EASY' | 'MEDIUM' | 'HARD' | 'CHALLENGE';
  explanation: string;
  explanationHi: string;
  correctAnswer: unknown;
  marks?: number;
  negativeMarks?: number;
  gradeCodes: string[];
  sourceCode?: string;
  licence?: string;
  visibility?: 'PUBLIC' | 'REGISTERED' | 'CLASS_ONLY' | 'SCHOOL_ONLY';
  boardCodes?: string[];
  options?: Array<{ key: string; text: string; textHi: string }>;
  conceptIds?: string[];
  cognitiveSkill?: 'REMEMBER' | 'UNDERSTAND' | 'APPLY' | 'ANALYSE' | 'EVALUATE' | 'CREATE';
  skillCode?: string | null;
  learningOutcomeCode?: string | null;
  misconceptionCode?: string | null;
  misconceptionText?: string | null;
  misconceptionTextHi?: string | null;
}

export interface FactoryQuestion {
  id: string;
  public_code: string;
  prompt: string;
  prompt_hi?: string | null;
  question_type: string;
  difficulty: string;
  review_status: string;
  grade_codes: string[];
  board_codes: string[];
  option_count: number;
}

export interface CreateFactoryAssessment {
  publicSlug?: string | null;
  title: string;
  titleHi: string;
  summary: string;
  summaryHi: string;
  assessmentType: 'DIAGNOSTIC' | 'PRACTICE' | 'CHAPTER_TEST' | 'UNIT_TEST' | 'MOCK' | 'DAILY';
  visibility: 'PUBLIC' | 'REGISTERED' | 'CLASS_ONLY' | 'SCHOOL_ONLY';
  gradeCodes: string[];
  timeLimitMins?: number | null;
  passingPct?: number;
  maxAttempts?: number | null;
  shuffleQuestions?: boolean;
  isFeaturedPublic?: boolean;
  boardCodes?: string[];
  questionIds: string[];
  conceptIds?: string[];
}

export const getContentFactorySummary = () => api.get<ApiEnvelope<ContentFactorySummary>>('/admin/learning/factory');
export const getContentFactoryOptions = () => api.get<ApiEnvelope<FactoryOptions>>('/admin/learning/factory/options');
export const getContentFactoryGrade = (gradeCode: string) => api.get<ApiEnvelope<ContentFactoryGradeDetail>>(`/admin/learning/factory/grades/${encodeURIComponent(gradeCode)}`);
export const updateContentTarget = (targetId: string, payload: { targetStatus?: ContentTarget['target_status']; expectedConcepts?: number | null; sourceReference?: string | null; notes?: string | null }) => api.patch<ApiEnvelope<ContentTarget>>(`/admin/learning/factory/targets/${targetId}`, payload);
export const createFactoryResource = (payload: CreateFactoryResource) => api.post<ApiEnvelope<{ id: string }>>('/admin/learning/factory/resources', payload);
export const getFactoryQuestions = (gradeCode?: string) => api.get<ApiEnvelope<FactoryQuestion[]>>('/admin/learning/factory/questions', { params: gradeCode ? { grade: gradeCode } : undefined });
export const createFactoryQuestion = (payload: CreateFactoryQuestion) => api.post<ApiEnvelope<{ id: string; public_code: string; gradeCodes: string[] }>>('/admin/learning/factory/questions', payload);
export const getFactoryAssessments = (gradeCode?: string) => api.get<ApiEnvelope<unknown[]>>('/admin/learning/factory/assessments', { params: gradeCode ? { grade: gradeCode } : undefined });
export const createFactoryAssessment = (payload: CreateFactoryAssessment) => api.post<ApiEnvelope<{ id: string; public_slug: string; gradeCodes: string[] }>>('/admin/learning/factory/assessments', payload);
