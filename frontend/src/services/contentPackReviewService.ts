import api from './api';
import type { ApiEnvelope } from '@/types/api';

export interface ContentPackReviewOption {
  key: string;
  text: string;
  textHi?: string | null;
}

export interface ContentPackReviewQuestion {
  id: string;
  public_code: string;
  prompt: string;
  prompt_hi?: string | null;
  question_type: string;
  difficulty: string;
  explanation?: string | null;
  explanation_hi?: string | null;
  correct_answer: unknown;
  marks: number;
  negative_marks: number;
  review_status: string;
  subject_label?: string | null;
  topic_label?: string | null;
  board_codes: string[];
  options: ContentPackReviewOption[];
}

export interface ContentPackReviewAssessment {
  id: string;
  public_slug: string;
  title: string;
  title_hi?: string | null;
  summary?: string | null;
  summary_hi?: string | null;
  assessment_type: string;
  visibility: string;
  review_status: string;
  passing_pct: number;
  time_limit_mins?: number | null;
  board_codes: string[];
  questions: Array<{ publicCode: string; order: number }>;
}

export interface SupportedContentPack {
  key: string;
  folder: string;
  resourceSlug: string;
}

export interface ContentPackReviewPayload {
  packKey: string;
  supportedPacks: SupportedContentPack[];
  manifest: {
    packId: string;
    version: string;
    status: string;
    subject: string;
    theme: string;
    concept: string;
    languages: string[];
    contentIdentity: string[];
    learningOutcomes: Array<{ id?: string; en: string; hi: string }>;
    requiredReviews: string[];
    publicationPolicyDeclared: boolean;
  };
  resource: null | {
    id: string;
    public_slug: string;
    title: string;
    title_hi?: string | null;
    summary?: string | null;
    summary_hi?: string | null;
    body_markdown?: string | null;
    body_markdown_hi?: string | null;
    resource_type: string;
    category: string;
    visibility: string;
    review_status: string;
    class_min?: number | null;
    class_max?: number | null;
    subject_label?: string | null;
    topic_label?: string | null;
    source_code: string;
    licence: string;
    board_codes: string[];
  };
  questions: ContentPackReviewQuestion[];
  assessments: ContentPackReviewAssessment[];
  sequence: Array<{
    order: number;
    stage: string;
    assetId: string;
    type: string;
    titleEn: string;
    titleHi: string;
    durationSecs?: number;
    safetyLevel?: string;
    questionIds?: string[];
    implementationStatus: string;
  }>;
  completeness: {
    resourceCount: number;
    expectedResourceCount: number;
    questionCount: number;
    expectedQuestionCount: number;
    assessmentCount: number;
    expectedAssessmentCount: number;
    allBilingual: boolean;
    allDraft: boolean;
    noNegativeMarking: boolean;
    mediaBinariesReady: boolean;
    note: string;
  };
}

export const getContentPackReview = (packKey: string) =>
  api.get<ApiEnvelope<ContentPackReviewPayload>>(`/admin/learning/review/${encodeURIComponent(packKey)}`);

export const getSupportedContentPacks = () =>
  api.get<ApiEnvelope<SupportedContentPack[]>>('/admin/learning/review-packs');