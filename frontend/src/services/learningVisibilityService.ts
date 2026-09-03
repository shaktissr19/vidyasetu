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

export const getSchoolLearningTargets = () =>
  api.get<ApiEnvelope<LearningInsightTarget[]>>('/school/learning-insights/targets');

export const getSchoolLearningOverview = (classId: string, subjectCode: string) =>
  api.get<ApiEnvelope<TeacherLearningOverview>>('/school/learning-insights/overview', { params: { classId, subjectCode } });

export const getParentLearningInsight = (studentId: string) =>
  api.get<ApiEnvelope<ParentLearningInsight>>(`/parent/learning-insights/${studentId}`);
