// services/contentService.js
import api from './api';

export const getSubjects      = (cls)           => api.get(`/content/subjects?class=${cls}`);
export const getChapters      = (subId, cls)    => api.get(`/content/subjects/${subId}/chapters?class=${cls}`);
export const getContentItems  = (chapId, lang)  => api.get(`/content/chapters/${chapId}/items?lang=${lang || 'hi'}`);
export const getContentUrl    = (itemId)        => api.get(`/content/items/${itemId}/url`);
export const markComplete     = (itemId)        => api.post(`/content/items/${itemId}/complete`);
export const getQuiz          = (itemId)        => api.get(`/content/items/${itemId}/quiz`);
export const submitQuiz       = (itemId, ans)   => api.post(`/content/items/${itemId}/quiz/submit`, { answers: ans });
export const downloadOffline  = (itemId)        => api.post(`/content/items/${itemId}/download`);
