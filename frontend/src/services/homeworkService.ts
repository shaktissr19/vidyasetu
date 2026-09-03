import api from './api';
import type { ApiEnvelope } from '@/types/api';

export type HomeworkAssignmentStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';
export type HomeworkSubmissionStatus = 'SUBMITTED' | 'LATE' | 'REVIEWED' | 'RETURNED' | 'NOT_SUBMITTED';

export interface StudentHomeworkItem {
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
  status: HomeworkAssignmentStatus;
  published_at?: string | null;
  class_name?: string | null;
  section?: string | null;
  submission_id?: string | null;
  submission_status?: HomeworkSubmissionStatus | null;
  submitted_at?: string | null;
  marks_awarded?: number | string | null;
  feedback?: string | null;
  reviewed_at?: string | null;
  learner_status?: 'PENDING' | 'SUBMITTED' | 'REVIEWED';
  answer_text?: string | null;
  submission_attachment_url?: string | null;
}

export interface SchoolHomeworkItem extends StudentHomeworkItem {
  class_id: string;
  created_by_name?: string | null;
  closed_at?: string | null;
  created_at: string;
  submitted_count: number;
  reviewed_count: number;
  class_student_count: number;
}

export interface HomeworkSubmissionRow {
  student_id: string;
  student_code?: string | null;
  student_name: string;
  submission_id?: string | null;
  answer_text?: string | null;
  attachment_url?: string | null;
  submission_status: HomeworkSubmissionStatus;
  submitted_at?: string | null;
  marks_awarded?: number | string | null;
  feedback?: string | null;
  reviewed_at?: string | null;
}

export interface HomeworkSubmissionsData {
  assignment: {
    id: string;
    school_id: string;
    class_id: string;
    subject_code: string;
    title: string;
    due_at: string;
    max_marks?: number | string | null;
    status: HomeworkAssignmentStatus;
  };
  students: HomeworkSubmissionRow[];
}

export interface HomeworkDraftPayload {
  classId: string;
  subjectCode: string;
  title: string;
  description: string;
  instructions?: string | null;
  attachmentUrl?: string | null;
  dueAt: string;
  maxMarks?: number | null;
}

export const getStudentHomework = (status?: string) =>
  api.get<ApiEnvelope<StudentHomeworkItem[]>>('/student/homework', { params: status ? { status } : undefined });
export const getStudentHomeworkDetail = (homeworkId: string) =>
  api.get<ApiEnvelope<StudentHomeworkItem>>(`/student/homework/${homeworkId}`);
export const submitStudentHomework = (homeworkId: string, payload: { answerText?: string | null; attachmentUrl?: string | null }) =>
  api.post<ApiEnvelope<Record<string, unknown>>>(`/student/homework/${homeworkId}/submit`, payload);

export const getSchoolHomework = (status?: string) =>
  api.get<ApiEnvelope<SchoolHomeworkItem[]>>('/school/homework', { params: status ? { status } : undefined });
export const createSchoolHomework = (payload: HomeworkDraftPayload) =>
  api.post<ApiEnvelope<SchoolHomeworkItem>>('/school/homework', payload);
export const updateSchoolHomework = (homeworkId: string, payload: Partial<HomeworkDraftPayload>) =>
  api.patch<ApiEnvelope<SchoolHomeworkItem>>(`/school/homework/${homeworkId}`, payload);
export const publishSchoolHomework = (homeworkId: string) =>
  api.post<ApiEnvelope<SchoolHomeworkItem>>(`/school/homework/${homeworkId}/publish`);
export const closeSchoolHomework = (homeworkId: string) =>
  api.post<ApiEnvelope<SchoolHomeworkItem>>(`/school/homework/${homeworkId}/close`);
export const getHomeworkSubmissions = (homeworkId: string) =>
  api.get<ApiEnvelope<HomeworkSubmissionsData>>(`/school/homework/${homeworkId}/submissions`);
export const reviewHomeworkSubmission = (
  homeworkId: string,
  submissionId: string,
  payload: { marksAwarded?: number | null; feedback?: string | null; returnForRevision?: boolean },
) => api.patch<ApiEnvelope<Record<string, unknown>>>(
  `/school/homework/${homeworkId}/submissions/${submissionId}/review`,
  payload,
);
