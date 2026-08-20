// services/aiService.js
import api from './api';
export const chat = (message, history) => api.post('/ai/chat', { message, history: history || [] });

// services/doubtService.js — appended below
