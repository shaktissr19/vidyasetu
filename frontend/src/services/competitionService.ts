// services/competitionService.js
import api from './api';

export const listCompetitions = () => api.get('/competition');
export const listMyExams = () => api.get('/competition/mine/list');
export const registerExam = (examId) => api.post(`/competition/${examId}/register`);
export const startAttempt = (examId) => api.post(`/competition/${examId}/start`);
export const submitAttempt = (attemptId, responses) => api.post(`/competition/attempts/${attemptId}/submit`, { responses });
export const getLeaderboard = (examId, page = 1) => api.get(`/competition/${examId}/leaderboard?page=${page}`);
export const createExam = (data) => api.post('/competition', data);
export const addQuestions = (examId, questions) => api.post(`/competition/${examId}/questions`, { questions });
export const updateExamStatus = (examId, status) => api.patch(`/competition/${examId}/status`, { status });
