import api from './api';
import type { ApiEnvelope } from '@/types/api';

export type LearningMasteryState = 'NOT_STARTED' | 'LEARNING' | 'PRACTISING' | 'NEEDS_REVIEW' | 'MASTERED';

export interface LearningInsightTarget {
  class_id: string;
  class_name: string;
  section?: string | null;
  subject_code: string;
  subject_name: string;
}

export interface LearningStateSummary {
  notStarted: number;
  learning: number;
  practising: number;
  needsReview: number;
  mastered: number;
}

export interface TeacherConceptInsight {
  conceptId: string;
  code: string;
  name: string;
  nameHi?: string | null;
  chapterCode?: string | null;
  chapterTitle?: string | null;
  summary: LearningStateSummary;
  averageMasteryPct?: number | null;
  mappedResourceCount: number;
  publishedResourceCount: number;
  mappedAssessmentCount: number;
  publishedAssessmentCount: number;
  learnerReady: boolean;
}

export interface TeacherStudentConceptState {
  conceptId: string;
  code: string;
  state: LearningMasteryState;
  resourceCompletionPct: number;
  practiceBestPct?: number | null;
  masteryPct?: number | null;
  needsReview: boolean;
}

export interface TeacherStudentLearningInsight {
  studentId: string;
  studentCode: string;
  rollNumber?: string | null;
  name: string;
  summary: LearningStateSummary;
  attentionRequired: boolean;
  concepts: TeacherStudentConceptState[];
}

export interface TeacherLearningOverview {
  scope: {
    classId: string;
    className: string;
    section?: string | null;
    subjectCode: string;
    studentCount: number;
    conceptCount: number;
  };
  summary: LearningStateSummary & {
    studentsNeedingReview: number;
    learnerReadyConcepts: number;
  };
  concepts: TeacherConceptInsight[];
  students: TeacherStudentLearningInsight[];
}

export interface TeacherDiagnosticOverview {
  scope: TeacherLearningOverview['scope'];
  summary: {
    studentsWithEvidence: number;
    lowConfidenceStudents: number;
    reviewDueStudents: number;
    activeMisconceptionStudents: number;
  };
  concepts: Array<{
    conceptId: string;
    code: string;
    name: string;
    nameHi?: string | null;
    averageProficiency?: number | null;
    averageConfidence?: number | null;
    studentsWithEvidence: number;
    lowConfidence: number;
    reviewDue: number;
    misconceptionSignals: number;
  }>;
  students: Array<{
    studentId: string;
    studentCode: string;
    name: string;
    evidenceConcepts: number;
    averageProficiency?: number | null;
    lowConfidenceConcepts: number;
    reviewDueConcepts: number;
    misconceptionConcepts: number;
  }>;
  misconceptionClusters: Array<{
    conceptId: string;
    misconceptionCode: string;
    affectedStudents: number;
    activeStudents: number;
    suspectedStudents: number;
  }>;
}

export interface ParentFocusConcept {
  conceptId: string;
  code: string;
  name: string;
  nameHi?: string | null;
  nodeType: string;
  subjectCode: string;
  subjectName?: string | null;
  chapterCode?: string | null;
  chapterTitle?: string | null;
  state: LearningMasteryState;
  exposurePct: number;
  resourceCompletionPct: number;
  practiceBestPct?: number | null;
  masteryPct?: number | null;
  practiceAttempts: number;
  masteryAttempts: number;
  needsReview: boolean;
}

export interface ParentNextLearningAction {
  rank: number;
  urgency: 'HIGH' | 'FOCUS' | 'NEXT';
  actionType: string;
  conceptCode: string;
  conceptName: string;
  subjectCode: string;
  subjectName?: string | null;
  title: string;
  reason: string;
  estimatedMinutes: number;
}

export interface ParentLearningInsight {
  student: {
    id: string;
    studentCode: string;
    name: string;
    className?: string | null;
    section?: string | null;
    schoolName?: string | null;
  };
  summary: LearningStateSummary;
  focusConcepts: ParentFocusConcept[];
  nextActions: ParentNextLearningAction[];
  headline: string;
}

export interface ParentDiagnosticInsight {
  student: ParentLearningInsight['student'];
  headline: string;
  summary: {
    conceptsAssessed: number;
    strongConcepts: number;
    needsSupport: number;
    reviewDue: number;
    misconceptionSignals: number;
  };
  guidance: string[];
  concepts: Array<{
    conceptId: string;
    proficiencyScore: number;
    confidenceScore: number;
    confidenceLevel: string;
    evidenceCount: number;
    retentionStatus: string;
    nextReviewAt?: string | null;
    hasMisconceptionSignal: boolean;
  }>;
  misconceptionSignals: Array<{
    conceptId: string;
    conceptCode: string;
    conceptName: string;
    conceptNameHi?: string | null;
    misconceptionCode: string;
    state: string;
  }>;
}

export const getSchoolLearningTargets = () =>
  api.get<ApiEnvelope<LearningInsightTarget[]>>('/school/learning-insights/targets');

export const getSchoolLearningOverview = (classId: string, subjectCode: string) =>
  api.get<ApiEnvelope<TeacherLearningOverview>>('/school/learning-insights/overview', { params: { classId, subjectCode } });

export const getSchoolDiagnosticOverview = (classId: string, subjectCode: string) =>
  api.get<ApiEnvelope<TeacherDiagnosticOverview>>('/school/learning-insights/diagnostics', { params: { classId, subjectCode } });

export const getParentLearningInsight = (studentId: string) =>
  api.get<ApiEnvelope<ParentLearningInsight>>(`/parent/learning-insights/${studentId}`);

export const getParentDiagnosticInsight = (studentId: string) =>
  api.get<ApiEnvelope<ParentDiagnosticInsight>>(`/parent/learning-insights/${studentId}/diagnostics`);