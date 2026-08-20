import api from './api';

export type DoubtQueryParams = Record<string, string | number | boolean | null | undefined>;
type Payload = Record<string, unknown>;

export const listDoubts = (params: DoubtQueryParams = {}) => api.get('/doubts', { params });
export const createDoubt = (payload: Payload) => api.post('/doubts', payload);
export const getDoubt = (doubtId: string) => api.get(`/doubts/${doubtId}`);
export const answerDoubt = (doubtId: string, payload: Payload) => api.post(`/doubts/${doubtId}/answers`, payload);
export const toggleAnswerUpvote = (doubtId: string, answerId: string) => api.post(`/doubts/${doubtId}/answers/${answerId}/upvote`);
export const resolveDoubt = (doubtId: string, bestAnswerId: string) => api.patch(`/doubts/${doubtId}/resolve`, { bestAnswerId });
export const requestAIAnswer = (doubtId: string) => api.post(`/doubts/${doubtId}/ai-answer`);

export const upvoteAnswer = toggleAnswerUpvote;
export const aiAnswerDoubt = requestAIAnswer;
