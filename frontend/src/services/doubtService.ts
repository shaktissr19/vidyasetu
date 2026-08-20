import api from './api';
import type { ApiEnvelope, Doubt, DoubtAnswer } from '@/types/api';

export type DoubtQueryParams = Record<string, string | number | boolean | null | undefined>;

export interface CreateDoubtPayload {
  title: string;
  body: string;
  subjectId?: string | null;
}

export interface AnswerDoubtPayload {
  body: string;
}

export const listDoubts = (params: DoubtQueryParams = {}) => api.get<ApiEnvelope<Doubt[]>>('/doubts', { params });
export const createDoubt = (payload: CreateDoubtPayload) => api.post<ApiEnvelope<Doubt>>('/doubts', payload);
export const getDoubt = (doubtId: string) => api.get<ApiEnvelope<Doubt>>(`/doubts/${doubtId}`);
export const answerDoubt = (doubtId: string, payload: AnswerDoubtPayload) => api.post<ApiEnvelope<DoubtAnswer>>(`/doubts/${doubtId}/answers`, payload);
export const toggleAnswerUpvote = (doubtId: string, answerId: string) => api.post<ApiEnvelope<{ upvoted?: boolean; upvotes?: number }>>(`/doubts/${doubtId}/answers/${answerId}/upvote`);
export const resolveDoubt = (doubtId: string, bestAnswerId: string) => api.patch<ApiEnvelope<Doubt>>(`/doubts/${doubtId}/resolve`, { bestAnswerId });
export const requestAIAnswer = (doubtId: string) => api.post<ApiEnvelope<DoubtAnswer>>(`/doubts/${doubtId}/ai-answer`);

export const upvoteAnswer = toggleAnswerUpvote;
export const aiAnswerDoubt = requestAIAnswer;
