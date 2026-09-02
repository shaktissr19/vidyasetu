import api from './api';
import type { ApiEnvelope } from '@/types/api';

export interface PressureReviewOption {
  key: string;
  text: string;
  textHi?: string | null;
}

export interface PressureReviewQuestion {
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
  review_status: string;
  subject_label?: string | null;
  topic_label?: string | null;
  board_codes: string[];
  options: PressureReviewOption[];
}

export interface PressureReviewAssessment {
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

export interface PressureReviewPayload {
  manifest: {
    packId: string;
    version: string;
    status: string;
    subject: string;
    theme: string;
    concept: string;
    languages: string[];
    contentIdentity: string[];
    learningOutcomes: Array<{ id: string; en: string; hi: string }>;
    requiredReviews: string[];
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
  questions: PressureReviewQuestion[];
  assessments: PressureReviewAssessment[];
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
    implementationStatus: 'STAGED_DRAFT' | 'PRODUCTION_SCRIPT_READY' | 'MISSING';
  }>;
  completeness: {
    resourceCount: number;
    questionCount: number;
    assessmentCount: number;
    allBilingual: boolean;
    allDraft: boolean;
    mediaBinariesReady: boolean;
    note: string;
  };
}

export const getPressureReview = () =>
  api.get<ApiEnvelope<PressureReviewPayload>>('/admin/learning/review/pressure-v1');
