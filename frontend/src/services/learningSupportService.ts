import api from './api';
import type { ApiEnvelope } from '@/types/api';

export type InterventionPriority = 'HIGH' | 'FOCUS' | 'ROUTINE';
export type InterventionStatus = 'OPEN' | 'PARENT_ACKNOWLEDGED' | 'IN_PROGRESS' | 'PTM_REQUESTED' | 'RESOLVED' | 'CLOSED';

export interface InterventionStudent {
  id: string;
  intervention_id: string;
  student_id: string;
  status: 'ASSIGNED' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'REMOVED';
  parent_acknowledged_at?: string | null;
  parent_note?: string | null;
  outcome_note?: string | null;
  student_name?: string;
  student_code?: string;
}

export interface LearningIntervention {
  id: string;
  school_id: string;
  class_id: string;
  subject_code: string;
  concept_id?: string | null;
  teacher_id: string;
  title: string;
  reason: string;
  priority: InterventionPriority;
  status: InterventionStatus;
  evidence_snapshot?: Record<string, unknown>;
  action_plan?: {
    actionType?: string;
    instructions?: string;
    resourceId?: string | null;
    assessmentId?: string | null;
    estimatedMinutes?: number | null;
  };
  due_at?: string | null;
  outcome_note?: string | null;
  teacher_name?: string;
  concept_code?: string | null;
  concept_name?: string | null;
  concept_name_hi?: string | null;
  participant_count?: number | string;
  acknowledgement_count?: number | string;
  resolved_count?: number | string;
  community_group_id?: string | null;
  student_status?: string;
  parent_acknowledged_at?: string | null;
  parent_note?: string | null;
  students?: InterventionStudent[];
}

export interface TeacherAcademicWorkspace {
  scope: {
    classId: string;
    className: string;
    section?: string | null;
    subjectCode: string;
    subjectName: string;
    studentCount: number;
    conceptCount: number;
  };
  learning: {
    summary: { studentsNeedingReview: number; needsReview: number; practising: number; mastered: number; learnerReadyConcepts: number };
    concepts: Array<{ conceptId: string; code: string; name: string; nameHi?: string | null; summary: { needsReview: number; practising: number; mastered: number } }>;
    students: Array<{ studentId: string; studentCode: string; name: string; attentionRequired: boolean; summary: { needsReview: number; practising: number; learning: number; mastered: number }; concepts: Array<{ conceptId: string; code: string; state: string }> }>;
  };
  diagnostics: {
    summary: { studentsWithEvidence: number; lowConfidenceStudents: number; reviewDueStudents: number; activeMisconceptionStudents: number };
    concepts: Array<{ conceptId: string; code: string; name: string; averageProficiency?: number | null; averageConfidence?: number | null; lowConfidence: number; reviewDue: number; misconceptionSignals: number }>;
    students: Array<{ studentId: string; studentCode: string; name: string; averageProficiency?: number | null; lowConfidenceConcepts: number; reviewDueConcepts: number; misconceptionConcepts: number }>;
    misconceptionClusters: Array<{ conceptId: string; misconceptionCode: string; affectedStudents: number; activeStudents: number; suspectedStudents: number }>;
  };
  interventions: LearningIntervention[];
  actionSummary: { openInterventions: number; highPriority: number; parentAcknowledged: number; ptmRequested: number };
}

export interface ParentLearningSupport {
  student: { id: string; studentCode: string; name: string; className?: string | null; section?: string | null; schoolName?: string | null };
  weeklyBrief: string;
  learning: {
    headline: string;
    summary: { notStarted: number; learning: number; practising: number; needsReview: number; mastered: number };
    nextActions: Array<{ rank: number; urgency: string; actionType: string; conceptCode: string; conceptName: string; subjectCode: string; subjectName?: string | null; title: string; reason: string; estimatedMinutes: number }>;
  };
  diagnostics: {
    headline: string;
    summary: { conceptsAssessed: number; strongConcepts: number; needsSupport: number; reviewDue: number; misconceptionSignals: number };
    guidance: string[];
  };
  supportCards: Array<{ type: string; title: string; titleHi?: string | null; text: string }>;
  interventions: LearningIntervention[];
  interventionSummary: { active: number; awaitingAcknowledgement: number; ptmRequested: number; resolved: number };
}

export interface CreateInterventionPayload {
  classId: string;
  subjectCode: string;
  conceptId?: string | null;
  studentIds: string[];
  teacherId?: string | null;
  title: string;
  reason: string;
  priority?: InterventionPriority;
  dueAt?: string | null;
  actionPlan?: { actionType?: string; instructions?: string; resourceId?: string | null; assessmentId?: string | null; estimatedMinutes?: number | null } | null;
}

export const getTeacherAcademicWorkspace = (classId: string, subjectCode: string) =>
  api.get<ApiEnvelope<TeacherAcademicWorkspace>>('/school/learning-support/workspace', { params: { classId, subjectCode } });
export const createLearningIntervention = (payload: CreateInterventionPayload) =>
  api.post<ApiEnvelope<LearningIntervention>>('/school/learning-support/interventions', payload);
export const getLearningIntervention = (interventionId: string) =>
  api.get<ApiEnvelope<LearningIntervention>>(`/school/learning-support/interventions/${interventionId}`);
export const updateLearningIntervention = (interventionId: string, status: Exclude<InterventionStatus, 'OPEN'>, outcomeNote?: string) =>
  api.patch<ApiEnvelope<LearningIntervention>>(`/school/learning-support/interventions/${interventionId}`, { status, outcomeNote });
export const updateInterventionStudent = (interventionId: string, studentId: string, status: 'IN_PROGRESS' | 'RESOLVED' | 'REMOVED', outcomeNote?: string) =>
  api.patch<ApiEnvelope<InterventionStudent>>(`/school/learning-support/interventions/${interventionId}/students/${studentId}`, { status, outcomeNote });
export const createInterventionCommunity = (interventionId: string, name?: string) =>
  api.post<ApiEnvelope<Record<string, unknown>>>(`/school/learning-support/interventions/${interventionId}/community`, { name: name || null });

export const getParentLearningSupport = (studentId: string) =>
  api.get<ApiEnvelope<ParentLearningSupport>>(`/parent/learning-support/${studentId}`);
export const acknowledgeParentIntervention = (studentId: string, interventionId: string, note?: string) =>
  api.patch<ApiEnvelope<InterventionStudent>>(`/parent/learning-support/${studentId}/interventions/${interventionId}/acknowledge`, { note: note || null });
