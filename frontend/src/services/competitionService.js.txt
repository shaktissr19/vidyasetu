// services/competitionService.js
import api from './api';

export const listCompetitions   = ()              => api.get('/competition');
export const registerExam       = (examId)        => api.post(`/competition/${examId}/register`);
export const startAttempt       = (examId)        => api.post(`/competition/${examId}/start`);
export const submitAttempt      = (attemptId, r)  => api.post(`/competition/attempts/${attemptId}/submit`, { responses: r });
export const getLeaderboard     = (examId, page)  => api.get(`/competition/${examId}/leaderboard?page=${page || 1}`);
export const createExam         = (data)          => api.post('/competition', data);
export const addQuestions       = (examId, qs)    => api.post(`/competition/${examId}/questions`, { questions: qs });
export const updateExamStatus   = (examId, st)    => api.patch(`/competition/${examId}/status`, { status: st });
