import api from './api';
import type {
  ApiEnvelope,
  ContentChapter,
  ContentItem,
  ContentSubject,
  QuizQuestion,
  QuizResult,
} from '@/types/api';

export interface QuizAnswerInput {
  questionId: string;
  selectedOption?: string | null;
}

export const getSubjects = (className: string | number) =>
  api.get<ApiEnvelope<ContentSubject[]>>(`/content/subjects?class=${className}`);
export const getChapters = (subjectId: string, className: string | number) =>
  api.get<ApiEnvelope<ContentChapter[]>>(`/content/subjects/${subjectId}/chapters?class=${className}`);
export const getContentItems = (chapterId: string, lang?: string) =>
  api.get<ApiEnvelope<ContentItem[]>>(`/content/chapters/${chapterId}/items?lang=${lang || 'hi'}`);
export const getContentUrl = (itemId: string) => api.get<ApiEnvelope<{ url?: string; file_url?: string; type?: string; ttl?: number }>>(`/content/items/${itemId}/url`);
export const markComplete = (itemId: string) => api.post<ApiEnvelope<{ completed?: boolean }>>(`/content/items/${itemId}/complete`);
export const getQuiz = (itemId: string) => api.get<ApiEnvelope<QuizQuestion[]>>(`/content/items/${itemId}/quiz`);
export const submitQuiz = (itemId: string, answers: QuizAnswerInput[]) =>
  api.post<ApiEnvelope<QuizResult>>(`/content/items/${itemId}/quiz/submit`, { answers });
export const downloadOffline = (itemId: string) => api.post<ApiEnvelope<{ url?: string; ttl?: number }>>(`/content/items/${itemId}/download`);
