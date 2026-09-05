import api from './api';
import type {
  ApiEnvelope,
  AttendanceRecord,
  AttendanceSummary,
  LeaderboardRow,
  OfflineDownload,
  ParentNotification,
  ReportCardData,
  StudentBadge,
  StudentDashboard,
  StudentProfile,
} from '@/types/api';

type Payload = Record<string, unknown>;

export interface StudentAttendanceData {
  records: AttendanceRecord[];
  summary: AttendanceSummary | null;
}

export interface StudentOfflineDownloadsData {
  items: OfflineDownload[];
  summary: { itemCount: number; totalSizeKb: number; totalSizeMb: number; syncedCount: number };
}

export interface LearningHomeResource {
  id: string;
  public_slug?: string | null;
  title: string;
  summary?: string | null;
  resource_type: string;
  category: string;
  subject_name?: string | null;
  source_name: string;
  progress_pct: number;
  is_completed: boolean;
  bookmarked: boolean;
}

export interface LearningHomeAssessment {
  id: string;
  public_slug?: string | null;
  title: string;
  summary?: string | null;
  assessment_type: string;
  time_limit_mins?: number | null;
  passing_pct: number;
  max_attempts?: number | null;
  subject_name?: string | null;
  question_count: number;
  total_marks: number;
  last_percentage?: number | null;
}

export interface ConceptMasteryItem {
  conceptId: string;
  code: string;
  name: string;
  nameHi?: string | null;
  nodeType: string;
  subjectCode: string;
  subjectName?: string | null;
  chapterCode?: string | null;
  chapterTitle?: string | null;
  state: 'NOT_STARTED' | 'LEARNING' | 'PRACTISING' | 'NEEDS_REVIEW' | 'MASTERED';
  exposurePct: number;
  resourceCompletionPct: number;
  practiceBestPct?: number | null;
  masteryPct?: number | null;
  practiceAttempts: number;
  masteryAttempts: number;
  needsReview: boolean;
}

export type DiagnosticConfidence = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type DiagnosticRetentionStatus = 'NOT_ASSESSED' | 'ACTIVE_LEARNING' | 'STABLE' | 'REVIEW_SOON' | 'REVIEW_DUE';
export type DiagnosticMisconceptionState = 'SUSPECTED' | 'ACTIVE' | 'RESOLVED';

export interface DiagnosticMisconception {
  concept_id: string;
  misconception_code: string;
  state: DiagnosticMisconceptionState;
  wrong_count: number;
  correct_count: number;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  resolved_at?: string | null;
}

export interface DiagnosticConceptProfile {
  conceptId: string;
  code: string;
  name: string;
  nameHi?: string | null;
  subjectCode: string;
  subjectName?: string | null;
  chapterTitle?: string | null;
  proficiencyScore: number;
  confidenceScore: number;
  confidenceLevel: DiagnosticConfidence;
  evidenceCount: number;
  correctEvidenceCount: number;
  diagnosticCount: number;
  practiceCount: number;
  masteryCount: number;
  retentionStatus: DiagnosticRetentionStatus;
  nextReviewAt?: string | null;
  dominantMisconceptionCode?: string | null;
  lastEvidenceAt?: string | null;
  lastMasteryAt?: string | null;
  misconceptions: DiagnosticMisconception[];
}

export interface StudentDiagnosticProfile {
  generatedAt: string;
  summary: {
    conceptsAssessed: number;
    reviewDue: number;
    activeMisconceptions: number;
    lowConfidence: number;
  };
  concepts: DiagnosticConceptProfile[];
}

export interface AdaptiveLearningTarget {
  kind: 'RESOURCE' | 'ASSESSMENT';
  id: string;
  publicSlug?: string | null;
  title: string;
  summary?: string | null;
  resourceType?: string | null;
  assessmentType?: string | null;
  evidenceRole?: 'DIAGNOSTIC' | 'PRACTICE' | 'MASTERY' | null;
  progressPct?: number | null;
  questionCount?: number | null;
  passingPct?: number | null;
  lastPercentage?: number | null;
}

export type AdaptiveLearningActionType =
  | 'CONTINUE_RESOURCE'
  | 'REVIEW_RESOURCE'
  | 'PRACTICE'
  | 'MASTERY_CHECK'
  | 'START_NEXT_CONCEPT'
  | 'QUICK_DIAGNOSTIC'
  | 'REPAIR_MISCONCEPTION'
  | 'SPACED_REVIEW'
  | 'REVIEW_PREREQUISITE';

export interface AdaptiveLearningAction {
  id: string;
  rank: number;
  urgency: 'HIGH' | 'FOCUS' | 'NEXT';
  actionType: AdaptiveLearningActionType;
  conceptId: string;
  conceptCode: string;
  conceptName: string;
  subjectCode: string;
  subjectName?: string | null;
  chapterTitle?: string | null;
  state: ConceptMasteryItem['state'];
  title: string;
  reason: string;
  estimatedMinutes: number;
  target: AdaptiveLearningTarget;
  diagnostic?: {
    proficiencyScore: number;
    confidenceScore: number;
    confidenceLevel: string;
    retentionStatus: string;
    misconceptionCode?: string | null;
  };
}

export interface AdaptiveLearningPlan {
  generatedAt: string;
  headline: string;
  summary: {
    learning: number;
    practising: number;
    needsReview: number;
    mastered: number;
    nextActions: number;
    estimatedMinutes: number;
    reviewDue?: number;
    activeMisconceptions?: number;
    lowConfidence?: number;
  };
  actions: AdaptiveLearningAction[];
}

