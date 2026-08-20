import api from './api';

export interface AIChatHistoryItem {
  role?: string;
  content?: string;
  [key: string]: unknown;
}

export const chat = (message: string, history: readonly AIChatHistoryItem[] = []) =>
  api.post('/ai/chat', { message, history });
