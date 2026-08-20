import api from './api';
import type {
  ApiEnvelope,
  CompetitionExam,
  CompetitionLeaderboardRow,
  ExamAttempt,
  ExamAttemptResult,
} from '@/types/api';

type Payload = Record<string, unknown>;

export interface CompetitionResponseInput {
  questionId: string;
  selectedOption?: string | null;
}

export const listCompetitions = () => api.get<ApiEnvelope<CompetitionExam[]>>('/competition');
export const listMyExams = () => api.get<ApiEnvelope<CompetitionExam[]>>('/competition/mine/list');
export const registerExam = (examId: string) => api.post<ApiEnvelope<{ examId?: string; registered?: boolean }>>(`/competition/${examId}/register`);
export const startAttempt = (examId: string) => api.post<ApiEnvelope<ExamAttempt>>(`/competition/${examId}/start`);
export const submitAttempt = (attemptId: string, responses: readonly CompetitionResponseInput[]) =>
  api.post<ApiEnvelope<ExamAttemptResult>>(`/competition/attempts/${attemptId}/submit`, { responses });
export const getLeaderboard = (examId: string, page = 1) => api.get<ApiEnvelope<CompetitionLeaderboardRow[]>>(`/competition/${examId}/leaderboard?page=${page}`);
export const createExam = (data: Payload) => api.post<ApiEnvelope<CompetitionExam>>('/competition', data);
export const addQuestions = (examId: string, questions: readonly Payload[]) => api.post<ApiEnvelope<CompetitionExam>>(`/competition/${examId}/questions`, { questions });
export const updateExamStatus = (examId: string, status: string) => api.patch<ApiEnvelope<CompetitionExam>>(`/competition/${examId}/status`, { status });