export interface StudentLearningHome {
  learner: { studentId: string; className: number; gradeCode?: string; gradeLabel?: string; schoolName?: string | null; boardCode: string; boardName: string };
  progress: { started: number; completed: number; average_progress: number };
  recommendedResources: LearningHomeResource[];
  assessments: LearningHomeAssessment[];
  bookmarks: Array<{ id: string; public_slug?: string | null; title: string; category: string; created_at: string }>;
  recentAttempts: Array<{ id: string; assessment_id: string; title: string; status: string; percentage?: number | null; correct_count: number; wrong_count: number; skipped_count: number; submitted_at?: string | null; started_at: string }>;
  conceptMastery?: ConceptMasteryItem[];
  adaptivePlan?: AdaptiveLearningPlan;
}

export interface StudentLearningQuestion {
  id: string;
  public_code: string;
  prompt: string;
  prompt_hi?: string | null;
  question_type: string;
  difficulty: string;
  marks: number;
  marks_override?: number | null;
  options: Array<{ key: string; text: string; textHi?: string | null }>;
}

export interface StudentLearningAssessmentDetail {
  id: string;
  title: string;
  summary?: string | null;
  assessment_type: string;
  time_limit_mins?: number | null;
  passing_pct: number;
  max_attempts?: number | null;
  shuffle_questions: boolean;
  questions: StudentLearningQuestion[];
}

export interface LearningAttemptResult {
  id: string;
  assessment_id: string;
  status: string;
  score: number;
  max_score: number;
  percentage: number;
  correct_count: number;
  wrong_count: number;
  skipped_count: number;
  feedback: Array<{ questionId: string; correct: boolean | null; correctAnswer: unknown; explanation?: string | null; marksAwarded: number; maxMarks: number }>;
}

export const getProfileStatus = () => api.get<ApiEnvelope<{ complete?: boolean; profileComplete?: boolean; student?: StudentProfile }>>('/student/profile/status');
export const getProfileSetupOptions = () => api.get<ApiEnvelope<Record<string, unknown>>>('/student/profile/setup-options');
export const completeStudentProfile = (payload: Payload) => api.post<ApiEnvelope<{ message?: string; student: StudentProfile & { studentCode?: string | null; schoolLinkStatus?: string | null } }>>('/student/profile/complete', payload);
export const getDashboard = () => api.get<ApiEnvelope<StudentDashboard>>('/student/dashboard');
export const getAttendance = (year: string | number, month: string | number) => api.get<ApiEnvelope<StudentAttendanceData>>(`/student/attendance/${year}/${month}`);
export const getBadges = () => api.get<ApiEnvelope<StudentBadge[]>>('/student/badges');
export const getLeaderboard = (scope = 'class') => api.get<ApiEnvelope<LeaderboardRow[]>>(`/student/leaderboard?scope=${scope}`);
export const getReportCard = (term?: string | number | null, year?: string | number | null) => api.get<ApiEnvelope<ReportCardData>>('/student/report-card', { params: { term, year } });
export const markContentComplete = (itemId: string) => api.post<ApiEnvelope<{ completed?: boolean }>>(`/student/content/${itemId}/complete`);
export const getNotifications = () => api.get<ApiEnvelope<ParentNotification[]>>('/student/notifications');
export const markNotifRead = (id: string) => api.patch<ApiEnvelope<{ id?: string; is_read?: boolean; message?: string }>>(`/student/notifications/${id}/read`);
export const markAllNotificationsRead = () =>
  api.patch<ApiEnvelope<{ message?: string; updatedCount?: number }>>('/student/notifications/read-all');
export const getOfflineDownloads = () => api.get<ApiEnvelope<StudentOfflineDownloadsData>>('/student/offline-downloads');
export const removeOfflineDownload = (contentItemId: string) => api.delete<ApiEnvelope<{ removed?: boolean }>>(`/student/offline-downloads/${contentItemId}`);

export const getStudentLearningHome = () => api.get<ApiEnvelope<StudentLearningHome>>('/student/learning/home');
export const getStudentAdaptiveLearningPlan = () => api.get<ApiEnvelope<AdaptiveLearningPlan>>('/student/learning/adaptive-plan');
export const getStudentDiagnosticProfile = () => api.get<ApiEnvelope<StudentDiagnosticProfile>>('/student/learning/diagnostics/profile');
export const updateStudentLearningProgress = (resourceId: string, progressPct: number) =>
  api.patch<ApiEnvelope<{ resource_id: string; progress_pct: number; is_completed: boolean }>>(`/student/learning/resources/${resourceId}/progress`, { progressPct });
export const bookmarkLearningResource = (resourceId: string) => api.post<ApiEnvelope<{ bookmarked: boolean }>>(`/student/learning/resources/${resourceId}/bookmark`);
export const removeLearningResourceBookmark = (resourceId: string) => api.delete<ApiEnvelope<{ bookmarked: boolean }>>(`/student/learning/resources/${resourceId}/bookmark`);
export const getStudentLearningAssessments = () => api.get<ApiEnvelope<LearningHomeAssessment[]>>('/student/learning/assessments');
export const getStudentLearningAssessment = (assessmentId: string) => api.get<ApiEnvelope<StudentLearningAssessmentDetail>>(`/student/learning/assessments/${assessmentId}`);
export const startStudentLearningAssessment = (assessmentId: string) => api.post<ApiEnvelope<{ id: string; assessment_id: string; status: string; started_at: string }>>(`/student/learning/assessments/${assessmentId}/start`);
export const submitStudentLearningAssessment = (attemptId: string, answers: Array<{ questionId: string; answer: unknown }>, timeSpentSecs?: number) =>
  api.post<ApiEnvelope<LearningAttemptResult>>(`/student/learning/attempts/${attemptId}/submit`, { answers, timeSpentSecs });