import api from './api';

export interface CompetitionResponseInput {
  questionId: string;
  selectedOption?: string | null;
}

export const listCompetitions = () => api.get('/competition');
export const listMyExams = () => api.get('/competition/mine/list');
export const registerExam = (examId: string) => api.post(`/competition/${examId}/register`);
export const startAttempt = (examId: string) => api.post(`/competition/${examId}/start`);
export const submitAttempt = (attemptId: string, responses: readonly CompetitionResponseInput[]) =>
  api.post(`/competition/attempts/${attemptId}/submit`, { responses });
export const getLeaderboard = (examId: string, page = 1) =>
  api.get(`/competition/${examId}/leaderboard?page=${page}`);
export const createExam = <T extends object>(data: T) => api.post('/competition', data);
export const addQuestions = <T extends object>(examId: string, questions: readonly T[]) =>
  api.post(`/competition/${examId}/questions`, { questions });
export const updateExamStatus = (examId: string, status: string) =>
  api.patch(`/competition/${examId}/status`, { status });
