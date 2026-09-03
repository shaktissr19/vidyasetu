import api from './api';
import type { ApiEnvelope } from '@/types/api';
import type { AdaptiveLearningAction, ConceptMasteryItem } from './studentService';

export interface AIChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface GroundedTutorSource {
  id: string;
  publicSlug?: string | null;
  title: string;
  titleHi?: string | null;
  summary?: string | null;
  resourceType: string;
  sourceName: string;
}

export interface GroundedTutorConcept {
  id: string;
  code: string;
  name: string;
  nameHi?: string | null;
  subjectCode: string;
  subjectName?: string | null;
  chapterTitle?: string | null;
  masteryState: ConceptMasteryItem['state'];
}

export interface GroundedTutorResponse {
  response: string;
  grounded: boolean;
  groundingStatus: 'GROUNDED' | 'GENERAL';
  concept?: GroundedTutorConcept | null;
  learnerState?: ConceptMasteryItem['state'] | null;
  sources: GroundedTutorSource[];
  nextAction?: AdaptiveLearningAction | null;
  escalationRecommended: boolean;
  provider: string;
}

export interface TutorHistoryEvent {
  id: string;
  eventType: 'CHAT' | 'ESCALATED' | 'DOUBT_AI_ANSWER';
  grounded: boolean;
  sourceCount: number;
  masteryState?: string | null;
  provider: string;
  doubtId?: string | null;
  conceptCode?: string | null;
  conceptName?: string | null;
  createdAt: string;
}

export interface TutorEscalationResult {
  id: string;
  status: string;
  title: string;
  origin: 'AI_TUTOR';
  concept?: GroundedTutorConcept | null;
}

export const chat = (
  message: string,
  history: readonly AIChatHistoryItem[] = [],
  conceptCode?: string | null,
) => api.post<ApiEnvelope<GroundedTutorResponse>>('/ai/chat', { message, history, conceptCode: conceptCode || null });

export const getTutorHistory = () =>
  api.get<ApiEnvelope<TutorHistoryEvent[]>>('/ai/history');

export const escalateTutorDoubt = (
  question: string,
  aiResponse: string,
  conceptCode?: string | null,
) => api.post<ApiEnvelope<TutorEscalationResult>>('/ai/escalate', {
  question,
  aiResponse,
  conceptCode: conceptCode || null,
});
