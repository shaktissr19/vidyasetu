import api from './api';
import type {
  ApiEnvelope,
  CompetitionExam,
  CompetitionLeaderboardRow,
  ExamAttempt,
  ExamAttemptResult,
} from '@/types/api';

type Payload = Record<string, unknown>;

export interface CompetitionExamV2 extends CompetitionExam {
  public_slug?: string | null;
  title_hi?: string | null;
  subtitle?: string | null;
  subtitle_hi?: string | null;
  description?: string | null;
  competition_format?: 'OLYMPIAD' | 'CHALLENGE' | 'SPRINT' | 'WEEKLY_QUIZ' | string;
  subject_codes?: string[] | null;
  registration_start?: string | null;
  registration_end?: string | null;
  results_at?: string | null;
  marks_per_question?: string | number | null;
  negative_marks?: string | number | null;
  registration_id?: string | null;
  registered_at?: string | null;
  attempt_status?: string | null;
  submitted_at?: string | null;
  total_marks?: string | number | null;
  percentile?: string | number | null;
  rank_school?: string | number | null;
  rank_overall?: string | number | null;
  participant_count?: string | number | null;
  certificate_code?: string | null;
  certificate_enabled?: boolean;
  learning_feedback_enabled?: boolean;
}

export interface CompetitionLeaderboardRowV2 extends CompetitionLeaderboardRow {
  name?: string | null;
  rank_school?: number | null;
  percentile?: string | number | null;
  class_name?: string | null;
  state?: string | null;
}

export interface CompetitionReadiness {
  ready: boolean;
  blockers: string[];
  totalQuestions: number;
  bilingualQuestions: number;
  conceptMappedQuestions: number;
  governedQuestions: number;
}

export interface CompetitionResponseInput {
  questionId: string;
  selectedOption?: string | null;
}

export interface CompetitionSubmitResult extends ExamAttemptResult {
  examId: string;
  examType: string;
  released: boolean;
  timeTakenSecs: number;
  integrityStatus?: 'CLEAN' | 'FLAGGED';
  message?: string;
}

export interface CompetitionConceptFeedback {
  concept_id: string;
  code: string;
  name: string;
  name_hi?: string | null;
  question_count: number;
  correct_count: number;
  wrong_count: number;
  skipped_count: number;
  accuracy_pct: number;
  needs_review: boolean;
  recommended_resource_slug?: string | null;
  recommended_resource_title?: string | null;
}

export interface CompetitionQuestionReview {
  id: string;
  question_text: string;
  question_hi?: string | null;
  selected_option?: string | null;
  correct_option: string;
  is_correct?: boolean | null;
  explanation?: string | null;
  explanation_hi?: string | null;
  concept_code?: string | null;
  concept_name?: string | null;
}

export interface CompetitionOfficialResult {
  released: boolean;
  attemptId: string;
  examId: string;
  status?: string;
  message?: string;
  title?: string;
  titleHi?: string | null;
  score?: number;
  maxMarks?: number;
  correctCount?: number;
  wrongCount?: number;
  skippedCount?: number;
  timeTakenSecs?: number;
  percentile?: number | null;
  rankSchool?: number | null;
  rankOverall?: number | null;
  integrityStatus?: 'CLEAN' | 'FLAGGED';
  certificateCode?: string | null;
  conceptFeedback?: CompetitionConceptFeedback[];
  questionReview?: CompetitionQuestionReview[];
}

export const listCompetitions = () => api.get<ApiEnvelope<CompetitionExamV2[]>>('/competition');
export const listMyExams = () => api.get<ApiEnvelope<CompetitionExamV2[]>>('/competition/mine/list');
export const registerExam = (examId: string) => api.post<ApiEnvelope<{ examId?: string; registered?: boolean; registrationId?: string }>>(`/competition/${examId}/register`);
export const startAttempt = (examId: string) => api.post<ApiEnvelope<ExamAttempt>>(`/competition/${examId}/start`);
export const submitAttempt = (attemptId: string, responses: readonly CompetitionResponseInput[]) =>
  api.post<ApiEnvelope<CompetitionSubmitResult>>(`/competition/attempts/${attemptId}/submit`, { responses });
export const getCompetitionResult = (attemptId: string) => api.get<ApiEnvelope<CompetitionOfficialResult>>(`/competition/attempts/${attemptId}/result`);
export const getLeaderboard = (examId: string, page = 1) => api.get<ApiEnvelope<CompetitionLeaderboardRowV2[]>>(`/competition/${examId}/leaderboard?page=${page}`);
export const createExam = (data: Payload) => api.post<ApiEnvelope<CompetitionExamV2>>('/competition', data);
export const addQuestions = (examId: string, questions: readonly Payload[]) => api.post<ApiEnvelope<CompetitionExamV2>>(`/competition/${examId}/questions`, { questions });
export const importCompetitionLearningQuestions = (examId: string, questionIds: readonly string[]) =>
  api.post<ApiEnvelope<{ imported: number; totalQuestions: number }>>(`/competition/${examId}/questions/from-learning`, { questionIds });
export const getCompetitionReadiness = (examId: string) => api.get<ApiEnvelope<CompetitionReadiness>>(`/competition/${examId}/readiness`);
export const updateExamStatus = (examId: string, status: string) => api.patch<ApiEnvelope<CompetitionExamV2>>(`/competition/${examId}/status`, { status });
