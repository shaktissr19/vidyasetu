import api from './api';

export type QuizAnswers = Record<string, string | null | undefined>;

export const getSubjects = (className: string | number) =>
  api.get(`/content/subjects?class=${className}`);
export const getChapters = (subjectId: string, className: string | number) =>
  api.get(`/content/subjects/${subjectId}/chapters?class=${className}`);
export const getContentItems = (chapterId: string, lang?: string) =>
  api.get(`/content/chapters/${chapterId}/items?lang=${lang || 'hi'}`);
export const getContentUrl = (itemId: string) => api.get(`/content/items/${itemId}/url`);
export const markComplete = (itemId: string) => api.post(`/content/items/${itemId}/complete`);
export const getQuiz = (itemId: string) => api.get(`/content/items/${itemId}/quiz`);
export const submitQuiz = (itemId: string, answers: QuizAnswers) =>
  api.post(`/content/items/${itemId}/quiz/submit`, { answers });
export const downloadOffline = (itemId: string) => api.post(`/content/items/${itemId}/download`);
