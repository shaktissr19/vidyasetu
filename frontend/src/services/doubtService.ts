import api from './api';
import type { ApiEnvelope, Doubt, DoubtAnswer } from '@/types/api';
import type { GroundedTutorConcept, GroundedTutorSource } from './aiService';
import type { AdaptiveLearningAction } from './studentService';

export type DoubtQueryParams = Record<string, string | number | boolean | null | undefined>;

export interface CreateDoubtPayload {
  title: string;
  body: string;
  subjectId?: string | null;
  subjectCode?: string | null;
}

export interface AnswerDoubtPayload {
  body: string;
}

export interface GroundedDoubtAIAnswer {
  answerId: string;
  answer: string;
  grounded: boolean;
  groundingStatus: 'GROUNDED' | 'GENERAL';
  concept?: GroundedTutorConcept | null;
  sources: GroundedTutorSource[];
  learnerState?: string | null;
  nextAction?: AdaptiveLearningAction | null;
  provider: string;
}

export const listDoubts = (params: DoubtQueryParams = {}) => api.get<ApiEnvelope<Doubt[]>>('/doubts', { params });
export const createDoubt = (payload: CreateDoubtPayload) => api.post<ApiEnvelope<Doubt>>('/doubts', payload);
export const getDoubt = (doubtId: string) => api.get<ApiEnvelope<Doubt>>(`/doubts/${doubtId}`);
export const answerDoubt = (doubtId: string, payload: AnswerDoubtPayload) => api.post<ApiEnvelope<DoubtAnswer>>(`/doubts/${doubtId}/answers`, payload);
export const toggleAnswerUpvote = (doubtId: string, answerId: string) => api.post<ApiEnvelope<{ upvoted?: boolean; upvotes?: number; upvoteCount?: number }>>(`/doubts/${doubtId}/answers/${answerId}/upvote`);
export const resolveDoubt = (doubtId: string, bestAnswerId: string) => api.patch<ApiEnvelope<Doubt>>(`/doubts/${doubtId}/resolve`, { bestAnswerId });
export const requestAIAnswer = (doubtId: string) => api.post<ApiEnvelope<GroundedDoubtAIAnswer>>(`/doubts/${doubtId}/ai-answer`);

export const upvoteAnswer = toggleAnswerUpvote;
export const aiAnswerDoubt = requestAIAnswer;
