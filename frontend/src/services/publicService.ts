import api from './api';
import type { ApiEnvelope } from '@/types/api';

export interface PublicOverview {
  students: number;
  schools: number;
  teachers: number;
  parents: number;
  groups: number;
  competitions: number;
  generatedAt: string;
}

export interface PublicCompetition {
  id: string;
  title: string;
  title_hi?: string | null;
  description?: string | null;
  type: 'OLYMPIAD' | 'MOCK' | 'PRACTICE';
  status: 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED' | 'LIVE' | 'SCORING' | 'COMPLETED';
  class_names?: string[] | null;
  subject_codes?: string[] | null;
  total_questions?: number | null;
  duration_mins?: number | null;
  registration_start?: string | null;
  registration_end?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  results_at?: string | null;
  prize_pool?: number | string | null;
  banner_url?: string | null;
}

export interface PublicSchool {
  id: string;
  name: string;
  nameHi?: string | null;
  board?: string | null;
  city?: string | null;
  district?: string | null;
  state: string;
  academicYear: string;
  website?: string | null;
  isUdiseLinked: boolean;
  students: number;
  teachers: number;
  classes: number;
}

export const getPublicOverview = () =>
  api.get<ApiEnvelope<PublicOverview>>('/public/overview');

export const getPublicCompetitions = () =>
  api.get<ApiEnvelope<PublicCompetition[]>>('/competition');

export const getPublicSchools = () =>
  api.get<ApiEnvelope<PublicSchool[]>>('/public/schools');
