import api from './api';
import type { ApiEnvelope } from '@/types/api';

export type ParentHomeworkStatus = 'PENDING' | 'SUBMITTED' | 'REVIEWED';

export interface ParentHomeworkItem {
  id: string;
  title: string;
  description: string;
  instructions?: string | null;
  attachment_url?: string | null;
  subject_code: string;
  subject_name?: string | null;
  subject_name_hi?: string | null;
  due_at: string;
  max_marks?: number | string | null;
  status: string;
  published_at?: string | null;
  class_name: string;
  section?: string | null;
  submission_id?: string | null;
  submission_status?: string | null;
  submitted_at?: string | null;
  marks_awarded?: number | string | null;
  feedback?: string | null;
  reviewed_at?: string | null;
  learner_status: ParentHomeworkStatus;
}

export interface ParentAchievementItem {
  exam_id: string;
  title: string;
  title_hi?: string | null;
  type: string;
  status: string;
  subject_codes?: string[] | null;
  start_time?: string | null;
  end_time?: string | null;
  results_at?: string | null;
  total_questions?: number | string | null;
  marks_per_question?: number | string | null;
  max_marks?: number | string | null;
  registered_at?: string | null;
  attempt_id?: string | null;
  attempt_status?: string | null;
  started_at?: string | null;
  submitted_at?: string | null;
  total_marks?: number | string | null;
  correct_count?: number | string | null;
  wrong_count?: number | string | null;
  skipped_count?: number | string | null;
  percentile?: number | string | null;
  rank_school?: number | string | null;
  rank_overall?: number | string | null;
  percentage?: number | string | null;
}

export const getChildHomework = (studentId: string, status?: ParentHomeworkStatus | 'ALL') => {
  const suffix = status && status !== 'ALL' ? `?status=${status}` : '';
  return api.get<ApiEnvelope<ParentHomeworkItem[]>>(`/parent/children/${studentId}/homework${suffix}`);
};

export const getChildAchievements = (studentId: string) =>
  api.get<ApiEnvelope<ParentAchievementItem[]>>(`/parent/children/${studentId}/achievements`);
