// services/doubtService.js
import api from './api';

export const listDoubts = (params = {}) => api.get('/doubts', { params });
export const createDoubt = (payload) => api.post('/doubts', payload);
export const getDoubt = (doubtId) => api.get(`/doubts/${doubtId}`);
export const answerDoubt = (doubtId, payload) => api.post(`/doubts/${doubtId}/answers`, payload);
export const toggleAnswerUpvote = (doubtId, answerId) => api.post(`/doubts/${doubtId}/answers/${answerId}/upvote`);
export const resolveDoubt = (doubtId, bestAnswerId) => api.patch(`/doubts/${doubtId}/resolve`, { bestAnswerId });
export const requestAIAnswer = (doubtId) => api.post(`/doubts/${doubtId}/ai-answer`);
