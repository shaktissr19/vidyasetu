import type { StudentDashboard, StudentProfile } from '@/types/api';

export type StudentNotify = (message: string) => void;
export type StudentSectionId =
  | 'dashboard'
  | 'subjects'
  | 'homework'
  | 'ai'
  | 'doubts'
  | 'exams'
  | 'groups'
  | 'attendance'
  | 'leave'
  | 'transport'
  | 'documents'
  | 'library'
  | 'school'
  | 'report'
  | 'notifications'
  | 'offline'
  | 'profile';
export type StudentGoSection = (id: StudentSectionId | string) => void;
export type RefreshStudentDashboard = () => Promise<unknown>;

export interface StudentSectionProps {
  dashboard?: StudentDashboard;
  student?: StudentProfile;
  notify: StudentNotify;
  goSection: StudentGoSection;
  refreshDashboard: RefreshStudentDashboard;
}

export interface StudentDashboardSectionProps extends StudentSectionProps {
  greeting: string;
}

export interface StudentChatMessage {
  role: 'assistant' | 'user';
  content: string;
}
